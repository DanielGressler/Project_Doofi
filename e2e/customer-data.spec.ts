import { pauseQueue } from "./ui-helpers";
import { expect, test } from "./fixtures";

test("cliente informa dados de envio após o carrinho e a loja os consulta com o login atual", async ({
  page,
  browser,
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
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page
    .getByRole("textbox", { name: /^Nome fictício/ })
    .fill("Pessoa de Entrega");
  await page
    .getByRole("textbox", { name: /^Telefone fictício/ })
    .fill("(00) 00000-5678");
  await page
    .getByRole("textbox", { name: /^E-mail fictício/ })
    .fill("entrega@exemplo.invalid");
  await page.locator('input[name="fulfillment"][value="FIXED"]').check();
  await page
    .getByLabel("Endereço fictício e número")
    .fill("Rua de Entrega, 456");
  await page.locator('input[name="consent"]').check();
  await page.getByRole("button", { name: "Enviar pedido de teste" }).click();
  await expect(page).toHaveURL(/\/pedido\/[a-f0-9]{64}$/);
  const protocol = (await page
    .locator(".tracking-heading strong")
    .textContent())!;
  const session = await (await page.request.get("/api/v1/session")).json();
  expect(session).toEqual({ authenticated: false });
  expect(await page.content()).not.toContain("entrega@exemplo.invalid");
  expect(await page.content()).not.toContain("00000-5678");
  expect(await page.content()).not.toContain("Rua de Entrega, 456");
  const context = await browser.newContext();
  try {
    const merchant = await context.newPage();
    await merchant.goto("/painel/entrar");
    await merchant
      .getByLabel("E-mail de demonstração")
      .fill("forno@demo.doofi.test");
    await merchant.getByRole("button", { name: "Entrar no painel" }).click();
    await expect(merchant).toHaveURL(/painel\/pedidos$/);
    await pauseQueue(merchant);
    await merchant.getByRole("link").filter({ hasText: protocol }).click();
    await expect(merchant.locator("#order-detail")).toContainText(
      "Pessoa de Entrega",
    );
    await expect(merchant.locator("#order-detail")).toContainText(
      "(00) 00000-5678",
    );
    await expect(merchant.locator("#order-detail")).toContainText(
      "entrega@exemplo.invalid",
    );
    await expect(merchant.locator("#order-detail")).toContainText(
      "Rua de Entrega, 456",
    );
  } finally {
    await context.close();
  }
});
