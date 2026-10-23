import { it, expect } from "vitest";
import { env } from "cloudflare:workers";
import { handleApi } from "../src/lib/api";

async function call(
  path: string,
  data?: unknown,
  options: {
    method?: string;
    cookie?: string;
    csrf?: string;
    origin?: string;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (data !== undefined) {
    headers["content-type"] = "application/json";
    headers.origin = options.origin ?? "http://localhost";
  }
  if (options.cookie) headers.cookie = options.cookie;
  if (options.csrf) headers["x-csrf-token"] = options.csrf;
  return handleApi(
    new Request(`http://localhost/api/v1/${path}`, {
      method: options.method ?? (data === undefined ? "GET" : "POST"),
      headers,
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    env.DB,
    "local-demo",
  );
}
async function auth(email = "forno") {
  const response = await call("login", {
    email: `${email}@demo.doofi.test`,
    password: "demo-doofi-P1!",
  });
  const result = (await response.json()) as { csrfToken: string };
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    csrf: result.csrfToken,
  };
}
async function order(
  slug = "casa-do-forno",
  productId = "a-pao",
  extra: Record<string, unknown> = {},
) {
  const { intent } = (await (
    await call(`lojas/${slug}/intent`, {})
  ).json()) as { intent: string };
  const response = await call(`lojas/${slug}/pedidos`, {
    intent,
    items: [{ productId, quantity: 1 }],
    fulfillment: "PICKUP",
    payment: "PIX_SIMULATED",
    name: "Comprador Fictício",
    contact: "teste@exemplo.invalid",
    consent: true,
    syntheticData: true,
    ...extra,
  });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; token: string };
}
it("API · loja A não lê nem altera pedido, catálogo ou auditoria de B", async () => {
  const b = await order("verde-mesa", "b-bowl");
  const a = await auth();
  for (const suffix of ["", "/auditoria"])
    expect(
      (await call(`painel/pedidos/${b.id}${suffix}`, undefined, a)).status,
    ).toBe(404);
  expect(
    (
      await call(
        `painel/pedidos/${b.id}/transicoes`,
        { version: 0, status: "ACCEPTED" },
        a,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await call(
        "painel/produtos/b-bowl",
        {
          title: "Teste",
          description: "Fictício",
          category: "Teste",
          price: 100,
          available: true,
          version: 0,
        },
        { ...a, method: "PATCH" },
      )
    ).status,
  ).toBe(404);
  const rows = await (await call("painel/pedidos", undefined, a)).json();
  expect(rows).toEqual([]);
  const overview = (await (
    await call("painel/visao-geral?storeId=store-b", undefined, a)
  ).json()) as { orders: unknown[]; summary: { total_orders: number } };
  expect(overview.orders).toEqual([]);
  expect(overview.summary.total_orders).toBe(0);
});
it("API · mutação exige CSRF e cookie; logout revoga imediatamente", async () => {
  const o = await order();
  const a = await auth();
  expect(
    (
      await call(
        `painel/pedidos/${o.id}/transicoes`,
        { version: 0, status: "ACCEPTED" },
        { cookie: a.cookie },
      )
    ).status,
  ).toBe(403);
  expect((await call("logout", {}, a)).status).toBe(200);
  expect((await call("painel/pedidos", undefined, a)).status).toBe(401);
});
it("API · associação inativa impede acesso mesmo com cookie válido", async () => {
  const a = await auth();
  await env.DB.prepare(
    "UPDATE store_memberships SET active=0 WHERE user_id='user-a'",
  ).run();
  expect((await call("painel/catalogo", undefined, a)).status).toBe(401);
});
it("API · rejeita JSON inválido e payload maior que 16 KiB", async () => {
  for (const [data, status] of [
    ["{", 422],
    ["x".repeat(17000), 413],
  ] as const) {
    const r = await handleApi(
      new Request("http://localhost/api/v1/login", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          "content-type": "application/json",
        },
        body: data,
      }),
      env.DB,
      "local-demo",
    );
    expect(r.status).toBe(status);
  }
});
it("API · token expirado retorna 404 e não expõe dados", async () => {
  const o = await order();
  await env.DB.prepare("UPDATE orders SET token_expires_at=1 WHERE id=?")
    .bind(o.id)
    .run();
  const response = await call(`pedidos/${o.token}`);
  expect(response.status).toBe(404);
  expect(JSON.stringify(await response.json())).not.toContain(
    "Comprador Fictício",
  );
});
it("API · rejeitar cotação cancela sem fechar total nem pagamento", async () => {
  const o = await order("casa-do-forno", "a-pao", {
    fulfillment: "QUOTE",
    address: "Rua Fictícia, 12",
    neighborhood: "Centro",
    postalCode: "00000000",
  });
  const a = await auth();
  expect(
    (
      await call(
        `painel/pedidos/${o.id}/cotacao`,
        { version: 0, fee: 700, estimate: "Em 30 minutos", validMinutes: 20 },
        a,
      )
    ).status,
  ).toBe(200);
  const current = (await (await call(`pedidos/${o.token}`)).json()) as {
    version: number;
    actionNonce: string;
    quote: { version: number };
  };
  expect(
    (
      await call(`pedidos/${o.token}/reject-quote`, {
        version: current.version,
        nonce: current.actionNonce,
        quoteVersion: current.quote.version,
      })
    ).status,
  ).toBe(200);
  const final = (await (await call(`pedidos/${o.token}`)).json()) as {
    status: string;
    total: number | null;
    payment: { status: string };
  };
  expect(final.status).toBe("CANCELLED");
  expect(final.total).toBeNull();
  expect(final.payment.status).toBe("SIMULATED_NOT_COLLECTED");
});
it("API · falha de auditoria também reverte conferência financeira simulada", async () => {
  const o = await order();
  const a = await auth();
  await call(
    `painel/pedidos/${o.id}/transicoes`,
    { version: 0, status: "ACCEPTED" },
    a,
  );
  await env.DB.exec(
    "CREATE TRIGGER deny_payment BEFORE INSERT ON audit_events WHEN NEW.action='PAYMENT_SIMULATED_CONFIRMED' BEGIN SELECT RAISE(ABORT,'test audit failure'); END;",
  );
  expect(
    (
      await call(
        `painel/pedidos/${o.id}/simular-conferencia`,
        { version: 1 },
        a,
      )
    ).status,
  ).toBe(500);
  expect(
    (
      await env.DB.prepare(
        "SELECT status FROM payment_records WHERE order_id=?",
      )
        .bind(o.id)
        .first<{ status: string }>()
    )?.status,
  ).toBe("SIMULATED_NOT_COLLECTED");
  expect(
    (
      await env.DB.prepare("SELECT version FROM orders WHERE id=?")
        .bind(o.id)
        .first<{ version: number }>()
    )?.version,
  ).toBe(1);
});
it("API · cliente não cria confirmação do vendedor ou conciliação bancária", async () => {
  const o = await order();
  expect(
    (
      await call(`painel/pedidos/${o.id}/simular-conferencia`, {
        version: 0,
        status: "bank_reconciled",
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await call(`pedidos/${o.token}/confirm-payment`, {
        status: "bank_reconciled",
      })
    ).status,
  ).toBe(404);
});
