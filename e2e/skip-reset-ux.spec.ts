import { expect, test, type Page } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { pauseQueue } from "./ui-helpers";
async function register(page: Page, skip = false) {
  await page.goto("/painel/entrar");
  await page
    .getByRole("button", { name: "Criar minha loja", exact: true })
    .click();
  await page.getByLabel("Nome da nova loja").fill("Loja de teste opcional");
  await page
    .getByLabel("E-mail da nova loja")
    .fill(`skip-${Date.now()}@exemplo.invalid`);
  await page.getByLabel("Senha para a nova loja").fill("senha-de-teste");
  await page.getByLabel("Estou criando uma loja").check();
  if (skip) {
    await expect(page.locator('input[name="skipTutorial"]')).toHaveCount(0);
    await page.locator("#register-guide [data-guide-skip]").click();
    await expect(page.locator("#register-guide")).toBeHidden();
  }
  await page
    .getByRole("button", {
      name: skip ? "Criar loja sem tutorial" : "Criar loja e personalizar",
    })
    .click();
}
test("cadastro pode dispensar o guia e retomá-lo depois pelo rodapé", async ({
  page,
}) => {
  await register(page, true);
  await expect(page).toHaveURL(/\/painel\/catalogo$/);
  await expect(page.locator("#catalog-guide")).toHaveCount(0);
  const store = await (await page.request.get("/painel/api/v1/loja")).json();
  expect(store.setup_complete).toBe(1);
  expect(store.is_open).toBe(0);
  await page.getByRole("link", { name: "Guia da loja", exact: true }).click();
  await expect(page.locator("#store-guide")).toBeVisible();
});
test("pular preserva edições, permite salvar sem roteiro e mantém os rascunhos do catálogo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await register(page);
  await expect(page).toHaveURL(/\/painel\/loja\?tutorial=1$/);
  await page.locator("[data-guide-motion]").click();
  await expect(page.locator("[data-guide-motion]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    await page
      .locator(".novel-character")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  await page
    .getByLabel("Nome da loja", { exact: true })
    .fill("Marca editada antes de pular");
  await page.getByRole("button", { name: "Próximo" }).click();
  await page.getByLabel("Possui entregador próprio", { exact: true }).check();
  await page
    .getByLabel("Taxa fixa de entrega (R$)", { exact: true })
    .fill("4.50");
  await page
    .getByRole("button", { name: "Pular tutorial", exact: true })
    .click();
  await expect(page.locator("#store-guide")).toBeHidden();
  await expect(page.getByLabel("Nome da loja", { exact: true })).toHaveValue(
    "Marca editada antes de pular",
  );
  await expect(
    page.getByLabel("Taxa fixa de entrega (R$)", { exact: true }),
  ).toHaveValue("4.50");
  await expect(
    page.getByLabel("Paleta de cores", { exact: true }),
  ).toBeVisible();
  const before = await (await page.request.get("/painel/api/v1/loja")).json();
  expect(before.setup_complete).toBe(1);
  expect(before.has_own_delivery).toBe(0);
  expect(before.title).toBe("Loja de teste opcional");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Salvar configurações", exact: true })
    .click();
  await expect(page.locator("#feedback")).toContainText("Configurações salvas");
  const after = await (await page.request.get("/painel/api/v1/loja")).json();
  expect(after.title).toBe("Marca editada antes de pular");
  expect(after.delivery_fee).toBe(450);
  expect(after.has_own_delivery).toBe(1);
  await page.goto("/painel/catalogo?tutorial=1");
  await page
    .getByRole("button", { name: "Novo produto", exact: false })
    .click();
  await page
    .getByLabel("Nome do produto", { exact: true })
    .fill("Rascunho de teste");
  await page
    .getByRole("button", { name: "Pular tutorial", exact: true })
    .click();
  await expect(page.locator("#catalog-tutorial")).toBeHidden();
  await expect(page.getByLabel("Nome do produto", { exact: true })).toHaveValue(
    "Rascunho de teste",
  );
  await expect(page.locator("#product-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Novo produto", exact: false })
    .click();
  await expect(page.getByLabel("Nome do produto", { exact: true })).toHaveValue(
    "Rascunho de teste",
  );
});
test("nova geração limpa carrinhos e contatos antigos sem remover o acesso externo", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await context.addCookies([
    {
      name: "CF_Authorization",
      value: "acesso-de-teste",
      domain: "localhost",
      path: "/",
      httpOnly: true,
    },
  ]);
  await page.evaluate(() => {
    localStorage.setItem("doofi.dataset", "antigo");
    localStorage.setItem("doofi.cart.casa-do-forno", '{"a-pao":2}');
    sessionStorage.setItem("doofi.dataset", "antigo");
    sessionStorage.setItem(
      "doofi.intent.casa-do-forno.payload",
      "contato antigo",
    );
    localStorage.setItem("unrelated", "preservar");
  });
  await page.goto("/loja/casa-do-forno/carrinho");
  await expect(page.locator("#cart-empty")).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("doofi.intent.casa-do-forno.payload"),
    ),
  ).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("unrelated"))).toBe(
    "preservar",
  );
  expect(
    (await context.cookies()).find(
      (cookie) => cookie.name === "CF_Authorization",
    )?.value,
  ).toBe("acesso-de-teste");
  await context.addCookies([
    {
      name: "doofi_panel",
      value: "a".repeat(64),
      domain: "localhost",
      path: "/painel",
      httpOnly: true,
    },
  ]);
  await page.goto("/painel/catalogo");
  await expect(page).toHaveURL(/\/painel\/entrar$/);
  expect(
    (await context.cookies()).some((cookie) => cookie.name === "doofi_panel"),
  ).toBe(false);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "CF_Authorization",
    ),
  ).toBe(true);
});
test("atualização é automática, pode ser pausada e retoma sem botão de atualizar", async ({
  page,
}) => {
  await page.clock.install();
  let reads = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/painel/api/v1/visao-geral")) reads++;
  });
  await page.goto("/painel/entrar");
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/\/painel\/pedidos$/);
  await pauseQueue(page);
  await expect(page.locator("#refresh-orders")).toHaveCount(0);
  await expect(page.locator("#queue-reload")).toHaveCount(0);
  const initial = reads;
  await page.clock.fastForward(6500);
  await expect.poll(() => reads).toBeGreaterThan(initial);
  await page.getByText("Preferências dos avisos", { exact: true }).click();
  await page.locator("#pause-order-updates").click();
  await expect(page.locator("#pause-order-updates")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const before = reads;
  await page.clock.fastForward(65000);
  expect(reads).toBe(before);
  const resumed = page.waitForResponse((response) =>
    response.url().endsWith("/painel/api/v1/visao-geral"),
  );
  await page.locator("#pause-order-updates").click();
  await resumed;
  await expect(page.locator("#pause-order-updates")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(reads).toBe(before + 1);
});

