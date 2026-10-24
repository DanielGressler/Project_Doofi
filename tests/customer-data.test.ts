import { expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { applyD1Migrations, reset } from "cloudflare:test";
import seed from "../db/seed.sql?raw";
import {
  createOrder,
  issueIntent,
  ownedOrder,
  publicStatus,
} from "../src/lib/orders";
import { getSession } from "../src/lib/auth";
import { handleApi } from "../src/lib/api";
import type { CustomerDetails } from "../src/lib/customer-data";
import type { Session } from "../src/lib/types";
import { legacyOrder, legacySession } from "./fixtures/legacy-order";

const input = (intent: string, extra: Record<string, unknown> = {}) => ({
  intent,
  items: [{ productId: "a-pao", quantity: 1 }],
  fulfillment: "FIXED",
  payment: "PIX_SIMULATED",
  name: "Pessoa Fictícia",
  phone: "(00) 00000-1234",
  email: "pessoa@exemplo.invalid",
  address: "Rua Fictícia, 123",
  neighborhood: "Centro",
  postalCode: "00000000",
  consent: true,
  syntheticData: true,
  ...extra,
});
const owner = (storeId = "store-a"): Session => ({
  store_id: storeId,
  user_id: storeId === "store-a" ? "user-a" : "user-b",
  role: "owner",
  csrf_token: "test",
  token_hash: "test",
  email: "lojista@demo.doofi.test",
});
async function make(extra: Record<string, unknown> = {}) {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  return createOrder(env.DB, "casa-do-forno", input(intent, extra));
}
async function details(orderId: string) {
  return (await env.DB.prepare(
    `SELECT c.* FROM customer_details c
    JOIN orders o ON o.customer_id=c.id AND o.store_id=c.store_id WHERE o.id=?`,
  )
    .bind(orderId)
    .first<CustomerDetails>())!;
}

it("dados de envio usam chave única estrangeira sem criar identidade de login", async () => {
  const created = await make();
  const customer = await details(created.id);
  expect(customer.id).toMatch(/^[a-f0-9-]{36}$/);
  expect(customer).toMatchObject({
    store_id: "store-a",
    name: "Pessoa Fictícia",
    phone: "(00) 00000-1234",
    email: "pessoa@exemplo.invalid",
    address: "Rua Fictícia, 123",
  });
  const order = await ownedOrder(env.DB, owner(), created.id);
  expect(order.customer_id).toBe(customer.id);
  expect(order.customer_phone).toBe(customer.phone);
  expect(order.customer_email).toBe(customer.email);
  for (const [table, n] of [
    ["users", 2],
    ["store_memberships", 2],
    ["sessions", 0],
  ] as const)
    expect(
      await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first(),
    ).toEqual({ n });
  expect(await getSession(env.DB, new Request("http://localhost"))).toBeNull();
});

it.each(["name", "phone", "email"])(
  "pedido exige %s nos dados de envio",
  async (field) => {
    await expect(make({ [field]: "" })).rejects.toMatchObject({ status: 422 });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM customer_details",
      ).first(),
    ).toEqual({ n: 0 });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first(),
    ).toEqual({ n: 0 });
  },
);

it("nome, telefone e e-mail fictícios iguais não conectam as empresas", async () => {
  const a = await make();
  const { intent } = await issueIntent(env.DB, "verde-mesa");
  const b = await createOrder(
    env.DB,
    "verde-mesa",
    input(intent, { items: [{ productId: "b-bowl", quantity: 1 }] }),
  );
  const ca = await details(a.id),
    cb = await details(b.id);
  expect(ca.id).not.toBe(cb.id);
  expect(ca.store_id).toBe("store-a");
  expect(cb.store_id).toBe("store-b");
  expect(ca.email).toBe(cb.email);
  for (const [session, id] of [
    [owner(), b.id],
    [owner("store-b"), a.id],
  ] as const)
    await expect(ownedOrder(env.DB, session, id)).rejects.toMatchObject({
      status: 404,
    });
});

it("campos de conta e chave de outra loja no formulário não alteram o vínculo", async () => {
  const a = await make();
  const ca = await details(a.id);
  const { intent } = await issueIntent(env.DB, "verde-mesa");
  const b = await createOrder(
    env.DB,
    "verde-mesa",
    input(intent, {
      items: [{ productId: "b-bowl", quantity: 1 }],
      customer_id: ca.id,
      store_id: "store-a",
      user_id: "user-a",
      role: "owner",
      password: "ignorada",
      email: "forno@demo.doofi.test",
    }),
  );
  const cb = await details(b.id);
  expect(cb.id).not.toBe(ca.id);
  expect(cb.store_id).toBe("store-b");
  expect(cb).not.toHaveProperty("password");
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first(),
  ).toEqual({ n: 0 });
});

it("dados reservados de teste são aceitos sem validação externa", async () => {
  const created = await make({
    phone: "(00) 00000-9999",
    email: "email@exemplo.invalid",
  });
  expect(await details(created.id)).toMatchObject({
    phone: "(00) 00000-9999",
    email: "email@exemplo.invalid",
  });
});

