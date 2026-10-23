import { describe, it, expect } from "vitest";
import { env } from "cloudflare:workers";
import {
  createOrder,
  issueIntent,
  publicStatus,
  transition,
  proposeQuote,
  customerAction,
  confirmSimulatedPayment,
} from "../src/lib/orders";
import { handleApi } from "../src/lib/api";
import { saveProduct } from "../src/lib/catalog";
import type { Session } from "../src/lib/types";

const a: Session = {
  store_id: "store-a",
  user_id: "user-a",
  role: "owner",
  csrf_token: "test",
  token_hash: "test",
  email: "forno@demo.doofi.test",
};
const b: Session = { ...a, store_id: "store-b", user_id: "user-b" };
const payload = (intent: string, extra: Record<string, unknown> = {}) => ({
  intent,
  items: [
    { productId: "a-pao", quantity: 2 },
    { productId: "a-cafe", quantity: 1 },
  ],
  name: "Cliente Exemplo",
  phone: "(00) 00000-0000",
  email: "cliente@exemplo.invalid",
  note: "Somente teste",
  fulfillment: "PICKUP",
  payment: "PIX_SIMULATED",
  consent: true,
  syntheticData: true,
  ...extra,
});
async function make(extra: Record<string, unknown> = {}) {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  return createOrder(env.DB, "casa-do-forno", payload(intent, extra));
}
const row = (id: string) =>
  env.DB.prepare("SELECT * FROM orders WHERE id=?")
    .bind(id)
    .first<{ version: number; status: string; total: number | null }>();

