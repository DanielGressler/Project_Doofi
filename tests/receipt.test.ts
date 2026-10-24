import { expect, it } from "vitest";
import { env } from "cloudflare:workers";
import {
  createOrder,
  customerAction,
  issueIntent,
  ownedOrderSnapshot,
  publicStatus,
  transition,
} from "../src/lib/orders";
import { handleApi } from "../src/lib/api";
import type { Session } from "../src/lib/types";
import type { D1PreparedStatement } from "@cloudflare/workers-types";

const owner: Session = {
  store_id: "store-a",
  user_id: "user-a",
  role: "owner",
  csrf_token: "test",
  token_hash: "test",
  email: "forno@demo.doofi.test",
};
async function make(ready = true) {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  const order = await createOrder(env.DB, "casa-do-forno", {
    intent,
    items: [{ productId: "a-pao", quantity: 1 }],
    fulfillment: "PICKUP",
    payment: "PIX_SIMULATED",
    name: "Cliente Teste",
    phone: "00000000",
    email: "teste@exemplo.invalid",
    consent: true,
    syntheticData: true,
    received_at: 1,
  });
  if (ready) {
    await transition(env.DB, owner, order.id, {
      status: "ACCEPTED",
      version: 0,
    });
    await transition(env.DB, owner, order.id, { status: "READY", version: 1 });
  }
  return order;
}
async function confirm(token: string, database = env.DB) {
  const current = await publicStatus(env.DB, token);
  return customerAction(database, token, "confirm-receipt", {
    nonce: current.actionNonce,
    version: current.version,
  });
}
it("HTTP registra recebimento uma vez, sem concluir nem confirmar pagamento; replay não duplica evento", async () => {
  const order = await make();
  const current = await publicStatus(env.DB, order.token);
  expect(current.received_at).toBeNull();
  const request = () =>
    new Request(
      `http://localhost/api/v1/pedidos/${order.token}/confirm-receipt`,
      {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          nonce: current.actionNonce,
          version: current.version,
          store_id: "store-b",
        }),
      },
    );
  const response = await handleApi(request(), env.DB, "local-demo");
  expect(response.status).toBe(200);
  const received = (await response.json()) as {
    received_at: number;
    version: number;
  };
  expect(received.received_at).toBeGreaterThan(0);
  expect(received.version).toBe(3);
  expect((await handleApi(request(), env.DB, "local-demo")).status).toBe(200);
  const fresh = await publicStatus(env.DB, order.token);
  expect(fresh).toMatchObject({
    status: "READY",
    version: 3,
    received_at: received.received_at,
  });
  expect(fresh.payment.status).toBe("SIMULATED_NOT_COLLECTED");
  expect(
    fresh.events.filter(
      (event) => event.action === "CUSTOMER_RECEIPT_CONFIRMED",
    ),
  ).toHaveLength(1);
  expect(
    (await ownedOrderSnapshot(env.DB, owner, order.id)).order.received_at,
  ).toBe(received.received_at);
  await expect(
    ownedOrderSnapshot(env.DB, { ...owner, store_id: "store-b" }, order.id),
  ).rejects.toMatchObject({ status: 404 });
});
it("outro link, origem externa e confirmação antes de pronto não autorizam recebimento", async () => {
  const order = await make(false),
    other = await make();
  const first = await publicStatus(env.DB, order.token),
    second = await publicStatus(env.DB, other.token);
  await expect(
    customerAction(env.DB, order.token, "confirm-receipt", {
      version: first.version,
      nonce: second.actionNonce,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(confirm(order.token)).rejects.toMatchObject({
    code: "RECEIPT_NOT_AVAILABLE",
  });
  expect(
    (
      await handleApi(
        new Request(
          `http://localhost/api/v1/pedidos/${other.token}/confirm-receipt`,
          {
            method: "POST",
            headers: {
              origin: "http://outside.test",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              version: second.version,
              nonce: second.actionNonce,
            }),
          },
        ),
        env.DB,
        "local-demo",
      )
    ).status,
  ).toBe(403);
  expect((await publicStatus(env.DB, other.token)).received_at).toBeNull();
});
it("duas confirmações concorrentes geram um único fato e preservam o bloqueio por versão", async () => {
  const order = await make();
  const current = await publicStatus(env.DB, order.token);
  const results = await Promise.allSettled(
    Array.from({ length: 2 }, () =>
      customerAction(env.DB, order.token, "confirm-receipt", {
        version: current.version,
        nonce: current.actionNonce,
      }),
    ),
  );
  expect(results.some((result) => result.status === "fulfilled")).toBe(true);
  expect((await publicStatus(env.DB, order.token)).version).toBe(3);
  await expect(
    transition(env.DB, owner, order.id, { status: "COMPLETED", version: 2 }),
  ).rejects.toMatchObject({ status: 409 });
  await transition(env.DB, owner, order.id, {
    status: "COMPLETED",
    version: 3,
  });
});
it("falha de auditoria reverte recebimento e mantém conclusão bloqueada", async () => {
  const order = await make();
  await env.DB.exec(
    "CREATE TRIGGER reject_receipt BEFORE INSERT ON audit_events WHEN NEW.action='CUSTOMER_RECEIPT_CONFIRMED' BEGIN SELECT RAISE(ABORT,'receipt test failure'); END;",
  );
  await expect(confirm(order.token)).rejects.toThrow();
  expect(await publicStatus(env.DB, order.token)).toMatchObject({
    received_at: null,
    version: 2,
  });
  await expect(
    transition(env.DB, owner, order.id, { status: "COMPLETED", version: 2 }),
  ).rejects.toMatchObject({ code: "RECEIPT_REQUIRED" });
});
it.each(["token_revoked=1", "token_expires_at=1"])(
  "revalida link no commit: %s",
  async (change) => {
    const order = await make();
    const database = new Proxy(env.DB, {
      get(db, property) {
        if (property === "batch")
          return async (statements: D1PreparedStatement[]) => {
            await db
              .prepare(`UPDATE orders SET ${change} WHERE id=?`)
              .bind(order.id)
              .run();
            return db.batch(statements);
          };
        const value = Reflect.get(db, property);
        return typeof value === "function" ? value.bind(db) : value;
      },
    });
    await expect(confirm(order.token, database)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (await ownedOrderSnapshot(env.DB, owner, order.id)).order,
    ).toMatchObject({ received_at: null, version: 2 });
  },
);
it("recebimento continua válido fora dos 100 eventos exibidos e não depende da auditoria de outra empresa", async () => {
  const order = await make();
  await env.DB.prepare(
    "INSERT INTO audit_events VALUES ('foreign-receipt','store-b','guest','CUSTOMER_RECEIPT_CONFIRMED',?,'{}','test',unixepoch())",
  )
    .bind(order.id)
    .run();
  expect((await publicStatus(env.DB, order.token)).received_at).toBeNull();
  await expect(
    transition(env.DB, owner, order.id, { status: "COMPLETED", version: 2 }),
  ).rejects.toMatchObject({ code: "RECEIPT_REQUIRED" });
  const received = await confirm(order.token);
  await env.DB.batch(
    Array.from({ length: 105 }, (_, index) =>
      env.DB.prepare(
        "INSERT INTO audit_events VALUES (?, 'store-a','guest','PAYMENT_DECLARED',?,'{}','test',unixepoch()+1)",
      ).bind(`later-${index}`, order.id),
    ),
  );
  const fresh = await publicStatus(env.DB, order.token);
  expect(fresh.events).toHaveLength(100);
  expect(
    fresh.events.some((event) => event.action === "CUSTOMER_RECEIPT_CONFIRMED"),
  ).toBe(false);
  expect(fresh.received_at).toBe(received.received_at);
  await transition(env.DB, owner, order.id, {
    status: "COMPLETED",
    version: fresh.version,
  });
});
it("pedido cancelado não aceita recebimento e pedidos antigos concluídos não são reabertos", async () => {
  const order = await make();
  await transition(env.DB, owner, order.id, {
    status: "CANCELLED",
    version: 2,
    reason: "Cancelamento fictício",
  });
  await expect(confirm(order.token)).rejects.toMatchObject({
    code: "RECEIPT_NOT_AVAILABLE",
  });
  await env.DB.prepare("UPDATE orders SET status='COMPLETED' WHERE id=?")
    .bind(order.id)
    .run();
  await expect(confirm(order.token)).rejects.toMatchObject({
    code: "RECEIPT_NOT_AVAILABLE",
  });
  expect((await publicStatus(env.DB, order.token)).status).toBe("COMPLETED");
});