it("formato antigo só recupera pedido existente e não cria novos dados incompletos", async () => {
  await expect(
    make({
      phone: undefined,
      email: undefined,
      contact: "antigo@exemplo.invalid",
    }),
  ).rejects.toMatchObject({ status: 422, code: "DELIVERY_DETAILS_REQUIRED" });
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS n FROM customer_details").first(),
  ).toEqual({ n: 0 });
});

it("versão anterior da aplicação continua gravando com FK durante a atualização", async () => {
  const created = await legacyOrder(env.DB);
  expect(await details(created.id)).toMatchObject({
    id: `legacy-${created.id}`,
    store_id: "store-a",
    phone: null,
    email: "antigo@exemplo.invalid",
  });
  expect((await ownedOrder(env.DB, owner(), created.id)).customer_id).toBe(
    `legacy-${created.id}`,
  );
  expect(await env.DB.prepare("PRAGMA foreign_key_check").all()).toMatchObject({
    results: [],
  });
});

it("dados de envio não são expostos no acompanhamento ou por busca pública", async () => {
  const created = await make(),
    customer = await details(created.id);
  const current = await publicStatus(env.DB, created.token);
  const serialized = JSON.stringify(current);
  for (const value of [
    customer.id,
    customer.name,
    customer.phone!,
    customer.email!,
    customer.address!,
  ])
    expect(serialized).not.toContain(value);
  for (const path of [
    `clientes/${customer.id}`,
    "clientes?email=pessoa@exemplo.invalid",
    `painel/pedidos/${created.id}`,
  ]) {
    const response = await handleApi(
      new Request(`http://localhost/api/v1/${path}`),
      env.DB,
      "local-demo",
    );
    expect(response.status).toBe(path.startsWith("painel/") ? 401 : 404);
    expect(await response.text()).not.toContain(customer.email!);
  }
});

it("reenvios simultâneos geram apenas um conjunto de dados de envio", async () => {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      createOrder(env.DB, "casa-do-forno", input(intent)),
    ),
  );
  expect(new Set(results.map((result) => result.id)).size).toBe(1);
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS n FROM customer_details").first(),
  ).toEqual({ n: 1 });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE customer_id IS NOT NULL",
    ).first(),
  ).toEqual({ n: 1 });
});

it("falha ao registrar pedido reverte também os dados de envio", async () => {
  await env.DB.exec(
    "CREATE TRIGGER reject_order BEFORE INSERT ON audit_events WHEN NEW.action='ORDER_CREATED' BEGIN SELECT RAISE(ABORT,'test'); END;",
  );
  await expect(make()).rejects.toThrow();
  for (const table of [
    "customer_details",
    "orders",
    "order_items",
    "payment_records",
  ])
    expect(
      await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first(),
    ).toEqual({ n: 0 });
});

it("banco recusa chave de outra empresa, compartilhamento entre pedidos e remoção de registro vinculado", async () => {
  const a = await make(),
    a2 = await make();
  const ca = await details(a.id);
  const { intent } = await issueIntent(env.DB, "verde-mesa");
  const b = await createOrder(
    env.DB,
    "verde-mesa",
    input(intent, { items: [{ productId: "b-bowl", quantity: 1 }] }),
  );
  for (const id of [a2.id, b.id])
    await expect(
      env.DB.prepare("UPDATE orders SET customer_id=? WHERE id=?")
        .bind(ca.id, id)
        .run(),
    ).rejects.toThrow();
  await expect(
    env.DB.prepare("DELETE FROM customer_details WHERE id=?").bind(ca.id).run(),
  ).rejects.toThrow();
  await expect(
    env.DB.prepare("UPDATE customer_details SET store_id='store-b' WHERE id=?")
      .bind(ca.id)
      .run(),
  ).rejects.toThrow();
  expect(await env.DB.prepare("PRAGMA foreign_key_check").all()).toMatchObject({
    results: [],
  });
});

it("dados antigos e login da loja sobrevivem à migração, sem inventar contatos", async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, 5));
  await env.DB.batch(
    seed
      .split(";\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => env.DB.prepare(s.replace(/;$/, ""))),
  );
  const emailOrder = await legacyOrder(env.DB),
    phoneOrder = await legacyOrder(env.DB, "(00) 00000-9999");
  const auth = await legacySession(env.DB);
  const request = new Request("http://localhost", {
    headers: { cookie: auth.cookie },
  });
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  expect((await getSession(env.DB, request))?.store_id).toBe("store-a");
  expect(await details(emailOrder.id)).toMatchObject({
    phone: null,
    email: "antigo@exemplo.invalid",
  });
  expect(await details(phoneOrder.id)).toMatchObject({
    phone: "(00) 00000-9999",
    email: null,
  });
  for (const existing of [emailOrder, phoneOrder]) {
    expect((await publicStatus(env.DB, existing.token)).total).toBe(3000);
    const recovered = await createOrder(
      env.DB,
      "casa-do-forno",
      existing.input,
    );
    expect(recovered).toMatchObject({
      id: existing.id,
      token: existing.token,
      replayed: true,
    });
  }
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS n FROM customer_details").first(),
  ).toEqual({ n: 2 });
});
