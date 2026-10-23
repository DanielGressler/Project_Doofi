import { pauseQueue, openEditor } from "./ui-helpers";
import { test, expect } from "@playwright/test";
import jpeg from "jpeg-js";
import { verifyGlobalTheme } from "./store-theme";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/painel/entrar");
  await page.getByLabel("E-mail de demonstração").fill("forno@demo.doofi.test");
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/painel\/pedidos$/);
  await pauseQueue(page);
}
const image = Buffer.from(
  jpeg.encode(
    { width: 12, height: 8, data: new Uint8Array(12 * 8 * 4).fill(255) },
    80,
  ).data,
);

test("combo, filtro por categoria e indisponibilidade do componente", async ({
  page,
  browser,
}) => {
  await login(page);
  await page.goto("/painel/catalogo");
  await page.getByRole("button", { name: "Novo combo" }).click();
  const form = page.locator("#new-combo");
  const title = `Combo teste ${Date.now()}`;
  await form.getByLabel("Nome do combo").fill(title);
  await form.getByLabel("Categoria").fill("Lanches");
  await form.getByLabel("Descrição", { exact: true }).fill("Pão e café juntos");
  await form.getByLabel("Produto 1 do combo").selectOption("a-pao");
  await form.getByLabel("Produto 2 do combo").selectOption("a-cafe");
  await form.getByLabel("Preço do combo (R$)").fill("29.00");
  await form.getByRole("button", { name: "Criar combo", exact: true }).click();
  await expect(
    page.locator(".catalog-card summary strong").filter({ hasText: title }),
  ).toBeVisible();
  const context = await browser.newContext(),
    shop = await context.newPage();
  await shop.goto("/loja/casa-do-forno");
  const card = shop
    .locator(".product-card")
    .filter({ has: shop.getByRole("heading", { name: title, exact: true }) });
  await shop.getByRole("button", { name: "Bebidas", exact: true }).click();
  await expect(card).toBeHidden();
  await shop.getByRole("button", { name: "Lanches", exact: true }).click();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Pão de fermentação natural");
  await card
    .getByRole("button", { name: `Adicionar ${title}`, exact: true })
    .click();
  await shop.getByRole("link", { name: "Continuar pedido" }).click();
  await shop
    .getByRole("link", { name: "Avançar para dados e entrega" })
    .click();
  await expect(shop.locator("#checkout-total")).toContainText("29,00");
  await shop.locator('input[name="consent"]').check();
  await shop.getByRole("button", { name: "Enviar pedido de teste" }).click();
  await expect(shop).toHaveURL(/pedido\/[a-f0-9]{64}$/);
  await expect(shop.locator("#tracking-items")).toContainText(title);
  const cafe = page
    .locator(".product-form")
    .filter({ has: page.locator('input[value="Café coado especial"]') });
  await openEditor(page, "Café coado especial");
  await cafe.getByLabel("Produto indisponível", { exact: true }).check();
  await openEditor(page, "Café coado especial");
  await Promise.all([
    page.waitForEvent("framenavigated"),
    cafe.getByRole("button", { name: "Salvar produto", exact: true }).click(),
  ]);
  await expect(
    cafe.getByLabel("Produto indisponível", { exact: true }),
  ).toBeChecked();
  await shop.goto("/loja/casa-do-forno");
  await expect(
    card.getByRole("button", { name: `Adicionar ${title}`, exact: true }),
  ).toBeDisabled();
  await openEditor(page, "Café coado especial");
  await cafe.getByLabel("Produto indisponível", { exact: true }).uncheck();
  await openEditor(page, "Café coado especial");
  await Promise.all([
    page.waitForEvent("framenavigated"),
    cafe.getByRole("button", { name: "Salvar produto", exact: true }).click(),
  ]);
  await expect(
    cafe.getByLabel("Produto indisponível", { exact: true }),
  ).not.toBeChecked();
  await context.close();
});

