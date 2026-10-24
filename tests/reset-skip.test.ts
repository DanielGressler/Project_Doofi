import { expect, it } from "vitest";
import { env } from "cloudflare:workers";
import {
  demoResetStatements,
  resetBaseline,
  resetCountsSql,
} from "../scripts/demo-reset-sql.mjs";
import seed from "../db/seed.sql?raw";
import { createOrder, issueIntent, publicStatus } from "../src/lib/orders";
import { register, getSession, login } from "../src/lib/auth";
import { finishStoreGuide } from "../src/lib/catalog";
import { datasetMarker, syncDemoStorage } from "../src/lib/browser-state";
import { clearApplicationCookies } from "../src/lib/session-cookie";
import type { Store } from "../src/lib/types";

const request = new Request("http://localhost");
const input = {
  title: "Loja Teste",
  email: "loja@exemplo.invalid",
  password: "senha-de-teste",
  syntheticData: true,
};
async function account(extra: Record<string, unknown> = {}) {
  const result = await register(env.DB, request, { ...input, ...extra });
  const authenticated = new Request(request, {
    headers: { cookie: result.setCookie.split(";")[0] },
  });
  return {
    result,
    session: (await getSession(env.DB, authenticated))!,
    authenticated,
  };
}
async function order() {
  const { intent } = await issueIntent(env.DB, "casa-do-forno");
  return createOrder(env.DB, "casa-do-forno", {
    intent,
    items: [{ productId: "a-pao", quantity: 1 }],
    fulfillment: "FIXED",
    payment: "PIX_SIMULATED",
    name: "Cliente Teste",
    phone: "00000000",
    email: "cliente@exemplo.invalid",
    address: "Rua de Teste, 1",
    postalCode: "00000000",
    neighborhood: "Centro",
    consent: true,
    syntheticData: true,
  });
}
it("reset completo restaura a base, revoga sessões e links, troca a geração e mantém as proteções", async () => {
  const created = await order();
  const user = await account();
  const key = await env.DB.prepare(
    "SELECT value FROM app_keys WHERE name='tracking_hmac'",
  ).first<{ value: string }>();
  await env.DB.prepare(
    "UPDATE stores SET palette='ocean',font='classic',layout='showcase',delivery_fee=900 WHERE id='store-a'",
  ).run();
  await env.DB.prepare(
    "UPDATE products SET price=999,image='salad',available=0 WHERE id='a-pao'",
  ).run();
  await env.DB.prepare(
    "INSERT INTO media_assets VALUES ('foto-extra','store-a','banner',?,1,1,1)",
  )
    .bind(new Uint8Array([1]).buffer)
    .run();
  await env.DB.prepare(
    "UPDATE stores SET banner_id='foto-extra' WHERE id='store-a'",
  ).run();
  await env.DB.batch(
    demoResetStatements(seed).map((sql) => env.DB.prepare(sql)),
  );
  expect(await env.DB.prepare(resetCountsSql).first()).toEqual(resetBaseline);
  expect(await getSession(env.DB, user.authenticated)).toBeNull();
  await expect(publicStatus(env.DB, created.token)).rejects.toMatchObject({
    status: 404,
  });
  expect(
    await env.DB.prepare(
      "SELECT slug,palette,font,layout,delivery_fee,banner_id,version,setup_complete FROM stores WHERE id='store-a'",
    ).first(),
  ).toEqual({
    slug: "casa-do-forno",
    palette: "terracotta",
    font: "editorial",
    layout: "cozy",
    delivery_fee: 600,
    banner_id: null,
    version: 0,
    setup_complete: 1,
  });
  expect(
    await env.DB.prepare(
      "SELECT price,available,image FROM products WHERE id='a-pao'",
    ).first(),
  ).toEqual({ price: 2400, available: 1, image: "bread" });
  expect(
    await env.DB.prepare(
      "SELECT value FROM app_keys WHERE name='tracking_hmac'",
    ).first(),
  ).not.toEqual(key);
  const epoch = await env.DB.prepare(
    "SELECT value FROM app_keys WHERE name='browser_epoch'",
  ).first<{ value: string }>();
  expect(epoch!.value).toMatch(/^[a-f0-9]{32}$/);
  expect(
    (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
  await env.DB.prepare(
    "INSERT INTO audit_events VALUES ('after-reset','store-a','user-a','TEST','store-a','{}','reset',0)",
  ).run();
  await expect(
    env.DB.prepare("DELETE FROM audit_events").run(),
  ).rejects.toThrow("append-only");
  await expect(
    env.DB.prepare(
      "UPDATE products SET store_id='store-b' WHERE id='a-pao'",
    ).run(),
  ).rejects.toThrow("immutable");
  expect(
    (
      await login(env.DB, request, {
        email: "forno@demo.doofi.test",
        password: "demo-doofi-P1!",
      })
    ).next,
  ).toBe("/painel/pedidos");
});
it("falha no lote de reset reverte exclusões e restaura a proteção da auditoria", async () => {
  await order();
  const before = await env.DB.prepare(resetCountsSql).first();
  await expect(
    env.DB.batch([
      ...demoResetStatements(seed).map((sql) => env.DB.prepare(sql)),
      env.DB.prepare("INSERT INTO tabela_inexistente VALUES (1)"),
    ]),
  ).rejects.toThrow();
  expect(await env.DB.prepare(resetCountsSql).first()).toEqual(before);
  await expect(
    env.DB.prepare("DELETE FROM audit_events").run(),
  ).rejects.toThrow("append-only");
});
it("pula o tutorial já no cadastro com padrões válidos e preserva a conta empresarial", async () => {
  const { result, session } = await account({ skipTutorial: true });
  expect(result.next).toBe("/painel/catalogo");
  expect(session.store_setup_complete).toBe(1);
  const store = await env.DB.prepare("SELECT * FROM stores WHERE id=?")
    .bind(session.store_id)
    .first<Store>();
  expect(store!.is_open).toBe(0);
  expect(store!.version).toBe(0);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) n FROM audit_events WHERE action='GUIDE_SKIPPED' AND store_id=?",
    )
      .bind(session.store_id)
      .first(),
  ).toEqual({ n: 1 });
  expect((await login(env.DB, request, input)).next).toBe("/painel/pedidos");
});
it("pula em qualquer etapa sem alterar dados de outra loja, sem abrir a loja e com controle de versão", async () => {
  const { session } = await account();
  await expect(
    finishStoreGuide(
      env.DB,
      { ...session, role: "staff" },
      { version: 0, skip: true },
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    await finishStoreGuide(env.DB, session, {
      version: 0,
      skip: true,
      store_id: "store-b",
    }),
  ).toEqual({ completed: true, version: 1 });
  expect(
    await env.DB.prepare(
      "SELECT is_open,setup_complete,version FROM stores WHERE id=?",
    )
      .bind(session.store_id)
      .first(),
  ).toEqual({ is_open: 0, setup_complete: 1, version: 1 });
  expect(
    await finishStoreGuide(env.DB, session, { version: 1, skip: true }),
  ).toEqual({ completed: true, version: 1 });
  await env.DB.prepare("UPDATE stores SET version=2 WHERE id=?")
    .bind(session.store_id)
    .run();
  await expect(
    finishStoreGuide(env.DB, session, { version: 1, skip: true }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await env.DB.prepare(
      "SELECT version FROM stores WHERE id='store-b'",
    ).first(),
  ).toEqual({ version: 0 });
});
it("limpeza de cookie invalida apenas o aplicativo e não o Access", () => {
  const headers = new Headers();
  clearApplicationCookies(
    new Request("https://demo.test/painel", {
      headers: {
        cookie: "CF_Authorization=externo; __Secure-doofi_panel=antigo",
      },
    }),
    headers,
  );
  const text = headers.get("set-cookie")!;
  expect(text).toContain("__Secure-doofi_panel=;");
  expect(text).toContain("doofi_session=;");
  expect(text).toContain("Max-Age=0");
  expect(text).not.toContain("CF_Authorization");
});
it("mudança de geração limpa só chaves Doofi e preserva novos dados até outro reset", () => {
  class MemoryStorage {
    data = new Map<string, string>();
    get length() {
      return this.data.size;
    }
    key(index: number) {
      return [...this.data.keys()][index] ?? null;
    }
    getItem(key: string) {
      return this.data.get(key) ?? null;
    }
    setItem(key: string, value: string) {
      this.data.set(key, value);
    }
    removeItem(key: string) {
      this.data.delete(key);
    }
    clear() {
      this.data.clear();
    }
  }
  const local = new MemoryStorage(),
    tab = new MemoryStorage();
  for (const storage of [local, tab]) {
    storage.setItem("doofi.cart.loja", "antigo");
    storage.setItem("doofi.intent.loja.payload", "contatos antigos");
    storage.setItem("unrelated", "preservado");
    expect(syncDemoStorage(storage as Storage, "reset-1")).toBe(true);
    expect(storage.getItem("doofi.cart.loja")).toBeNull();
    expect(storage.getItem("doofi.intent.loja.payload")).toBeNull();
    expect(storage.getItem("unrelated")).toBe("preservado");
  }
  local.setItem("doofi.cart.loja", "novo");
  expect(syncDemoStorage(local as Storage, "reset-1")).toBe(false);
  expect(local.getItem("doofi.cart.loja")).toBe("novo");
  expect(syncDemoStorage(local as Storage, "reset-2")).toBe(true);
  expect(local.getItem("doofi.cart.loja")).toBeNull();
  expect(tab.getItem(datasetMarker)).toBe("reset-1");
  expect(syncDemoStorage(tab as Storage, "reset-2")).toBe(true);
});

it("reenvio após resposta perdida ao pular recupera a mesma versão sem encobrir alterações posteriores", async () => {
  const { session } = await account();
  const skipped = await finishStoreGuide(env.DB, session, {
    version: 0,
    skip: true,
  });
  expect(
    await finishStoreGuide(env.DB, session, { version: 0, skip: true }),
  ).toEqual(skipped);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) n FROM audit_events WHERE action='GUIDE_SKIPPED'",
    ).first(),
  ).toEqual({ n: 1 });
  await env.DB.prepare("UPDATE stores SET version=2 WHERE id=?")
    .bind(session.store_id)
    .run();
  await expect(
    finishStoreGuide(env.DB, session, { version: 0, skip: true }),
  ).rejects.toMatchObject({ status: 409 });
});
