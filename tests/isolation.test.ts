import { expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { handleApi } from "../src/lib/api";
import { GET as getImage } from "../src/pages/media/[id]";
import { login } from "../src/lib/auth";
import { applyD1Migrations, reset } from "cloudflare:test";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import seed from "../db/seed.sql?raw";
import { legacyOrder } from "./fixtures/legacy-order";

type Identity = { cookie: string; csrf: string };
const shops = [
  { user: "forno", id: "store-a", slug: "casa-do-forno", product: "a-pao" },
  { user: "verde", id: "store-b", slug: "verde-mesa", product: "b-bowl" },
] as const;

async function call(
  path: string,
  data?: unknown,
  identity?: Identity,
  method = data === undefined ? "GET" : "POST",
  extraHeaders: Record<string, string> = {},
) {
  return handleApi(
    new Request(`http://localhost/api/v1/${path}`, {
      method,
      headers: {
        ...(data === undefined
          ? {}
          : { origin: "http://localhost", "content-type": "application/json" }),
        ...(identity
          ? { cookie: identity.cookie, "x-csrf-token": identity.csrf }
          : {}),
        ...extraHeaders,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    env.DB,
    "local-demo",
  );
}

async function auth(user: string): Promise<Identity> {
  const response = await call("login", {
    email: `${user}@demo.doofi.test`,
    password: "demo-doofi-P1!",
  });
  expect(response.status).toBe(200);
  const result = (await response.json()) as { csrfToken: string };
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    csrf: result.csrfToken,
  };
}

async function asset(storeId: string, kind = "product") {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO media_assets VALUES (?,?,?,?,?,?,?)")
    .bind(
      id,
      storeId,
      kind,
      new Uint8Array([255, 216, 255, 217]).buffer,
      1,
      1,
      1,
    )
    .run();
  return id;
}

const productInput = {
  title: "Produto de teste",
  description: "Descrição fictícia",
  category: "Lanches",
  price: 1000,
  unavailable: false,
  image: "bread",
  version: 0,
};

async function order(
  shop: (typeof shops)[number],
  extra: Record<string, unknown> = {},
) {
  const { intent } = (await (
    await call(`lojas/${shop.slug}/intent`, {})
  ).json()) as { intent: string };
  const response = await call(`lojas/${shop.slug}/pedidos`, {
    intent,
    items: [{ productId: shop.product, quantity: 1 }],
    fulfillment: "FIXED",
    payment: "PIX_SIMULATED",
    name: `Cliente privado ${shop.id}`,
    phone: "00000000",
    email: `privado-${shop.id}@exemplo.invalid`,
    address: `Endereço privado ${shop.id}`,
    neighborhood: "Centro",
    postalCode: "00000000",
    note: `Observação privada ${shop.id}`,
    consent: true,
    syntheticData: true,
    ...extra,
  });
  expect(response.status).toBe(201);
  return (await response.json()) as {
    id: string;
    token: string;
    protocol: string;
  };
}

it("sessão antiga não acompanha a transferência do empresário para outra loja", async () => {
  const original = await auth("forno");
  await env.DB.prepare(
    "UPDATE store_memberships SET store_id='store-b' WHERE user_id='user-a'",
  ).run();
  expect((await call("painel/catalogo", undefined, original)).status).toBe(401);
  const renewed = await auth("forno");
  const products = (await (
    await call("painel/catalogo", undefined, renewed)
  ).json()) as { store_id: string }[];
  expect(products.length).toBeGreaterThan(0);
  expect(products.every((product) => product.store_id === "store-b")).toBe(
    true,
  );
});

it("banco recusa referência direta a foto pertencente a outra empresa", async () => {
  const foreignImage = await asset("store-b");
  await expect(
    env.DB.prepare("UPDATE products SET image_id=? WHERE id='a-pao'")
      .bind(foreignImage)
      .run(),
  ).rejects.toThrow();
});

it("contrato público não serializa colunas internas ou futuras do banco", async () => {
  await env.DB.exec("ALTER TABLE stores ADD COLUMN internal_note TEXT");
  await env.DB.exec("ALTER TABLE products ADD COLUMN internal_cost INTEGER");
  await env.DB.prepare(
    "UPDATE stores SET internal_note='restrito ao lojista'",
  ).run();
  await env.DB.prepare("UPDATE products SET internal_cost=123").run();
  const response = await call("lojas/casa-do-forno");
  expect(response.status).toBe(200);
  const data = (await response.json()) as {
    store: Record<string, unknown>;
    products: Record<string, unknown>[];
  };
  for (const key of ["internal_note", "version", "active", "id"])
    expect(data.store).not.toHaveProperty(key);
  for (const product of data.products)
    for (const key of ["internal_cost", "store_id", "version"])
      expect(product).not.toHaveProperty(key);
});

it.each([
  [0, 1],
  [1, 0],
])(
  "empresa %i não lê nem altera dados privados da empresa %i",
  async (ownIndex, foreignIndex) => {
    const own = shops[ownIndex],
      foreign = shops[foreignIndex];
    const ownOrder = await order(own),
      foreignOrder = await order(foreign);
    const identity = await auth(own.user);
    const injected = {
      "x-store-id": foreign.id,
      "x-user-id": `user-${foreignIndex ? "b" : "a"}`,
    };
    for (const suffix of ["", "/auditoria"]) {
      const response = await call(
        `painel/pedidos/${foreignOrder.id}${suffix}`,
        undefined,
        identity,
      );
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain(foreignOrder.id);
    }
    for (const [action, body] of [
      ["transicoes", { version: 0, status: "ACCEPTED" }],
      [
        "cotacao",
        { version: 0, fee: 100, estimate: "Em uma hora", validMinutes: 10 },
      ],
      ["simular-conferencia", { version: 0 }],
    ] as const)
      expect(
        (
          await call(
            `painel/pedidos/${foreignOrder.id}/${action}`,
            body,
            identity,
          )
        ).status,
      ).toBe(404);
    expect(
      (
        await call(
          `painel/produtos/${foreign.product}`,
          { ...productInput, store_id: own.id },
          identity,
          "PATCH",
        )
      ).status,
    ).toBe(404);
    const overview = (await (
      await call(
        `painel/visao-geral?storeId=${foreign.id}`,
        undefined,
        identity,
        "GET",
        injected,
      )
    ).json()) as {
      orders: { id: string }[];
      summary: { total_orders: number };
    };
    expect(overview.orders.map((row) => row.id)).toEqual([ownOrder.id]);
    expect(overview.summary.total_orders).toBe(1);
    const summary = await (
      await call(`painel/resumo?store_id=${foreign.id}`, undefined, identity)
    ).json();
    expect(summary).toMatchObject({ total_orders: 1 });
    const catalog = (await (
      await call(
        `painel/catalogo?store_id=${foreign.id}`,
        undefined,
        identity,
        "GET",
        injected,
      )
    ).json()) as { store_id: string }[];
    expect(catalog.every((row) => row.store_id === own.id)).toBe(true);
    const created = (await (
      await call(
        "painel/produtos",
        { ...productInput, store_id: foreign.id, user_id: "user-forged" },
        identity,
        "POST",
        injected,
      )
    ).json()) as { id: string };
    expect(
      await env.DB.prepare("SELECT store_id FROM products WHERE id=?")
        .bind(created.id)
        .first(),
    ).toEqual({ store_id: own.id });
    const settings = (await (
      await call("painel/loja", undefined, identity)
    ).json()) as Record<string, unknown>;
    expect(
      (
        await call(
          "painel/loja",
          {
            ...settings,
            title: `Teste ${own.id}`,
            is_open: true,
            has_own_delivery: true,
            store_id: foreign.id,
            id: foreign.id,
          },
          identity,
          "PATCH",
          injected,
        )
      ).status,
    ).toBe(200);
    expect(
      await env.DB.prepare("SELECT title FROM stores WHERE id=?")
        .bind(foreign.id)
        .first(),
    ).not.toEqual({ title: `Teste ${own.id}` });
    expect(
      await env.DB.prepare("SELECT status,version FROM orders WHERE id=?")
        .bind(foreignOrder.id)
        .first(),
    ).toEqual({ status: "PENDING", version: 0 });
  },
);

it("cliente sem sessão administrativa não acessa painel usando token de pedido", async () => {
  const created = await order(shops[0]);
  const headers = {
    authorization: `Bearer ${created.token}`,
    "x-store-id": "store-a",
  };
  for (const path of [
    "session",
    "painel/loja",
    "painel/catalogo",
    "painel/pedidos",
    "painel/resumo",
    "painel/visao-geral",
    `painel/pedidos/${created.id}`,
    `painel/pedidos/${created.id}/auditoria`,
  ]) {
    const response = await call(path, undefined, undefined, "GET", headers);
    if (path === "session")
      expect(await response.json()).toEqual({ authenticated: false });
    else expect(response.status).toBe(401);
  }
  expect(
    (await call("painel/produtos", productInput, undefined, "POST", headers))
      .status,
  ).toBe(401);
});

it("funcionário não assume permissões de proprietário pelo payload ou cabeçalho", async () => {
  await env.DB.prepare(
    "UPDATE store_memberships SET role='staff' WHERE user_id='user-a'",
  ).run();
  const staff = await auth("forno");
  const settings = (await (
    await call("painel/loja", undefined, staff)
  ).json()) as Record<string, unknown>;
  expect(
    (
      await call(
        "painel/loja",
        { ...settings, is_open: true, role: "owner" },
        staff,
        "PATCH",
        { "x-role": "owner" },
      )
    ).status,
  ).toBe(403);
  const upload = await handleApi(
    new Request("http://localhost/api/v1/painel/imagens?kind=banner", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        cookie: staff.cookie,
        "x-csrf-token": staff.csrf,
        "content-type": "image/jpeg",
      },
      body: new Uint8Array([1, 2, 3]),
    }),
    env.DB,
    "local-demo",
  );
  expect(upload.status).toBe(403);
  expect(
    (await call("painel/produtos", { ...productInput, role: "owner" }, staff))
      .status,
  ).toBe(201);
});

it.each([
  "UPDATE store_memberships SET active=0 WHERE user_id='user-a'",
  "DELETE FROM store_memberships WHERE user_id='user-a'",
  "UPDATE store_memberships SET role='staff' WHERE user_id='user-a'",
  "UPDATE users SET active=0 WHERE id='user-a'",
  "UPDATE users SET password_hash='alterada' WHERE id='user-a'",
  "UPDATE stores SET active=0 WHERE id='store-a'",
])("mudança de acesso revoga somente as sessões afetadas: %s", async (sql) => {
  const a = await auth("forno"),
    b = await auth("verde");
  await env.DB.prepare(sql).run();
  expect((await call("painel/catalogo", undefined, a)).status).toBe(401);
  expect((await call("painel/catalogo", undefined, b)).status).toBe(200);
  // Reactivation cannot revive a previously revoked cookie.
  if (sql.includes("active=0"))
    await env.DB.prepare(sql.replace("active=0", "active=1")).run();
  expect((await call("painel/catalogo", undefined, a)).status).toBe(401);
});

it("transferência durante verificação da senha não cria sessão no novo escopo", async () => {
  let changed = false;
  const database = new Proxy(env.DB, {
    get(target, property) {
      if (property === "batch")
        return async (statements: D1PreparedStatement[]) => {
          if (!changed) {
            changed = true;
            await target
              .prepare(
                "UPDATE store_memberships SET store_id='store-b' WHERE user_id='user-a'",
              )
              .run();
          }
          return target.batch(statements);
        };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  await expect(
    login(database, new Request("http://localhost"), {
      email: "forno@demo.doofi.test",
      password: "demo-doofi-P1!",
    }),
  ).rejects.toMatchObject({ status: 409, code: "AUTH_CHANGED" });
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first(),
  ).toEqual({ n: 0 });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM audit_events WHERE action='LOGIN'",
    ).first(),
  ).toEqual({ n: 0 });
});

it("CSRF de outra sessão e origem externa não autorizam mudanças", async () => {
  const a = await auth("forno"),
    b = await auth("verde");
  expect(
    (await call("painel/produtos", productInput, { ...a, csrf: b.csrf }))
      .status,
  ).toBe(403);
  expect(
    (
      await call("painel/produtos", productInput, a, "POST", {
        origin: "https://outro.exemplo.invalid",
      })
    ).status,
  ).toBe(403);
  expect(
    (await call("painel/produtos", productInput, a, "POST", { origin: "" }))
      .status,
  ).toBe(403);
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS n FROM products").first(),
  ).toEqual({ n: 6 });
});

