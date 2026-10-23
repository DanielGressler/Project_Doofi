import { expect, it } from "vitest";
import { env } from "cloudflare:workers";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { handleApi } from "../src/lib/api";
import { login } from "../src/lib/auth";
import { createOrder, issueIntent } from "../src/lib/orders";

function instrument() {
  const stats = { calls: 0, statements: 0 };
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    const proxy = new Proxy(statement, {
      get(target, property) {
        if (property === "bind")
          return (...values: unknown[]) => wrap(target.bind(...values));
        const value = Reflect.get(target, property);
        if (["first", "all", "run", "raw"].includes(String(property)))
          return (...args: unknown[]) => {
            stats.calls++;
            stats.statements++;
            return value.apply(target, args);
          };
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    originals.set(proxy, statement);
    return proxy;
  }
  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === "prepare")
        return (sql: string) => wrap(target.prepare(sql));
      if (property === "batch")
        return (statements: D1PreparedStatement[]) => {
          stats.calls++;
          stats.statements += statements.length;
          return target.batch(
            statements.map(
              (statement) => originals.get(statement) ?? statement,
            ),
          );
        };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { db, stats };
}

async function order() {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  return createOrder(env.DB, "casa-do-forno", {
    intent,
    items: [{ productId: "a-pao", quantity: 1 }],
    fulfillment: "PICKUP",
    payment: "PIX_SIMULATED",
    name: "Teste fictício",
    contact: "teste@exemplo.invalid",
    consent: true,
    syntheticData: true,
  });
}

it("acompanhamento aquecido faz duas chamadas D1 sem misturar o estado do pedido", async () => {
  const created = await order();
  const request = () =>
    new Request(`http://localhost/api/v1/pedidos/${created.token}`);
  await handleApi(request(), env.DB, "local-demo");
  const { db, stats } = instrument();
  const response = await handleApi(request(), db, "local-demo");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    status: "PENDING",
    total: 2400,
  });
  expect(stats).toEqual({ calls: 2, statements: 8 });
});

it("painel entrega lista e resumo em uma requisição e duas chamadas D1", async () => {
  await order();
  const authenticated = await login(env.DB, new Request("http://localhost"), {
    email: "forno@demo.doofi.test",
    password: "demo-doofi-P1!",
  });
  const { db, stats } = instrument();
  const response = await handleApi(
    new Request("http://localhost/api/v1/painel/visao-geral", {
      headers: { cookie: authenticated.setCookie.split(";")[0] },
    }),
    db,
    "local-demo",
  );
  expect(response.status).toBe(200);
  const result = (await response.json()) as {
    summary: { total_orders: number };
    orders: unknown[];
  };
  expect(result.summary.total_orders).toBe(result.orders.length);
  expect(stats).toEqual({ calls: 2, statements: 4 });
});

it("catálogo público faz duas chamadas D1 com três consultas", async () => {
  const { db, stats } = instrument();
  const response = await handleApi(
    new Request("http://localhost/api/v1/lojas/casa-do-forno"),
    db,
    "local-demo",
  );
  expect(response.status).toBe(200);
  expect(stats).toEqual({ calls: 2, statements: 3 });
});

it("lista de pedidos usa o índice sem ordenar resultados em tabela temporária", async () => {
  const plan = await env.DB.prepare(
    "EXPLAIN QUERY PLAN SELECT id FROM orders WHERE store_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100",
  )
    .bind("store-a")
    .all<{ detail: string }>();
  const details = plan.results.map((row) => row.detail).join("\n");
  expect(details).toContain("USING INDEX");
  expect(details).not.toContain("TEMP B-TREE");
});
