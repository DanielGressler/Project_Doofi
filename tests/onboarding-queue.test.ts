import { expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { getSession, login, register } from "../src/lib/auth";
import { handleApi } from "../src/lib/api";
import { saveStore } from "../src/lib/catalog";
import { getDashboard } from "../src/lib/dashboard";
import {
  createOrder,
  issueIntent,
  transition,
  proposeQuote,
} from "../src/lib/orders";
import type { Store } from "../src/lib/types";

const input = {
  title: "Loja nova fictícia",
  email: "nova@exemplo.invalid",
  password: "senha-ficticia",
  syntheticData: true,
};
const request = new Request("http://localhost", {
  headers: { origin: "http://localhost" },
});
async function sessionFor(email = "forno@demo.doofi.test") {
  const result = await login(env.DB, request, {
    email,
    password: "demo-doofi-P1!",
  });
  return (await getSession(
    env.DB,
    new Request(request, {
      headers: { cookie: result.setCookie.split(";")[0] },
    }),
  ))!;
}
async function order(fulfillment = "PICKUP", slug = "casa-do-forno") {
  const { intent } = await issueIntent(env.DB, slug);
  return createOrder(env.DB, slug, {
    intent,
    items: [
      { productId: slug === "casa-do-forno" ? "a-pao" : "b-bowl", quantity: 1 },
    ],
    fulfillment,
    payment: "PIX_SIMULATED",
    name: "Pessoa fictícia",
    phone: "00000000",
    email: "teste@exemplo.invalid",
    address: "Rua fictícia, 10",
    neighborhood: "Centro",
    postalCode: "00000000",
    consent: true,
    syntheticData: true,
  });
}
it("cadastro cria uma empresa isolada com escopo gerado pelo servidor e sem produtos de A/B", async () => {
  const result = await register(env.DB, request, {
    ...input,
    store_id: "store-a",
    user_id: "user-a",
    role: "staff",
  });
  const authenticated = new Request(request, {
    headers: { cookie: result.setCookie.split(";")[0] },
  });
  const session = (await getSession(env.DB, authenticated))!;
  expect(session.store_id).not.toBe("store-a");
  expect(session.role).toBe("owner");
  expect(session.store_setup_complete).toBe(0);
  expect(result.next).toBe("/painel/loja?tutorial=1");
  expect(
    await handleApi(
      new Request("http://localhost/api/v1/painel/catalogo", authenticated),
      env.DB,
      "local-demo",
    ).then((r) => r.json()),
  ).toEqual([]);
  const store = (await env.DB.prepare("SELECT * FROM stores WHERE id=?")
    .bind(session.store_id)
    .first<Store>())!;
  expect(store.is_open).toBe(0);
  await saveStore(env.DB, session, {
    ...store,
    is_open: false,
    has_own_delivery: false,
    finishSetup: true,
  });
  expect((await login(env.DB, request, input)).next).toBe("/painel/pedidos");
  expect(
    (await env.DB.prepare(
      "SELECT setup_complete FROM stores WHERE id='store-a'",
    ).first<{ setup_complete: number }>())!.setup_complete,
  ).toBe(1);
});
it("cadastros concorrentes com o mesmo e-mail não deixam lojas ou sessões órfãs", async () => {
  const results = await Promise.allSettled([
    register(env.DB, request, input),
    register(env.DB, request, input),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(
    (await env.DB.prepare("SELECT COUNT(*) n FROM stores").first<{
      n: number;
    }>())!.n,
  ).toBe(3);
  expect(
    (await env.DB.prepare("SELECT COUNT(*) n FROM sessions").first<{
      n: number;
    }>())!.n,
  ).toBe(1);
});
it("cadastro mantém proteção de origem e recusa dados ausentes sem criar empresa", async () => {
  await expect(
    register(env.DB, request, { ...input, syntheticData: false }),
  ).rejects.toThrow("fictícios");
  const response = await handleApi(
    new Request("http://localhost/api/v1/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://other.invalid",
      },
      body: JSON.stringify(input),
    }),
    env.DB,
    "local-demo",
  );
  expect(response.status).toBe(403);
  expect(
    (await env.DB.prepare("SELECT COUNT(*) n FROM stores").first<{
      n: number;
    }>())!.n,
  ).toBe(2);
});
it("fila independente dos últimos 100 pedidos mantém ordem de chegada, isola empresas e remove decisões", async () => {
  const first = await order(),
    second = await order("QUOTE");
  await order("PICKUP", "verde-mesa");
  const dashboard = await getDashboard(env.DB, "store-a");
  expect(dashboard.queue.map((o) => o.id)).toEqual([first.id, second.id]);
  const session = await sessionFor();
  await transition(env.DB, session, first.id, {
    version: 0,
    status: "ACCEPTED",
  });
  expect(
    (await getDashboard(env.DB, "store-a")).queue.map((o) => o.id),
  ).toEqual([second.id]);
  await expect(
    transition(env.DB, session, second.id, { version: 0, status: "ACCEPTED" }),
  ).rejects.toThrow();
  await proposeQuote(env.DB, session, second.id, {
    version: 0,
    fee: 500,
    estimate: "30 minutos",
    validMinutes: 30,
  });
  expect((await getDashboard(env.DB, "store-a")).queue).toEqual([]);
  const plan = await env.DB.prepare(
    "EXPLAIN QUERY PLAN SELECT id FROM orders WHERE store_id=? AND status IN ('PENDING','QUOTE_PENDING','QUOTE_ACCEPTED') ORDER BY created_at,rowid LIMIT 50",
  )
    .bind("store-a")
    .all<{ detail: string }>();
  expect(plan.results.map((p) => p.detail).join(" ")).toContain(
    "orders_pending_queue",
  );
});