it("rascunhos de imagem são privados; somente imagens publicadas são compartilhadas", async () => {
  const a = await auth("forno"),
    b = await auth("verde");
  const image = await asset("store-a");
  const read = (cookie = "") =>
    getImage({
      params: { id: image },
      request: new Request(`http://localhost/media/${image}`, {
        headers: { cookie },
      }),
    });
  const privateImage = await read(a.cookie);
  expect(privateImage.status).toBe(200);
  expect(privateImage.headers.get("cache-control")).toBe("no-store");
  expect((await read(b.cookie)).status).toBe(404);
  expect((await read()).status).toBe(404);
  await env.DB.prepare("UPDATE products SET image_id=? WHERE id='a-pao'")
    .bind(image)
    .run();
  expect((await read()).status).toBe(200);
  expect((await read(b.cookie)).status).toBe(200);
  await env.DB.prepare("UPDATE stores SET active=0 WHERE id='store-a'").run();
  expect((await read()).status).toBe(404);
});

it("API e banco impedem fotos e banners de outra loja ou do tipo incorreto", async () => {
  const a = await auth("forno");
  const foreignPhoto = await asset("store-b"),
    foreignBanner = await asset("store-b", "banner"),
    ownBanner = await asset("store-a", "banner");
  for (const image of [foreignPhoto, ownBanner])
    expect(
      (await call("painel/produtos", { ...productInput, image_id: image }, a))
        .status,
    ).toBe(422);
  const settings = (await (
    await call("painel/loja", undefined, a)
  ).json()) as Record<string, unknown>;
  expect(
    (
      await call(
        "painel/loja",
        { ...settings, is_open: true, banner_id: foreignBanner },
        a,
        "PATCH",
      )
    ).status,
  ).toBe(422);
  for (const [sql, params] of [
    ["UPDATE stores SET banner_id=? WHERE id='store-a'", [foreignBanner]],
    ["UPDATE stores SET banner_id=? WHERE id='store-a'", [foreignPhoto]],
    ["UPDATE products SET image_id=? WHERE id='a-pao'", [ownBanner]],
    ["UPDATE media_assets SET store_id='store-a' WHERE id=?", [foreignPhoto]],
    ["UPDATE products SET store_id='store-b' WHERE id=?", ["a-pao"]],
  ] as const)
    await expect(
      env.DB.prepare(sql)
        .bind(...params)
        .run(),
    ).rejects.toThrow();
});

