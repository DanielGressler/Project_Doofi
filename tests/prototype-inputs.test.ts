import { expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { syntheticError } from "../src/lib/synthetic-data";
import { createOrder, issueIntent } from "../src/lib/orders";
import { register, login, getSession } from "../src/lib/auth";
import { registeredStores } from "../src/lib/directory";
import { saveStore, finishStoreGuide } from "../src/lib/catalog";
import { handleApi } from "../src/lib/api";
import type { Store } from "../src/lib/types";

it("conclusão do guia exige sessão, origem e CSRF no endpoint do painel", async () => {
  const account = await register(env.DB, new Request("http://localhost"), {
    title: "Loja Teste",
    email: "endpoint@exemplo.invalid",
    password: "senha-inventada",
    syntheticData: true,
  });
  const headers = {
    "content-type": "application/json",
    origin: "http://localhost",
    cookie: account.setCookie.split(";")[0],
    "x-csrf-token": account.csrfToken,
  };
  for (const [override, status] of [
    [{ cookie: "" }, 401],
    [{ "x-csrf-token": "" }, 403],
    [{ origin: "https://outro.invalid" }, 403],
  ] as const) {
    const result = await handleApi(
      new Request("http://localhost/painel/api/v1/guia/concluir", {
        method: "POST",
        headers: { ...headers, ...override },
        body: JSON.stringify({ version: 0 }),
      }),
      env.DB,
      "local-demo",
    );
    expect(result.status).toBe(status);
  }
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) n FROM audit_events WHERE action='GUIDE_COMPLETED'",
    ).first(),
  ).toEqual({ n: 0 });
});

