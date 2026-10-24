import { pauseQueue, openEditor } from "./ui-helpers";
import { test, expect, type Page } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

async function login(page: Page, shop = "forno") {
  await page.goto("/painel/entrar");
  await page
    .getByLabel("E-mail de demonstração")
    .fill(`${shop}@demo.doofi.test`);
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/\/painel\/pedidos$/);
  await pauseQueue(page);
}
async function checkout(
  page: Page,
  fulfillment = "PICKUP",
  slug = "casa-do-forno",
) {
  await page.goto(`/loja/${slug}`);
  await page
    .getByRole("button", {
      name: `Adicionar ${slug === "casa-do-forno" ? "Pão de fermentação natural" : "Bowl de verão"}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: `Adicionar ${slug === "casa-do-forno" ? "Café coado especial" : "Suco de laranja"}`,
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: "Continuar pedido" }).click();
  await page
    .getByRole("link", { name: "Avançar para dados e entrega" })
    .click();
  if (fulfillment !== "PICKUP")
    await page
      .locator(`input[name="fulfillment"][value="${fulfillment}"]`)
      .check();
  if (page.viewportSize()?.width === 320) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      audit.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: "docs/evidencias/checkout-mobile.png",
      fullPage: true,
    });
  }
  await page.locator('input[name="consent"]').check();
  await page.getByRole("button", { name: "Enviar pedido de teste" }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-f0-9]{64}$/);
  await expect(page.locator("#tracking-state")).toContainText(
    fulfillment === "QUOTE" ? "Aguardando cotação" : "Aguardando aceite",
  );
  return (await page.locator(".tracking-heading strong").textContent())!;
}
async function openOrder(page: Page, protocol: string) {
  await page.goto("/painel/pedidos");
  await pauseQueue(page);
  await page.getByRole("link").filter({ hasText: protocol }).click();
}
async function transition(page: Page, label: string, status: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.locator("#order-detail > .page-heading .badge")).toHaveText(
    status,
  );
}
test("J1 · pedido com retirada, pagamento simulado e atendimento completo", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const protocol = await checkout(page);
  const merchant = await browser.newContext();
  const panel = await merchant.newPage();
  await login(panel);
  await openOrder(panel, protocol);
  await transition(panel, "Aceitar pedido", "Pedido aceito");
  await page
    .getByRole("button", { name: "Atualizar pedido", exact: true })
    .click();
  await page.getByRole("button", { name: "Simular “já paguei”" }).click();
  await expect(page.locator("#tracking-payment")).toContainText(
    "declaração do comprador",
  );
  await panel.getByRole("button", { name: "Atualizar dados" }).click();
  await panel
    .getByRole("button", { name: "Simular conferência do lojista" })
    .click();
  await expect(panel.locator(".detail-layout > aside")).toContainText(
    "conferência do lojista",
  );
  await transition(panel, "Iniciar preparo", "Em preparo");
  await transition(panel, "Pronto para retirar", "Pronto para retirar");
  await transition(panel, "Concluir pedido", "Concluído");
  await page
    .getByRole("button", { name: "Atualizar pedido", exact: true })
    .click();
  await expect(page.locator("#tracking-state")).toContainText("Concluído");
  await expect(page.locator("#tracking-payment")).toContainText(
    "conferência do lojista",
  );
  await panel.screenshot({
    path: "docs/evidencias/painel-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await merchant.close();
});
test("J2 · entrega fixa, região e valor final", async ({ page, browser }) => {
  const protocol = await checkout(page, "FIXED");
  await expect(page.locator("#tracking-fee")).toContainText("6,00");
  await expect(page.locator("#tracking-total")).toContainText("38,00");
  const merchant = await browser.newContext();
  const panel = await merchant.newPage();
  await login(panel);
  await openOrder(panel, protocol);
  await transition(panel, "Aceitar pedido", "Pedido aceito");
  await transition(panel, "Iniciar preparo", "Em preparo");
  await transition(panel, "Saiu para entrega", "Saiu para entrega");
  await transition(panel, "Concluir pedido", "Concluído");
  await page
    .getByRole("button", { name: "Atualizar pedido", exact: true })
    .click();
  await expect(page.locator("#tracking-state")).toContainText("Concluído");
  await merchant.close();
});
test("J3 · cotação com aceite do comprador e confirmação do lojista", async ({
  page,
  browser,
}) => {
  const protocol = await checkout(page, "QUOTE");
  await expect(page.locator("#tracking-total")).toHaveText("A combinar");
  await expect(
    page.getByRole("button", { name: "Simular “já paguei”" }),
  ).toHaveCount(0);
  const merchant = await browser.newContext();
  const panel = await merchant.newPage();
  await login(panel);
  await openOrder(panel, protocol);
  await panel.getByRole("button", { name: "Enviar proposta de frete" }).click();
  await expect(
    panel.locator("#order-detail > .page-heading .badge"),
  ).toHaveText("Frete proposto");
  await page
    .getByRole("button", { name: "Atualizar pedido", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aceitar frete", exact: true })
    .click();
  await expect(page.locator("#tracking-total")).toContainText("41,00");
  await expect(
    page.getByRole("button", { name: "Simular “já paguei”" }),
  ).toHaveCount(0);
  await panel.getByRole("button", { name: "Atualizar dados" }).click();
  await transition(panel, "Aceitar pedido", "Pedido aceito");
  await page
    .getByRole("button", { name: "Atualizar pedido", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Simular “já paguei”" }),
  ).toBeVisible();
  await merchant.close();
});
test("B não consulta ou altera pedido de A e logout revoga acesso", async ({
  page,
  browser,
}) => {
  const protocol = await checkout(page);
  const merchant = await browser.newContext();
  const panel = await merchant.newPage();
  await login(panel);
  await openOrder(panel, protocol);
  const orderUrl = panel.url();
  await panel.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(panel).toHaveURL(/entrar$/);
  await login(panel, "verde");
  await expect(panel.locator("#order-list")).not.toContainText(protocol);
  const response = await panel.goto(orderUrl);
  expect(response?.status()).toBe(404);
  await expect(
    panel.getByRole("heading", { name: "Pedido não encontrado." }),
  ).toBeVisible();
  await merchant.close();
});
test("catálogo, fechamento e configuração são gerenciáveis pelo lojista", async ({
  page,
  browser,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Catálogo", exact: true }).click();
  const product = page
    .locator(".product-form")
    .filter({ has: page.locator('input[value="Café coado especial"]') });
  await openEditor(page, "Café coado especial");
  await product.getByLabel("Preço (R$)").fill("9.00");
  await openEditor(page, "Café coado especial");
  await Promise.all([
    page.waitForEvent("framenavigated"),
    product.getByRole("button", { name: "Salvar produto" }).click(),
  ]);
  await expect(page.locator('input[name="price"][value="9.00"]')).toHaveCount(
    1,
  );
  // Restore the fixture price so this suite can be repeated without destroying existing orders.
  await openEditor(page, "Café coado especial");
  await product.getByLabel("Preço (R$)").fill("8.00");
  await openEditor(page, "Café coado especial");
  await Promise.all([
    page.waitForEvent("framenavigated"),
    product.getByRole("button", { name: "Salvar produto" }).click(),
  ]);
  await expect(page.locator('input[name="price"][value="8.00"]')).toHaveCount(
    1,
  );
  await page.getByRole("link", { name: "Minha loja", exact: true }).click();
  await page.getByLabel("Loja aberta para novos pedidos de teste").uncheck();
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(page.locator("#feedback")).toContainText("Configurações salvas");
  const shopper = await browser.newContext();
  const store = await shopper.newPage();
  await store.goto("/loja/casa-do-forno");
  await expect(store.locator(".open-label")).toHaveText("Fechada para pedidos");
  await expect(
    store.getByRole("button", {
      name: "Adicionar Pão de fermentação natural",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByLabel("Loja aberta para novos pedidos de teste").check();
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(page.locator("#feedback")).toContainText("Configurações salvas");
  await shopper.close();
});
test("desktop e celular 320px · teclado, contraste e sem rolagem lateral", async ({
  page,
}) => {
  await mkdir("docs/evidencias", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/loja/casa-do-forno");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "docs/evidencias/loja-desktop.png",
    fullPage: true,
  });
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/loja/casa-do-forno");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  await page.screenshot({
    path: "docs/evidencias/loja-mobile.png",
    fullPage: true,
  });
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Pular para o conteúdo" }),
  ).toBeFocused();
  await page
    .getByRole("button", {
      name: "Adicionar Pão de fermentação natural",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#cart-subtotal")).toContainText("24,00");
});
test("loja B no celular 320px · checkout, rastreio e painel acessíveis", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await checkout(page, "PICKUP", "verde-mesa");
  await expect(page.locator("#tracking-total")).toContainText("42,00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  let results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  const merchant = await browser.newContext({
    viewport: { width: 320, height: 800 },
  });
  const panel = await merchant.newPage();
  await panel.goto("/painel/entrar");
  results = await new AxeBuilder({ page: panel })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await login(panel, "verde");
  expect(
    await panel.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  results = await new AxeBuilder({ page: panel })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await merchant.close();
});
test("resposta perdida e refresh recuperam o mesmo pedido sem duplicar", async ({
  page,
}) => {
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
  await page.locator('input[name="consent"]').check();
  let token = "";
  let count = 0;
  await page.route("**/api/v1/lojas/casa-do-forno/pedidos", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    token = result.token;
    count++;
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Enviar pedido de teste" }).click();
  await expect(page.locator("#feedback")).toHaveClass(/error/);
  expect(count).toBe(1);
  await page.unroute("**/api/v1/lojas/casa-do-forno/pedidos");
  await page.reload();
  await expect(page.locator("#feedback")).toContainText(
    "envio anterior em aberto",
  );
  await page.locator('input[name="consent"]').check();
  await page.getByRole("button", { name: "Enviar pedido de teste" }).click();
  await expect(page).toHaveURL(new RegExp(`/pedido/${token}$`));
});