it("pedido, itens, pagamento, cotação e combos mantêm a empresa também no banco", async () => {
  const created = await order(shops[0]);
  for (const sql of [
    `INSERT INTO order_items VALUES('cross-item','${created.id}','store-b','b-bowl','teste',100,1)`,
    `INSERT INTO delivery_quotes VALUES('cross-quote','${created.id}','store-b',1,100,'teste',9999999999,NULL)`,
    `UPDATE payment_records SET store_id='store-b' WHERE order_id='${created.id}'`,
    `UPDATE orders SET store_id='store-b' WHERE id='${created.id}'`,
    "INSERT INTO combo_items VALUES('a-pao','store-a','b-bowl')",
  ])
    await expect(env.DB.prepare(sql).run()).rejects.toThrow();
  expect(await env.DB.prepare("PRAGMA foreign_key_check").all()).toMatchObject({
    results: [],
  });
});

it("checkout não mistura produtos, intentos ou componentes entre empresas", async () => {
  const a = await auth("forno");
  const { intent } = (await (
    await call("lojas/casa-do-forno/intent", {})
  ).json()) as { intent: string };
  const input = {
    intent,
    items: [{ productId: "a-pao", quantity: 1 }],
    fulfillment: "PICKUP",
    payment: "PIX_SIMULATED",
    name: "Teste fictício",
    phone: "00000000",
    email: "teste.invalid",
    consent: true,
    syntheticData: true,
  };
  expect(
    (
      await call("lojas/verde-mesa/pedidos", {
        ...input,
        items: [{ productId: "b-bowl", quantity: 1 }],
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await call("lojas/casa-do-forno/pedidos", {
        ...input,
        items: [{ productId: "b-bowl", quantity: 1 }],
        store_id: "store-b",
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await call(
        "painel/produtos",
        { ...productInput, is_combo: true, componentIds: ["a-pao", "b-bowl"] },
        a,
      )
    ).status,
  ).toBe(422);
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first(),
  ).toEqual({ n: 0 });
});

it("cada token e nonce autoriza apenas seu pedido e não divulga dados privados", async () => {
  const a = await order(shops[0]),
    b = await order(shops[1]);
  const merchant = await auth("forno");
  const statuses = await Promise.all(
    [a, b].map(async (created) => {
      const response = await call(`pedidos/${created.token}`);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const data = (await response.json()) as Record<string, unknown> & {
        actionNonce: string;
      };
      for (const key of [
        "id",
        "store_id",
        "public_token_hash",
        "intent_hash",
        "request_hash",
        "customer_name",
        "customer_contact",
        "customer_id",
        "customer_phone",
        "customer_email",
        "address",
        "neighborhood",
        "postal_code",
        "note",
      ])
        expect(data).not.toHaveProperty(key);
      const serialized = JSON.stringify(data);
      expect(serialized).not.toContain("Cliente privado");
      expect(serialized).not.toContain("Endereço privado");
      expect(serialized).not.toContain("Observação privada");
      expect(serialized).not.toContain("privado-store-");
      return data;
    }),
  );
  expect(statuses[0].protocol).toBe(a.protocol);
  expect(statuses[1].protocol).toBe(b.protocol);
  expect(
    (
      await call(
        `pedidos/${b.token}/declare-payment`,
        { version: 0, nonce: statuses[0].actionNonce },
        merchant,
      )
    ).status,
  ).toBe(403);
  expect((await call(`pedidos/${a.id}`)).status).toBe(404);
  expect((await call(`pedidos/${a.protocol}`)).status).toBe(404);
  await env.DB.prepare("UPDATE orders SET token_revoked=1 WHERE id=?")
    .bind(a.id)
    .run();
  expect((await call(`pedidos/${a.token}`, undefined, merchant)).status).toBe(
    404,
  );
  expect((await call(`pedidos/${b.token}`)).status).toBe(200);
  expect(
    await env.DB.prepare("SELECT status FROM payment_records WHERE order_id=?")
      .bind(b.id)
      .first(),
  ).toEqual({ status: "SIMULATED_NOT_COLLECTED" });
});

it("migração preserva pedidos e exige nova sessão para eliminar escopo legado ambíguo", async () => {
  await reset();
  const migrations = env.TEST_MIGRATIONS;
  await applyD1Migrations(env.DB, migrations.slice(0, 4));
  await env.DB.batch(
    seed
      .split(";\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => env.DB.prepare(s.replace(/;$/, ""))),
  );
  const identity = await auth("forno");
  const existing = await legacyOrder(env.DB);
  await applyD1Migrations(env.DB, migrations);
  expect((await call("painel/catalogo", undefined, identity)).status).toBe(401);
  expect((await call(`pedidos/${existing.token}`)).status).toBe(200);
  const fresh = await auth("forno");
  await env.DB.prepare(
    "UPDATE store_memberships SET store_id='store-b' WHERE user_id='user-a'",
  ).run();
  expect((await call("painel/catalogo", undefined, fresh)).status).toBe(401);
});

it("substituição de vínculo por importação também revoga a sessão antiga", async () => {
  const identity = await auth("forno");
  await env.DB.prepare(
    "INSERT OR REPLACE INTO store_memberships VALUES('store-b','user-a','owner',1)",
  ).run();
  expect((await call("painel/catalogo", undefined, identity)).status).toBe(401);
});

it("seed ignorado não revoga sessão nem substitui a permissão de funcionário", async () => {
  await env.DB.prepare(
    "UPDATE store_memberships SET role='staff' WHERE user_id='user-a'",
  ).run();
  const identity = await auth("forno");
  await env.DB.prepare(
    "INSERT OR IGNORE INTO store_memberships VALUES('store-a','user-a','owner',1)",
  ).run();
  expect((await call("painel/catalogo", undefined, identity)).status).toBe(200);
  expect(
    await env.DB.prepare(
      "SELECT role FROM store_memberships WHERE user_id='user-a'",
    ).first(),
  ).toEqual({ role: "staff" });
});

it.each(["users", "stores"])(
  "substituição de registro em %s revoga sessões sem afetar outra empresa",
  async (table) => {
    const a = await auth("forno"),
      b = await auth("verde");
    const id = table === "users" ? "user-a" : "store-a";
    await env.DB.prepare(
      `INSERT OR REPLACE INTO ${table} SELECT * FROM ${table} WHERE id=?`,
    )
      .bind(id)
      .run();
    expect((await call("painel/catalogo", undefined, a)).status).toBe(401);
    expect((await call("painel/catalogo", undefined, b)).status).toBe(200);
  },
);
