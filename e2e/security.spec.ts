import { expect, test, type Page } from "./fixtures";
import { pauseQueue } from "./ui-helpers";

async function login(page: Page) {
  await page.goto("/painel/entrar");
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/painel\/pedidos$/);
  await pauseQueue(page);
}
async function checkout(page: Page) {
  await page.goto("/loja/casa-do-forno");
  await page
    .getByRole("button", {
      name: "Adicionar Pão de fermentação natural",
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: "Continuar pedido" }).click();
  await page
    .getByRole("link", { name: "Avançar para dados e entrega" })
    .click();
}
test("cookie do lojista fica restrito ao painel e não acompanha o cliente", async ({
  page,
  context,
}) => {
  await login(page);
  const cookies = await context.cookies();
  const app = cookies.find((c) =>
    ["doofi_session", "doofi_panel", "__Secure-doofi_panel"].includes(c.name),
  )!;
  expect(app.httpOnly).toBe(true);
  expect(app.sameSite).toBe("Strict");
  expect(app.path).toBe("/painel");
  await context.addCookies([
    {
      name: "CF_Authorization",
      value: "simulated-access-cookie",
      domain: "localhost",
      path: "/",
      httpOnly: true,
    },
  ]);
  const publicRequest = page.waitForRequest((r) =>
    r.url().endsWith("/loja/casa-do-forno"),
  );
  await page.goto("/loja/casa-do-forno");
  const headers = await (await publicRequest).allHeaders();
  const names = (headers.cookie ?? "")
    .split(";")
    .map((c) => c.trim().split("=")[0]);
  expect(names).not.toContain(app.name);
  expect(names).toContain("CF_Authorization");
  expect(await page.evaluate(() => document.cookie)).not.toMatch(
    /doofi_(?:panel|session)/,
  );
  expect(await (await page.request.get("/api/v1/session")).json()).toEqual({
    authenticated: false,
  });
});
test("envio incerto mantém os dados originais visíveis e bloqueia edição silenciosa", async ({
  page,
}) => {
  await checkout(page);
  await page
    .getByLabel("Nome fictício", { exact: true })
    .fill("Pessoa Teste Original");
  await page.locator('[name="consent"]').check();
  await page.route("**/api/v1/lojas/casa-do-forno/pedidos", (route) =>
    route.abort("failed"),
  );
  await page.getByRole("button", { name: "Enviar pedido de teste" }).click();
  await expect(page.locator("#feedback")).toHaveClass(/error/);
  await expect(
    page.getByLabel("Nome fictício", { exact: true }),
  ).toBeDisabled();
  await page.evaluate(() =>
    localStorage.setItem(
      "doofi.cart.casa-do-forno",
      JSON.stringify({ "a-cafe": 2 }),
    ),
  );
  await page.reload();
  await expect(page.getByLabel("Nome fictício", { exact: true })).toHaveValue(
    "Pessoa Teste Original",
  );
  await expect(
    page.getByLabel("Nome fictício", { exact: true }),
  ).toBeDisabled();
  await expect(page.locator("#checkout-items")).toContainText(
    "Pão de fermentação natural",
  );
  await expect(page.locator("#checkout-items")).not.toContainText(
    "Café coado especial",
  );
  await expect(page.locator("#checkout-total")).toContainText("24,00");
  await page.unroute("**/api/v1/lojas/casa-do-forno/pedidos");
  await page.locator('[name="consent"]').check();
  await page.getByRole("button", { name: "Enviar pedido de teste" }).click();
  await expect(page).toHaveURL(/pedido\/[a-f0-9]{64}$/);
  await expect(page.locator("#tracking-items")).toContainText(
    "Pão de fermentação natural",
  );
  const stored = await page.evaluate(() =>
    Object.values(sessionStorage).join(" "),
  );
  expect(stored).not.toContain("Pessoa Teste Original");
  expect(stored).not.toContain("cliente@exemplo.invalid");
});
test("cookie legado é migrado sem trocar a conta ou estender a sessão", async ({
  page,
  context,
}) => {
  await login(page);
  const original = (await context.cookies()).find(
    (c) => c.name === "doofi_panel",
  )!;
  await context.clearCookies({ name: "doofi_panel" });
  await context.addCookies([
    {
      name: "doofi_session",
      value: original.value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Strict",
      expires: original.expires,
    },
  ]);
  await page.goto("/painel/catalogo");
  await expect(page).toHaveURL(/painel\/catalogo$/);
  const cookies = await context.cookies();
  expect(cookies.some((c) => c.name === "doofi_session")).toBe(false);
  const migrated = cookies.find((c) => c.name === "doofi_panel")!;
  expect(migrated.path).toBe("/painel");
  expect(migrated.expires).toBeLessThanOrEqual(original.expires + 1);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  const response = await page.request.get("/painel/api/v1/catalogo");
  expect(response.status()).toBe(401);
});
test("rascunho expirado não revela contatos nem reutiliza o checkout anterior", async ({
  page,
}) => {
  await checkout(page);
  await page
    .getByLabel("Nome fictício", { exact: true })
    .fill("Pessoa Teste Expirada");
  await page.locator('[name="consent"]').check();
  await page.route("**/api/v1/lojas/casa-do-forno/pedidos", (route) =>
    route.abort("failed"),
  );
  await page.getByRole("button", { name: "Enviar pedido de teste" }).click();
  await expect(page.locator("#feedback")).toHaveClass(/error/);
  await page.evaluate(() => {
    const key = "doofi.intent.casa-do-forno.payload";
    const state = JSON.parse(sessionStorage.getItem(key)!);
    state.savedAt = Date.now() - 3600001;
    sessionStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByLabel("Nome fictício", { exact: true })).toHaveValue(
    "Cliente Exemplo",
  );
  await expect(page.getByLabel("Nome fictício", { exact: true })).toBeEnabled();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("doofi.intent.casa-do-forno.payload"),
    ),
  ).toBeNull();
});
test("XSS persistente nos dados de envio fica como texto e não chega ao acompanhamento", async ({
  page,
}) => {
  const origin = "http://localhost:4321";
  const payload = '<img src=x onerror="window.__shippingXss=true">';
  const { intent } = await (
    await page.request.post("/api/v1/lojas/casa-do-forno/intent", {
      headers: { origin },
      data: {},
    })
  ).json();
  const createdResponse = await page.request.post(
    "/api/v1/lojas/casa-do-forno/pedidos",
    {
      headers: { origin },
      data: {
        intent,
        items: [{ productId: "a-pao", quantity: 1 }],
        fulfillment: "FIXED",
        payment: "PIX_SIMULATED",
        name: "Cliente Teste XSS",
        phone: "00000000",
        email: "xss@exemplo.invalid",
        address: payload,
        neighborhood: "Centro",
        postalCode: "00000000",
        note: payload,
        consent: true,
        syntheticData: true,
      },
    },
  );
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();
  await login(page);
  const response = await page.goto(`/painel/pedidos/${created.id}`);
  expect(response!.headers()["content-security-policy"]).toContain(
    "script-src 'self'",
  );
  await expect(page.locator("#order-detail")).toContainText(payload);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, "__shippingXss")),
  ).toBeUndefined();
  await page.goto(`/pedido/${created.token}`);
  expect(await page.content()).not.toContain("xss@exemplo.invalid");
  expect(await page.content()).not.toContain("__shippingXss");
});
test("falha antes de emitir checkout libera edição e preserva a modalidade e o total", async ({
  page,
}) => {
  await checkout(page);
  await page.locator('input[name="fulfillment"][value="FIXED"]').check();
  await page.locator('[name="consent"]').check();
  await page.route("**/api/v1/lojas/casa-do-forno/intent", (route) =>
    route.abort("failed"),
  );
  await page.getByRole("button", { name: "Enviar pedido de teste" }).click();
  await expect(page.locator("#feedback")).toHaveClass(/error/);
  await expect(page.getByLabel("Nome fictício", { exact: true })).toBeEnabled();
  await expect(page.locator("#address-fields")).toBeVisible();
  await expect(page.locator("#checkout-total")).toContainText("30,00");
});
test("resposta confirmada remove contatos antes da navegação e recupera somente o link", async ({
  page,
}) => {
  await checkout(page);
  await page
    .getByLabel("Nome fictício", { exact: true })
    .fill("Pessoa Teste Confirmada");
  await page
    .getByLabel("E-mail fictício", { exact: true })
    .fill("confirmada@exemplo.invalid");
  await page.locator('[name="consent"]').check();
  await page.route("**/pedido/*", (route) => route.abort("failed"));
  const navigation = page.waitForRequest(
    (r) => r.isNavigationRequest() && /\/pedido\/[a-f0-9]{64}$/.test(r.url()),
  );
  await page.getByRole("button", { name: "Enviar pedido de teste" }).click();
  await navigation;
  await page.goto("/loja/casa-do-forno/checkout");
  await expect(page.locator("#recovery-message")).toContainText(
    "já foi enviado",
  );
  await expect(page.locator("#checkout-form")).toBeHidden();
  await expect(page.locator("#recovery-link")).toBeVisible();
  const stored = await page.evaluate(() => ({
    draft: sessionStorage.getItem("doofi.intent.casa-do-forno.payload"),
    receipt: sessionStorage.getItem("doofi.lastOrder.casa-do-forno"),
  }));
  expect(stored.draft).toBeNull();
  expect(stored.receipt).not.toContain("confirmada@exemplo.invalid");
  expect(stored.receipt).not.toContain("Pessoa Teste Confirmada");
});
