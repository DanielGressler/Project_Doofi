import { expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { handleApi } from "../src/lib/api";
import { getSession, login } from "../src/lib/auth";
import { cookieToken, sessionCookie } from "../src/lib/session-cookie";
import { createOrder, issueIntent, publicOrder } from "../src/lib/orders";
import { getProducts } from "../src/lib/catalog";

type Identity = { cookie: string; csrf: string };
async function auth(email = "forno"): Promise<Identity> {
  const result = await login(
    env.DB,
    new Request("http://localhost/painel/entrar"),
    { email: `${email}@demo.doofi.test`, password: "demo-doofi-P1!" },
  );
  return { cookie: result.setCookie.split(";")[0], csrf: result.csrfToken };
}
async function call(
  path: string,
  data?: unknown,
  identity?: Identity,
  origin = "http://localhost",
  method = data === undefined ? "GET" : "POST",
) {
  return handleApi(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(data === undefined
          ? {}
          : { origin, "content-type": "application/json" }),
        ...(identity
          ? { cookie: identity.cookie, "x-csrf-token": identity.csrf }
          : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    env.DB,
    "local-demo",
  );
}
async function order(extra: Record<string, unknown> = {}) {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  return createOrder(env.DB, "casa-do-forno", {
    intent,
    items: [{ productId: "a-pao", quantity: 1 }],
    fulfillment: "FIXED",
    payment: "PIX_SIMULATED",
    name: "Pessoa de teste",
    phone: "00000000",
    email: "pessoa@exemplo.invalid",
    address: "Rua fictícia, 10",
    neighborhood: "Centro",
    postalCode: "00000000",
    consent: true,
    syntheticData: true,
    ...extra,
  });
}
const injections = [
  "' OR 1=1--",
  "' UNION SELECT 1,2,3,4,5,6,7--",
  "'; DROP TABLE customer_details;--",
  '" OR "1"="1',
];
it.each(["fulfillment", "payment"])(
  "enum %s rejeita arrays em vez de gerar erro interno",
  async (field) => {
    const { intent } = await issueIntent(env.DB, "casa-do-forno");
    const response = await call("/api/v1/lojas/casa-do-forno/pedidos", {
      intent,
      items: [{ productId: "a-pao", quantity: 1 }],
      fulfillment: "FIXED",
      payment: "PIX_SIMULATED",
      name: "Pessoa fictícia",
      phone: "00000000",
      email: "teste@exemplo.invalid",
      address: "Rua de teste, 10",
      neighborhood: "Centro",
      postalCode: "00000000",
      consent: true,
      syntheticData: true,
      [field]: field === "fulfillment" ? ["FIXED"] : ["PIX_SIMULATED"],
    });
    expect(response.status).toBe(422);
    expect(
      (await env.DB.prepare("SELECT COUNT(*) n FROM orders").first<{
        n: number;
      }>())!.n,
    ).toBe(0);
  },
);
it.each(injections)(
  "SQL injection no login não autentica: %s",
  async (email) => {
    const response = await call("/painel/api/v1/login", {
      email,
      password: "demo-doofi-P1!",
    });
    expect(response.status).toBe(422);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(
      (await env.DB.prepare("SELECT COUNT(*) n FROM sessions").first<{
        n: number;
      }>())!.n,
    ).toBe(0);
  },
);
it.each(injections)(
  "SQL injection em produto, rota e cookie não amplia acesso: %s",
  async (payload) => {
    expect(await getProducts(env.DB, "store-a", [payload])).toEqual([]);
    const identity = await auth();
    const response = await call(
      `/painel/api/v1/pedidos/${encodeURIComponent(payload)}`,
      undefined,
      identity,
    );
    expect(response.status).toBe(404);
    const forged = await call("/painel/api/v1/catalogo", undefined, {
      ...identity,
      cookie: `doofi_panel=${payload}`,
    });
    expect(forged.status).toBe(401);
    expect(
      (await env.DB.prepare("SELECT COUNT(*) n FROM products").first<{
        n: number;
      }>())!.n,
    ).toBe(6);
  },
);
it("instruções SQL e HTML nos dados fictícios são gravadas somente como texto", async () => {
  const sql = "'; DROP TABLE users;--",
    html = '<img src=x onerror="alert(1)">';
  const created = await order({
    address: sql,
    note: html,
  });
  const row = await env.DB.prepare(
    "SELECT name,phone,email,address FROM customer_details WHERE id=(SELECT customer_id FROM orders WHERE id=?)",
  )
    .bind(created.id)
    .first();
  expect(row).toEqual({
    name: "Pessoa de teste",
    phone: "00000000",
    email: "pessoa@exemplo.invalid",
    address: sql,
  });
  expect(
    (await env.DB.prepare("SELECT COUNT(*) n FROM users").first<{
      n: number;
    }>())!.n,
  ).toBe(2);
  const publicResponse = await call(`/api/v1/pedidos/${created.token}`);
  const text = await publicResponse.text();
  expect(publicResponse.status).toBe(200);
  expect(text).not.toContain(sql);
  expect(text).not.toContain(html);
});
it("mass assignment, prototype pollution e preço forjado não criam conta nem alteram o escopo", async () => {
  const created = await order({
    ...JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
    ),
    store_id: "store-b",
    customer_id: "foreign",
    user_id: "user-b",
    role: "owner",
    password: "ignored",
    total: 1,
    subtotal: 1,
    delivery_fee: 0,
    status: "COMPLETED",
  });
  expect(
    await env.DB.prepare(
      "SELECT store_id,status,subtotal,delivery_fee,total FROM orders WHERE id=?",
    )
      .bind(created.id)
      .first(),
  ).toEqual({
    store_id: "store-a",
    status: "PENDING",
    subtotal: 2400,
    delivery_fee: 600,
    total: 3000,
  });
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(
    (await env.DB.prepare("SELECT COUNT(*) n FROM sessions").first<{
      n: number;
    }>())!.n,
  ).toBe(0);
});
it("cookies duplicados são recusados em qualquer ordem, sem escolher uma empresa", async () => {
  const a = await auth(),
    b = await auth("verde");
  for (const cookie of [
    `${a.cookie}; ${b.cookie}`,
    `${b.cookie}; ${a.cookie}`,
    `${a.cookie}; ${a.cookie}`,
  ]) {
    expect(
      cookieToken(
        new Request("http://localhost/painel", { headers: { cookie } }),
      ),
    ).toBe("");
    expect(
      (await call("/painel/api/v1/catalogo", undefined, { ...a, cookie }))
        .status,
    ).toBe(401);
  }
});
it("cookie HTTPS é HttpOnly, Secure, host-only e restrito ao painel; token nunca vai no JSON", async () => {
  const request = new Request("https://localhost/painel/entrar");
  const result = await login(env.DB, request, {
    email: "forno@demo.doofi.test",
    password: "demo-doofi-P1!",
  });
  expect(result.setCookie).toMatch(/^__Secure-doofi_panel=[a-f0-9]{64};/);
  expect(result.setCookie).toContain("Path=/painel;");
  expect(result.setCookie).toContain("HttpOnly");
  expect(result.setCookie).toContain("SameSite=Strict");
  expect(result.setCookie).toContain("; Secure");
  expect(result.setCookie).not.toContain("Domain=");
  const session = await getSession(
    env.DB,
    new Request(request, {
      headers: { cookie: result.setCookie.split(";")[0] },
    }),
  );
  expect(session?.store_id).toBe("store-a");
  const response = await call("/painel/api/v1/login", {
    email: "forno@demo.doofi.test",
    password: "demo-doofi-P1!",
  });
  const responseToken = response.headers
    .get("set-cookie")!
    .split(";")[0]
    .split("=")[1];
  expect(await response.text()).not.toContain(responseToken);
  expect(sessionCookie("", request, 0)).toContain("Max-Age=0");
});
it("novo cookie inválido não é substituído silenciosamente por cookie legado válido", async () => {
  const a = await auth();
  const token = a.cookie.split("=")[1];
  for (const cookie of [
    `doofi_panel=invalid; doofi_session=${token}`,
    `doofi_session=${token}; doofi_panel=invalid`,
  ])
    expect(
      cookieToken(
        new Request("http://localhost/painel", { headers: { cookie } }),
      ),
    ).toBe("");
});
it("CSRF, origens externas e outra empresa continuam bloqueados na API do painel", async () => {
  const created = await order(),
    a = await auth(),
    b = await auth("verde");
  const path = `/painel/api/v1/pedidos/${created.id}/transicoes`;
  expect(
    (await call(path, { version: 0, status: "ACCEPTED" }, { ...a, csrf: "" }))
      .status,
  ).toBe(403);
  expect(
    (
      await call(
        path,
        { version: 0, status: "ACCEPTED" },
        a,
        "https://evil.invalid",
      )
    ).status,
  ).toBe(403);
  expect(
    (await call(path, { version: 0, status: "ACCEPTED" }, a, "null")).status,
  ).toBe(403);
  expect((await call(path, { version: 0, status: "ACCEPTED" }, b)).status).toBe(
    404,
  );
  expect((await call(path, { version: 0, status: "ACCEPTED" }, a)).status).toBe(
    200,
  );
});
it("projeções não expõem colunas internas novas no cliente nem no painel", async () => {
  const created = await order(),
    a = await auth();
  for (const table of ["stores", "products", "orders"])
    await env.DB.prepare(
      `ALTER TABLE ${table} ADD COLUMN internal_secret TEXT DEFAULT 'server-only-fixture'`,
    ).run();
  for (const path of [
    "/api/v1/lojas/casa-do-forno",
    `/api/v1/pedidos/${created.token}`,
    "/painel/api/v1/loja",
    "/painel/api/v1/catalogo",
    `/painel/api/v1/pedidos/${created.id}`,
  ]) {
    const response = await call(path, undefined, a);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("internal_secret");
    expect(text).not.toContain("server-only-fixture");
    expect(text).not.toContain("public_token_hash");
    expect(text).not.toContain("intent_hash");
    expect(text).not.toContain("request_hash");
  }
  expect(await publicOrder(env.DB, created.token)).not.toHaveProperty(
    "customer_name",
  );
});
it("link do cliente, identificadores ou e-mail de loja não substituem sessão empresarial", async () => {
  const created = await order({ email: "forno@demo.doofi.test" });
  for (const cookie of [
    `doofi_panel=${created.token}`,
    `doofi_panel=${created.id}`,
    "doofi_panel=store-a",
  ])
    expect(
      (
        await call("/painel/api/v1/catalogo", undefined, {
          cookie,
          csrf: "anything",
        })
      ).status,
    ).toBe(401);
});