test("guia aponta um campo por vez e acompanha o cadastro real sem reabrir um formulário vazio", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await register(page);
  await expect(page).toHaveURL(/\/painel\/loja\?tutorial=1$/);
  await page.locator("#store-guide [data-guide-skip]").click();
  await expect(page.locator("#store-guide")).toBeHidden();
  await page.goto("/painel/catalogo?tutorial=1");
  const guide = page.locator("#catalog-guide");
  await page.locator('[data-open-dialog="product-dialog"]').click();
  const form = page.locator("#new-product");
  for (const [name, value] of [
    ["title", "Bolo do guia Teste"],
    ["category", "Doces"],
    ["description", "Porção fictícia para testar o cadastro guiado"],
    ["price", "12.50"],
  ]) {
    await expect(form.locator(`[name="${name}"]`)).toHaveClass(/guide-target/);
    await expect(page.locator(".guide-target")).toHaveCount(1);
    await form.locator(`[name="${name}"]`).fill(value);
    await guide.locator("[data-guide-next]").click();
  }
  for (const name of ["image", "photo", "unavailable"]) {
    await expect(form.locator(`[name="${name}"]`)).toHaveClass(/guide-target/);
    await guide.locator("[data-guide-next]").click();
  }
  await expect(form.locator('button[type="submit"]')).toHaveClass(
    /guide-target/,
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/evidencias/guia-produto-mobile.png",
    fullPage: false,
  });
  await form
    .getByRole("button", { name: "Criar produto fictício", exact: true })
    .click();
  await expect(guide).toHaveAttribute("data-chapter", "10");
  await expect(page.locator("#product-dialog")).not.toBeVisible();
  const card = page
    .locator(".catalog-card")
    .filter({ hasText: "Bolo do guia Teste" });
  await expect(card).toBeVisible();
  await expect(card.locator("[data-product-toggle]")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await guide.locator("[data-guide-skip]").click();
  await expect(page.locator(".guide-target")).toHaveCount(0);
  await expect(page.locator("h1")).toBeFocused();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "docs/evidencias/catalogo-destaque-mobile.png",
    fullPage: true,
  });
});