describe("Checkout íntegro", () => {
  it("10 reenvios concorrentes criam um pedido, dois itens e um evento", async () => {
    const { intent } = await issueIntent(env.DB, "casa-do-forno");
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        createOrder(
          env.DB,
          "casa-do-forno",
          payload(intent, { total: 1, price: 1, store_id: "store-b" }),
        ),
      ),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(new Set(results.map((r) => r.token)).size).toBe(1);
    const order = await publicStatus(env.DB, results[0].token);
    expect(order.subtotal).toBe(5600);
    expect(order.total).toBe(5600);
    expect(
      order.events.filter((e) => e.action === "ORDER_CREATED"),
    ).toHaveLength(1);
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(1);
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM order_items").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(2);
  });
  it("mesma chave com dados diferentes retorna conflito", async () => {
    const { intent } = await issueIntent(env.DB, "casa-do-forno");
    await createOrder(env.DB, "casa-do-forno", payload(intent));
    await expect(
      createOrder(
        env.DB,
        "casa-do-forno",
        payload(intent, { name: "Outro Cliente" }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("bloqueia carrinho misto, quantidades e produto indisponível", async () => {
    await expect(
      make({ items: [{ productId: "b-bowl", quantity: 1 }] }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      make({ items: [{ productId: "a-pao", quantity: 0 }] }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      make({ items: [{ productId: "a-pao", quantity: 1.5 }] }),
    ).rejects.toMatchObject({ status: 422 });
    await env.DB.prepare(
      "UPDATE products SET available=0 WHERE id='a-pao'",
    ).run();
    await expect(make()).rejects.toMatchObject({ status: 422 });
  });
  it("valida fechamento da loja e região de entrega", async () => {
    await expect(
      make({
        fulfillment: "FIXED",
        address: "Rua de Teste, 10",
        neighborhood: "Fora da região",
        postalCode: "00000000",
      }),
    ).rejects.toMatchObject({ status: 422 });
    await env.DB.prepare(
      "UPDATE stores SET is_open=0 WHERE id='store-a'",
    ).run();
    await expect(make()).rejects.toMatchObject({ status: 422 });
  });
  it("congela preço e mantém replay mesmo após alteração de catálogo", async () => {
    const { intent } = await issueIntent(env.DB, "casa-do-forno");
    const order = await createOrder(env.DB, "casa-do-forno", payload(intent));
    await saveProduct(
      env.DB,
      a,
      {
        title: "Pão novo",
        description: "Descrição fictícia",
        category: "Do forno",
        price: 3000,
        available: true,
        version: 0,
      },
      "a-pao",
    );
    expect((await publicStatus(env.DB, order.token)).total).toBe(5600);
    expect(
      (await createOrder(env.DB, "casa-do-forno", payload(intent))).id,
    ).toBe(order.id);
    expect((await publicStatus(env.DB, (await make()).token)).total).toBe(6800);
  });
  it("falha de auditoria reverte pedido, itens e pagamento no D1", async () => {
    await env.DB.exec(
      "CREATE TRIGGER reject_create BEFORE INSERT ON audit_events WHEN NEW.action='ORDER_CREATED' BEGIN SELECT RAISE(ABORT,'test audit failure'); END;",
    );
    await expect(make()).rejects.toThrow();
    for (const table of ["orders", "order_items", "payment_records"])
      expect(
        (
          await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{
            n: number;
          }>()
        )?.n,
      ).toBe(0);
  });
});
describe("Jornadas e isolamento", () => {
  it("J1: retirada percorre aceite, preparo, pronto e conclusão", async () => {
    const o = await make();
    for (const status of ["ACCEPTED", "PREPARING", "READY", "COMPLETED"])
      await transition(env.DB, a, o.id, {
        version: (await row(o.id))!.version,
        status,
      });
    expect((await publicStatus(env.DB, o.token)).status).toBe("COMPLETED");
    await expect(
      transition(env.DB, a, o.id, { version: 4, status: "ACCEPTED" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("J2: entrega fixa calcula frete e rejeita estado de retirada", async () => {
    const o = await make({
      fulfillment: "FIXED",
      address: "Rua Fictícia, 1",
      neighborhood: "Centro",
      postalCode: "00000-000",
    });
    expect((await publicStatus(env.DB, o.token)).total).toBe(6200);
    await transition(env.DB, a, o.id, { version: 0, status: "ACCEPTED" });
    await transition(env.DB, a, o.id, { version: 1, status: "PREPARING" });
    await expect(
      transition(env.DB, a, o.id, { version: 2, status: "READY" }),
    ).rejects.toMatchObject({ status: 409 });
    await transition(env.DB, a, o.id, {
      version: 2,
      status: "OUT_FOR_DELIVERY",
    });
    await transition(env.DB, a, o.id, { version: 3, status: "COMPLETED" });
  });
  it("J3: cotação exige comprador e lojista antes de simular Pix", async () => {
    const o = await make({
      fulfillment: "QUOTE",
      address: "Rua Fictícia, 1",
      neighborhood: "Centro",
      postalCode: "00000000",
    });
    let s = await publicStatus(env.DB, o.token);
    expect(s.total).toBeNull();
    expect(s.delivery_fee).toBeNull();
    await expect(
      confirmSimulatedPayment(env.DB, a, o.id, { version: 0 }),
    ).rejects.toMatchObject({ status: 409 });
    await proposeQuote(env.DB, a, o.id, {
      version: 0,
      fee: 900,
      estimate: "Até 45 minutos",
      validMinutes: 30,
    });
    s = await publicStatus(env.DB, o.token);
    expect(s.total).toBeNull();
    await expect(
      customerAction(env.DB, o.token, "declare-payment", {
        version: s.version,
        nonce: s.actionNonce,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await customerAction(env.DB, o.token, "accept-quote", {
      version: s.version,
      quoteVersion: s.quote!.version,
      nonce: s.actionNonce,
    });
    s = await publicStatus(env.DB, o.token);
    expect(s.total).toBe(6500);
    expect(s.status).toBe("QUOTE_ACCEPTED");
    await expect(
      customerAction(env.DB, o.token, "declare-payment", {
        version: s.version,
        nonce: s.actionNonce,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await transition(env.DB, a, o.id, {
      version: s.version,
      status: "ACCEPTED",
    });
    s = await publicStatus(env.DB, o.token);
    await customerAction(env.DB, o.token, "declare-payment", {
      version: s.version,
      nonce: s.actionNonce,
    });
    s = await publicStatus(env.DB, o.token);
    expect(s.payment.status).toBe("SIMULATED_CUSTOMER_DECLARED");
    await confirmSimulatedPayment(env.DB, a, o.id, { version: s.version });
    expect((await publicStatus(env.DB, o.token)).payment.status).toBe(
      "SIMULATED_SELLER_CONFIRMED",
    );
  });
  it("cotação substituída ou expirada não pode ser aceita", async () => {
    const o = await make({
      fulfillment: "QUOTE",
      address: "Rua Fictícia, 1",
      neighborhood: "Centro",
      postalCode: "00000000",
    });
    await proposeQuote(env.DB, a, o.id, {
      version: 0,
      fee: 500,
      estimate: "30 minutos",
      validMinutes: 10,
    });
    const old = await publicStatus(env.DB, o.token);
    await proposeQuote(env.DB, a, o.id, {
      version: 1,
      fee: 700,
      estimate: "40 minutos",
      validMinutes: 10,
    });
    await expect(
      customerAction(env.DB, o.token, "accept-quote", {
        version: old.version,
        quoteVersion: 1,
        nonce: old.actionNonce,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await env.DB.prepare(
      "UPDATE delivery_quotes SET expires_at=1 WHERE order_id=?",
    )
      .bind(o.id)
      .run();
    const latest = await publicStatus(env.DB, o.token);
    await expect(
      customerAction(env.DB, o.token, "accept-quote", {
        version: latest.version,
        quoteVersion: 2,
        nonce: latest.actionNonce,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("A não altera pedido de B e gera auditoria da negativa", async () => {
    const o = await make();
    await expect(
      transition(env.DB, b, o.id, { version: 0, status: "ACCEPTED" }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await row(o.id))?.status).toBe("PENDING");
    expect(
      await env.DB.prepare(
        "SELECT id FROM audit_events WHERE store_id='store-b' AND action='ACCESS_DENIED'",
      ).first(),
    ).not.toBeNull();
  });
  it("CAS concorrente permite uma única transição e auditoria", async () => {
    const o = await make();
    const results = await Promise.allSettled([
      transition(env.DB, a, o.id, { version: 0, status: "ACCEPTED" }),
      transition(env.DB, a, o.id, {
        version: 0,
        status: "REJECTED",
        reason: "Teste",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM audit_events WHERE entity_id=? AND action='ORDER_TRANSITION'",
        )
          .bind(o.id)
          .first<{ n: number }>()
      )?.n,
    ).toBe(1);
  });
  it("falha em auditoria reverte transição e impede apagar eventos", async () => {
    const o = await make();
    await env.DB.exec(
      "CREATE TRIGGER reject_transition BEFORE INSERT ON audit_events WHEN NEW.action='ORDER_TRANSITION' BEGIN SELECT RAISE(ABORT,'test audit failure'); END;",
    );
    await expect(
      transition(env.DB, a, o.id, { version: 0, status: "ACCEPTED" }),
    ).rejects.toThrow();
    expect((await row(o.id))?.status).toBe("PENDING");
    await expect(
      env.DB.prepare("DELETE FROM audit_events").run(),
    ).rejects.toThrow();
  });
  it("declaração após recusa não reativa o pedido nem confirma pagamento", async () => {
    const o = await make();
    await transition(env.DB, a, o.id, {
      version: 0,
      status: "REJECTED",
      reason: "Teste de recusa",
    });
    const s = await publicStatus(env.DB, o.token);
    await customerAction(env.DB, o.token, "declare-payment", {
      version: s.version,
      nonce: s.actionNonce,
    });
    const updated = await publicStatus(env.DB, o.token);
    expect(updated.status).toBe("REJECTED");
    expect(updated.payment.status).toBe("SIMULATED_LATE_DECLARATION");
  });
  it("consulta pública não expõe PII, hashes internos ou endereço do comprador", async () => {
    const o = await make({
      fulfillment: "FIXED",
      address: "Rua Privada Fictícia, 7",
      neighborhood: "Centro",
      postalCode: "00000000",
    });
    const s = await publicStatus(env.DB, o.token);
    const encoded = JSON.stringify(s);
    for (const value of [
      "Cliente Exemplo",
      "cliente@exemplo.invalid",
      "Rua Privada Fictícia",
      "public_token_hash",
      "request_hash",
      "intent_hash",
    ])
      expect(encoded).not.toContain(value);
    await env.DB.prepare("UPDATE orders SET token_revoked=1 WHERE id=?")
      .bind(o.id)
      .run();
    await expect(publicStatus(env.DB, o.token)).rejects.toMatchObject({
      status: 404,
    });
  });
});
describe("Borda HTTP", () => {
  it("bloqueia origem externa, falta de login e modo público", async () => {
    expect(
      (
        await handleApi(
          new Request("http://localhost/api/v1/login", {
            method: "POST",
            headers: { origin: "https://attacker.invalid" },
          }),
          env.DB,
          "local-demo",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleApi(
          new Request("http://localhost/api/v1/painel/pedidos"),
          env.DB,
          "local-demo",
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleApi(
          new Request("https://public.example/api/v1/health"),
          env.DB,
          "local-demo",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleApi(
          new Request("http://localhost/api/v1/health"),
          env.DB,
          "production",
        )
      ).status,
    ).toBe(403);
  });
  it("login tem limite de tentativas com resposta 429", async () => {
    let status = 0;
    for (let i = 0; i < 11; i++)
      status = (
        await handleApi(
          new Request("http://localhost/api/v1/login", {
            method: "POST",
            headers: {
              origin: "http://localhost",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              email: "missing@demo.doofi.test",
              password: "wrong",
            }),
          }),
          env.DB,
          "local-demo",
        )
      ).status;
    expect(status).toBe(429);
  });
});
