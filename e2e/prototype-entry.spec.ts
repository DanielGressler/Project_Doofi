import { expect, test } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test("entrada tem só duas experiências e cliente segue à lista de lojas", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("main a")).toHaveCount(2);
  await expect(page.locator('a[href^="/loja/"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Sou cliente/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sou lojista/ })).toHaveAttribute(
    "href",
    "/painel/entrar",
  );
  await page.screenshot({
    path: "docs/evidencias/entrada-experiencias.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".role-card")
      .first()
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("link", { name: /Sou cliente/ }).click();
  await expect(page).toHaveURL(/\/lojas$/);
  await expect(
    page.getByRole("link", { name: "Conhecer Casa do Forno" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Conhecer Verde à Mesa" }),
  ).toBeVisible();
  expect(await page.content()).not.toContain("forno@demo.doofi.test");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.goto("/demo");
  await expect(page).toHaveURL("/");
});

test("validadores locais bloqueiam dados comuns e aceitam apenas formatos de teste", async ({
  page,
}) => {
  await page.goto("/painel/entrar");
  const loginEmail = page.getByLabel("E-mail de demonstração");
  await loginEmail.fill("loja@gmail.com");
  expect(
    await loginEmail.evaluate(
      (input: HTMLInputElement) => input.validationMessage,
    ),
  ).toContain("E-mails reais");
  await page
    .getByRole("button", { name: "Criar minha loja", exact: true })
    .click();
  await expect(page.locator("#register-guide")).toBeVisible();
  const email = page.getByLabel("E-mail da nova loja"),
    phone = page.getByLabel("Telefone fictício da loja");
  await email.fill("loja@exemplo.invalid");
  await phone.fill("(11) 99999-1234");
  expect(
    await phone.evaluate((input: HTMLInputElement) => input.checkValidity()),
  ).toBe(false);
  await phone.fill("(00) 00000-1234");
  expect(
    await phone.evaluate((input: HTMLInputElement) => input.checkValidity()),
  ).toBe(true);
  await page.goto("/loja/casa-do-forno");
  await page
    .getByRole("button", {
      name: "Adicionar Pão de fermentação natural",
      exact: true,
    })
    .click();
  await page.goto("/loja/casa-do-forno/checkout");
  for (const [name, real, fake] of [
    ["name", "Maria Silva", "Cliente Teste 02"],
    ["phone", "(11) 99999-1234", "(00) 00000-0002"],
    ["email", "cliente@gmail.com", "cliente@exemplo.invalid"],
  ]) {
    const input = page.locator(`input[name="${name}"]`);
    await input.fill(real);
    expect(
      await input.evaluate((node: HTMLInputElement) => node.checkValidity()),
    ).toBe(false);
    await input.fill(fake);
    expect(
      await input.evaluate((node: HTMLInputElement) => node.checkValidity()),
    ).toBe(true);
  }
  await page.locator('[name="email"]').fill("cliente@gmail.com");
  await page
    .locator("#checkout-form")
    .evaluate((form: HTMLFormElement) => form.reset());
  await expect(page.locator('[name="email"]')).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});
