import { expect, it } from "vitest";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { env } from "cloudflare:workers";
import {
  createOrder,
  customerAction,
  issueIntent,
  proposeQuote,
  publicStatus,
} from "../src/lib/orders";
import { now, rateLimit, pruneExpired } from "../src/lib/core";
import { saveProduct } from "../src/lib/catalog";
import { getDashboard } from "../src/lib/dashboard";
import type { Session } from "../src/lib/types";

const owner: Session = {
  store_id: "store-a",
  user_id: "user-a",
  role: "owner",
  csrf_token: "test",
  token_hash: "test",
  email: "forno@demo.doofi.test",
};
const payload = (intent: string, extra: Record<string, unknown> = {}) => ({
  intent,
  items: [{ productId: "a-pao", quantity: 1 }],
  name: "Cliente fictício",
  phone: "(00) 00000-0000",
  email: "teste@exemplo.invalid",
  fulfillment: "PICKUP",
  payment: "PIX_SIMULATED",
  consent: true,
  syntheticData: true,
  ...extra,
});

// Interleave a real committed D1 write at the read/write boundary, without sleeps.
function beforeBatchWrite(match: string, change: () => Promise<unknown>) {
  let prepared = false;
  let changed = false;
  return new Proxy(env.DB, {
    get(database, property) {
      if (property === "prepare")
        return (sql: string) => {
          if (sql.includes(match)) prepared = true;
          return database.prepare(sql);
        };
      if (property === "batch")
        return async (statements: D1PreparedStatement[]) => {
          if (prepared && !changed) {
            changed = true;
            await change();
          }
          return database.batch(statements);
        };
      const value = Reflect.get(database, property);
      return typeof value === "function" ? value.bind(database) : value;
    },
  });
}

it("checkout não grava preço lido antes de uma edição concorrente do catálogo", async () => {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  const database = beforeBatchWrite("INSERT INTO orders", () =>
    env.DB.prepare(
      "UPDATE products SET price=9900,version=version+1 WHERE id='a-pao'",
    ).run(),
  );
  await expect(
    createOrder(database, "casa-do-forno", payload(intent)),
  ).rejects.toMatchObject({ status: 409, code: "CATALOG_CHANGED" });
  for (const table of [
    "customer_details",
    "orders",
    "order_items",
    "payment_records",
    "audit_events",
  ]) {
    expect(
      (await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{
        count: number;
      }>())!.count,
    ).toBe(0);
  }
});

it("fechamento da loja entre leitura e gravação impede um novo pedido", async () => {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  const database = beforeBatchWrite("INSERT INTO orders", () =>
    env.DB.prepare(
      "UPDATE stores SET is_open=0,version=version+1 WHERE id='store-a'",
    ).run(),
  );
  await expect(
    createOrder(database, "casa-do-forno", payload(intent)),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await env.DB.prepare("SELECT COUNT(*) AS count FROM orders").first<{
      count: number;
    }>())!.count,
  ).toBe(0);
});

it("indisponibilidade concorrente de componente impede um pedido de combo", async () => {
  const combo = await saveProduct(env.DB, owner, {
    title: "Combo teste",
    description: "Café e pão",
    category: "Combos",
    price: 2500,
    unavailable: false,
    is_combo: true,
    componentIds: ["a-pao", "a-cafe"],
  });
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  const db = beforeBatchWrite("INSERT INTO orders", () =>
    env.DB.prepare(
      "UPDATE products SET available=0,version=version+1 WHERE id='a-cafe'",
    ).run(),
  );
  await expect(
    createOrder(
      db,
      "casa-do-forno",
      payload(intent, { items: [{ productId: combo.id, quantity: 1 }] }),
    ),
  ).rejects.toMatchObject({ status: 409, code: "CATALOG_CHANGED" });
  expect(
    (await env.DB.prepare("SELECT COUNT(*) AS count FROM orders").first<{
      count: number;
    }>())!.count,
  ).toBe(0);
});

it("intento que expira entre leitura e commit não cria pedido parcial", async () => {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  const db = beforeBatchWrite("INSERT INTO orders", () =>
    env.DB.prepare("UPDATE checkout_intents SET expires_at=1").run(),
  );
  await expect(
    createOrder(db, "casa-do-forno", payload(intent)),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM payment_records",
    ).first<{ count: number }>())!.count,
  ).toBe(0);
});

it("cotação que expira antes do commit não pode fechar o total do pedido", async () => {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  const order = await createOrder(
    env.DB,
    "casa-do-forno",
    payload(intent, {
      fulfillment: "QUOTE",
      address: "Rua de teste, 1",
      neighborhood: "Centro",
      postalCode: "00000000",
    }),
  );
  await proposeQuote(env.DB, owner, order.id, {
    version: 0,
    fee: 700,
    estimate: "30 minutos",
    validMinutes: 10,
  });
  const status = await publicStatus(env.DB, order.token);
  const database = beforeBatchWrite(
    "UPDATE orders SET status=?,delivery_fee=?",
    () =>
      env.DB.prepare("UPDATE delivery_quotes SET expires_at=1 WHERE order_id=?")
        .bind(order.id)
        .run(),
  );
  await expect(
    customerAction(database, order.token, "accept-quote", {
      version: status.version,
      quoteVersion: status.quote!.version,
      nonce: status.actionNonce,
    }),
  ).rejects.toMatchObject({ status: 409 });
  const current = await publicStatus(env.DB, order.token);
  expect(current.status).toBe("QUOTE_PROPOSED");
  expect(current.total).toBeNull();
  expect(
    current.events.some((event) => event.action === "QUOTE_ACCEPTED"),
  ).toBe(false);
});