it.each([
  "cliente@exemplo.invalid",
  "loja@demo.doofi.test",
  "demo@site.example",
  "x@example.com",
  "x@example.net",
  "x@example.org",
])("aceita domínio reservado: %s", (email) =>
  expect(syntheticError("email", email)).toBe(""),
);
it.each([
  "teste@gmail.com",
  "teste@hotmail.com",
  "teste@empresa.com.br",
  "teste@invalid.com",
  "teste@exemplo.invalid.com",
  "a@@exemplo.invalid",
  "sem-arroba.invalid",
  "x @exemplo.invalid",
])("bloqueia e-mail real ou malformado: %s", (email) =>
  expect(syntheticError("email", email)).not.toBe(""),
);
it.each(["(00) 00000-1234", "00000000", "00 1234-5678"])(
  "aceita número não roteável: %s",
  (phone) => expect(syntheticError("phone", phone)).toBe(""),
);
it.each([
  "(11) 99999-1234",
  "+55 21 99999-1234",
  "telefone fictício",
  "00",
  "00<script>",
])("bloqueia telefone real ou malformado: %s", (phone) =>
  expect(syntheticError("phone", phone)).not.toBe(""),
);
it("nome exige marca de teste, sem prometer identificar pessoas reais", () => {
  for (const name of ["Cliente Teste 01", "Pessoa fictícia", "Cliente Exemplo"])
    expect(syntheticError("name", name)).toBe("");
  for (const name of ["Maria Silva", "teste<script>", "   ", "Testemunha"])
    expect(syntheticError("name", name)).not.toBe("");
});
it.each([
  { name: "Maria Silva" },
  { phone: "(11) 99999-1234" },
  { email: "teste@gmail.com" },
])("backend recusa dados reais mesmo sem JavaScript: %j", async (extra) => {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  await expect(
    createOrder(env.DB, "casa-do-forno", {
      intent,
      items: [{ productId: "a-pao", quantity: 1 }],
      fulfillment: "PICKUP",
      payment: "PIX_SIMULATED",
      name: "Cliente Teste",
      phone: "00000000",
      email: "cliente@exemplo.invalid",
      consent: true,
      syntheticData: true,
      ...extra,
    }),
  ).rejects.toMatchObject({ status: 422, code: "SYNTHETIC_DATA_REQUIRED" });
  expect(
    await env.DB.prepare("SELECT COUNT(*) n FROM customer_details").first(),
  ).toEqual({ n: 0 });
  expect(await env.DB.prepare("SELECT COUNT(*) n FROM orders").first()).toEqual(
    { n: 0 },
  );
});
it("cadastro bloqueia e-mail e telefone reais sem criar empresa", async () => {
  const input = {
    title: "Loja de teste",
    email: "loja@exemplo.invalid",
    password: "senha-inventada",
    syntheticData: true,
  };
  for (const extra of [
    { email: "loja@gmail.com" },
    { contact: "(11) 99999-1234" },
  ])
    await expect(
      register(env.DB, new Request("http://localhost"), { ...input, ...extra }),
    ).rejects.toMatchObject({ status: 422 });
  expect(await env.DB.prepare("SELECT COUNT(*) n FROM stores").first()).toEqual(
    { n: 2 },
  );
});
it("login com caracteres SQL dentro de domínio permitido continua parametrizado", async () => {
  const result = await handleApi(
    new Request("http://localhost/painel/api/v1/login", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "x'OR'1'='1@exemplo.invalid",
        password: "demo-doofi-P1!",
      }),
    }),
    env.DB,
    "local-demo",
  );
  expect(result.status).toBe(401);
  expect(result.headers.has("set-cookie")).toBe(false);
  expect(
    await env.DB.prepare("SELECT COUNT(*) n FROM sessions").first(),
  ).toEqual({ n: 0 });
});
it("lista apenas lojas ativas configuradas e não expõe os responsáveis", async () => {
  await env.DB.exec("ALTER TABLE stores ADD COLUMN private_note TEXT");
  await env.DB.prepare(
    "UPDATE stores SET private_note='segredo',setup_complete=0 WHERE id='store-b'",
  ).run();
  const stores = await registeredStores(env.DB);
  expect(stores).toHaveLength(1);
  expect(stores[0].slug).toBe("casa-do-forno");
  expect(stores[0]).not.toHaveProperty("id");
  expect(stores[0]).not.toHaveProperty("private_note");
  expect(stores[0]).not.toHaveProperty("contact");
  await env.DB.prepare("UPDATE stores SET active=0 WHERE id='store-a'").run();
  expect(await registeredStores(env.DB)).toEqual([]);
});
it("guia retoma após personalização, conclui apenas a própria empresa e guarda um único evento", async () => {
  const input = {
    title: "Marca do tutorial",
    email: "guia@exemplo.invalid",
    password: "senha-inventada",
    syntheticData: true,
  };
  const result = await register(env.DB, new Request("http://localhost"), input);
  const session = (await getSession(
    env.DB,
    new Request("http://localhost/painel", {
      headers: { cookie: result.setCookie.split(";")[0] },
    }),
  ))!;
  const store = (await env.DB.prepare("SELECT * FROM stores WHERE id=?")
    .bind(session.store_id)
    .first<Store>())!;
  await expect(
    finishStoreGuide(env.DB, session, { version: 0 }),
  ).rejects.toMatchObject({ status: 409 });
  await saveStore(env.DB, session, {
    ...store,
    is_open: false,
    has_own_delivery: false,
    banner_preset: "sweets",
    finishSetup: false,
  });
  expect(
    (await login(env.DB, new Request("http://localhost"), input)).next,
  ).toBe("/painel/catalogo?tutorial=1");
  await expect(
    finishStoreGuide(env.DB, { ...session, role: "staff" }, { version: 1 }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    finishStoreGuide(env.DB, session, { version: 0 }),
  ).rejects.toMatchObject({ status: 409 });
  await finishStoreGuide(env.DB, session, { version: 1, store_id: "store-b" });
  await finishStoreGuide(env.DB, session, { version: 1 });
  expect(
    (await login(env.DB, new Request("http://localhost"), input)).next,
  ).toBe("/painel/pedidos");
  expect(
    (await registeredStores(env.DB)).some((s) => s.slug === store.slug),
  ).toBe(true);
  expect(
    await env.DB.prepare("SELECT theme,version FROM stores WHERE id=?")
      .bind(session.store_id)
      .first(),
  ).toEqual({ theme: "sweets", version: 2 });
  expect(
    await env.DB.prepare(
      "SELECT version FROM stores WHERE id='store-b'",
    ).first(),
  ).toEqual({ version: 0 });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) n FROM audit_events WHERE action='GUIDE_COMPLETED'",
    ).first(),
  ).toEqual({ n: 1 });
});