test("foto própria substitui a ilustração e é entregue normalizada pelo backend", async ({
  page,
  browser,
}) => {
  await login(page);
  await page.goto("/painel/catalogo");
  const cafe = page
    .locator(".product-form")
    .filter({ has: page.locator('input[value="Café coado especial"]') });
  await openEditor(page, "Café coado especial");
  await cafe
    .getByLabel("Foto própria (opcional)")
    .setInputFiles({ name: "cafe.jpg", mimeType: "image/jpeg", buffer: image });
  await openEditor(page, "Café coado especial");
  await Promise.all([
    page.waitForEvent("framenavigated"),
    cafe.getByRole("button", { name: "Salvar produto", exact: true }).click(),
  ]);
  await openEditor(page, "Café coado especial");
  await expect(cafe.locator("img.editor-photo")).toBeVisible();
  const context = await browser.newContext(),
    shop = await context.newPage();
  await shop.goto("/loja/casa-do-forno");
  const card = shop.locator(".product-card").filter({
    has: shop.getByRole("heading", {
      name: "Café coado especial",
      exact: true,
    }),
  });
  const photo = card.locator("img.product-photo");
  await expect(photo).toBeVisible();
  await expect(card.locator(".product-art")).toHaveCount(0);
  const response = await shop.request.get((await photo.getAttribute("src"))!);
  expect(response.status()).toBe(200);
  const decoded = jpeg.decode(await response.body());
  expect([decoded.width, decoded.height]).toEqual([960, 720]);
  await openEditor(page, "Café coado especial");
  await cafe.getByLabel("Remover foto e voltar à ilustração").check();
  await openEditor(page, "Café coado especial");
  await Promise.all([
    page.waitForEvent("framenavigated"),
    cafe.getByRole("button", { name: "Salvar produto", exact: true }).click(),
  ]);
  await expect(cafe.locator("img.editor-photo")).toHaveCount(0);
  await shop.reload();
  await expect(card.locator(".product-art")).toHaveCount(1);
  await context.close();
});

test("personalização e taxa fixa condicionada a entregador próprio", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await login(page);
  await page.goto("/painel/loja");
  await page.getByLabel("Possui entregador próprio", { exact: true }).uncheck();
  await expect(
    page.getByLabel("Taxa fixa de entrega (R$)", { exact: true }),
  ).toBeHidden();
  await page
    .getByLabel("Paleta de cores", { exact: true })
    .selectOption("ocean");
  await page
    .getByLabel("Estilo das fontes", { exact: true })
    .selectOption("simple");
  await page.getByLabel("Banner da loja (opcional)").setInputFiles({
    name: "banner.jpg",
    mimeType: "image/jpeg",
    buffer: image,
  });
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(page.locator("#feedback")).toContainText("Configurações salvas");
  const context = await browser.newContext(),
    shop = await context.newPage();
  await shop.goto("/loja/casa-do-forno");
  await expect(shop.locator("img.store-banner")).toBeVisible();
  await expect(shop.locator("html")).toHaveAttribute("style", /23638a/);
  await shop
    .getByRole("button", {
      name: "Adicionar Pão de fermentação natural",
      exact: true,
    })
    .click();
  await shop.getByRole("link", { name: "Continuar pedido" }).click();
  await shop
    .getByRole("link", { name: "Avançar para dados e entrega" })
    .click();
  await expect(shop.locator('input[value="FIXED"]')).toHaveCount(0);
  await page.reload();
  await page.getByLabel("Possui entregador próprio", { exact: true }).check();
  await page
    .getByLabel("Paleta de cores", { exact: true })
    .selectOption("terracotta");
  await page
    .getByLabel("Estilo das fontes", { exact: true })
    .selectOption("editorial");
  await page.getByLabel("Remover banner e voltar à ilustração").check();
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(page.locator("#feedback")).toContainText("Configurações salvas");
  await shop.reload();
  await expect(shop.locator('input[value="FIXED"]')).toHaveCount(1);
  await context.close();
  await verifyGlobalTheme(page, browser);
});