it("limite de chamadas continua atômico durante uma rajada concorrente", async () => {
  const request = new Request("http://localhost/api/v1/login", {
    headers: { "cf-connecting-ip": "192.0.2.10" },
  });
  const results = await Promise.allSettled(
    Array.from({ length: 40 }, () => rateLimit(env.DB, request, "burst", 12)),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(12);
  for (const result of results)
    if (result.status === "rejected")
      expect(result.reason).toMatchObject({ status: 429 });
  expect(
    (await env.DB.prepare(
      "SELECT MAX(count) AS count FROM rate_limits WHERE expires_at>?",
    )
      .bind(now())
      .first<{ count: number }>())!.count,
  ).toBe(12);
});

it("40 reenvios concorrentes persistem um único pedido e uma única auditoria de criação", async () => {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  const orders = await Promise.all(
    Array.from({ length: 40 }, () =>
      createOrder(env.DB, "casa-do-forno", payload(intent)),
    ),
  );
  expect(new Set(orders.map((order) => order.id)).size).toBe(1);
  expect(orders.filter((order) => !order.replayed)).toHaveLength(1);
  expect(
    (await publicStatus(env.DB, orders[0].token)).events.filter(
      (event) => event.action === "ORDER_CREATED",
    ),
  ).toHaveLength(1);
});

it("30 checkouts independentes concorrentes mantêm pedidos, itens e totais consistentes", async () => {
  const intents = await Promise.all(
    Array.from({ length: 30 }, () => issueIntent(env.DB, "casa-do-forno")),
  );
  const orders = await Promise.all(
    intents.map(({ intent }) =>
      createOrder(env.DB, "casa-do-forno", payload(intent)),
    ),
  );
  expect(new Set(orders.map((order) => order.id)).size).toBe(30);
  const overview = await getDashboard(env.DB, "store-a");
  expect(overview.summary).toMatchObject({
    total_orders: 30,
    pending: 30,
    order_value: 72_000,
  });
  expect(overview.orders).toHaveLength(30);
  expect((await getDashboard(env.DB, "store-b")).orders).toEqual([]);
});

it("cota de anúncios não é ultrapassada por criações concorrentes", async () => {
  await env.DB.prepare(
    `WITH RECURSIVE sequence(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM sequence WHERE n<46)
    INSERT INTO products(id,store_id,title,description,category,price,available,image)
    SELECT 'fixture-'||n,'store-a','Produto '||n,'Descrição','Doces',100,1,'bread' FROM sequence`,
  ).run();
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, () =>
      saveProduct(env.DB, owner, {
        title: "Produto novo",
        description: "Descrição",
        category: "Doces",
        price: 100,
        unavailable: false,
      }),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  for (const result of results)
    if (result.status === "rejected")
      expect(result.reason).toMatchObject({ status: 422 });
  expect(
    (await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM products WHERE store_id='store-a'",
    ).first<{ count: number }>())!.count,
  ).toBe(50);
});

it("limpeza tem tamanho limitado e preserva sessões e checkouts válidos", async () => {
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(
      "WITH RECURSIVE sequence(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM sequence WHERE n<600) INSERT INTO rate_limits SELECT 'expired-'||n,1,1 FROM sequence",
    ),
    env.DB.prepare(
      "WITH RECURSIVE sequence(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM sequence WHERE n<600) INSERT INTO checkout_intents SELECT 'expired-'||n,'store-a',1 FROM sequence",
    ),
    env.DB.prepare(
      "WITH RECURSIVE sequence(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM sequence WHERE n<600) INSERT INTO sessions SELECT 'expired-'||n,'user-a','csrf',1 FROM sequence",
    ),
    env.DB.prepare(
      "INSERT INTO sessions VALUES('valid','user-a','csrf',?)",
    ).bind(timestamp + 1000),
    env.DB.prepare(
      "INSERT INTO checkout_intents VALUES('valid','store-a',?)",
    ).bind(timestamp + 1000),
  ]);
  const cleanup = await pruneExpired(env.DB, timestamp);
  expect(cleanup.map((result) => result.meta.changes)).toEqual([256, 256, 256]);
  for (const table of ["sessions", "checkout_intents"])
    expect(
      await env.DB.prepare(`SELECT 1 FROM ${table} WHERE expires_at>?`)
        .bind(timestamp)
        .first(),
    ).not.toBeNull();
});

it("carrinho com vinte combos e cinquenta anúncios cabe no limite de parâmetros do D1", async () => {
  await env.DB.prepare(
    `WITH RECURSIVE sequence(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM sequence WHERE n<27)
    INSERT INTO products(id,store_id,title,description,category,price,available,image)
    SELECT 'ordinary-'||n,'store-a','Produto '||n,'Descrição','Doces',100,1,'bread' FROM sequence`,
  ).run();
  const ordinaryIds = [
    "a-pao",
    "a-cafe",
    "a-croissant",
    ...Array.from({ length: 27 }, (_, index) => `ordinary-${index + 1}`),
  ];
  const comboIds: string[] = [];
  for (let index = 0; index < 20; index++) {
    const combo = await saveProduct(env.DB, owner, {
      title: `Combo ${index}`,
      description: "Descrição do combo",
      category: "Combos",
      price: 200,
      unavailable: false,
      is_combo: true,
      componentIds: [ordinaryIds[index], ordinaryIds[(index + 10) % 30]],
    });
    comboIds.push(combo.id);
  }
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  const created = await createOrder(
    env.DB,
    "casa-do-forno",
    payload(intent, {
      items: comboIds.map((productId) => ({ productId, quantity: 1 })),
    }),
  );
  const current = await publicStatus(env.DB, created.token);
  expect(current.items).toHaveLength(20);
  expect(current.total).toBe(4000);
});
