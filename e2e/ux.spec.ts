import { expect, test, type Page, type APIRequestContext } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { pauseQueue } from "./ui-helpers";
const origin = "http://localhost:4321";
async function audit(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
}
test("carrinho tem tela própria, controles visíveis e só depois solicita os dados", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/loja/casa-do-forno");
  for (const title of [
    "Pão de fermentação natural",
    "Café coado especial",
    "Croissant da casa",
  ]) {
    await page
      .getByRole("button", { name: `Adicionar ${title}`, exact: true })
      .click();
  }
  await page.getByRole("link", { name: "Continuar pedido" }).click();
  await expect(page).toHaveURL(/carrinho$/);
  await expect(page.locator("#cart-items .cart-item")).toHaveCount(3);
  await expect(page.locator('input[name="name"]')).toHaveCount(0);
  await expect(page.locator("#cart-next")).toBeInViewport({ ratio: 1 });
  await audit(page);
  await page.screenshot({
    path: "docs/evidencias/carrinho-mobile.png",
    fullPage: true,
  });
  await page.locator("#cart-next").click();
  await expect(page.getByLabel("Nome fictício", { exact: true })).toBeVisible();
  await page
    .getByLabel("Pagamento de demonstração", { exact: true })
    .selectOption("ON_FULFILLMENT_SIMULATED");
  await expect(page.locator(".checkout-review")).not.toHaveAttribute("open");
});
test("cadastro leva ao roteiro, salva o visual e mantém o catálogo exclusivo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/painel/entrar");
  await page
    .getByRole("button", { name: "Criar minha loja", exact: true })
    .click();
  await audit(page);
  await page.getByLabel("Nome da nova loja").fill("Doces do tutorial");
  await page
    .getByLabel("E-mail da nova loja")
    .fill(`tutorial-${Date.now()}@exemplo.invalid`);
  await page.getByLabel("Senha para a nova loja").fill("senha-de-teste");
  await page.getByLabel("Estou criando uma loja").check();
  await page.getByRole("button", { name: "Criar loja e personalizar" }).click();
  await expect(page).toHaveURL(/loja\?tutorial=1$/);
  await expect(
    page.getByRole("heading", { name: "Identidade da loja" }),
  ).toBeVisible();
  await page.getByLabel("Nome da loja", { exact: true }).fill("Doces da Vila");
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(
    page.getByLabel("Taxa fixa de entrega (R$)", { exact: true }),
  ).toBeHidden();
  await page.getByLabel("Possui entregador próprio", { exact: true }).check();
  await page
    .getByLabel("Taxa fixa de entrega (R$)", { exact: true })
    .fill("5.00");
  await page.getByRole("button", { name: "Próximo" }).click();
  await page
    .getByLabel("Paleta de cores", { exact: true })
    .selectOption("ocean");
  await page
    .getByLabel("Layout da página", { exact: true })
    .selectOption("compact");
  await page
    .getByLabel("Banner ilustrado pronto", { exact: true })
    .selectOption("sweets");
  await expect(page.locator("#store-guide [data-guide-title]")).toContainText(
    "visual da loja inteira",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/evidencias/guia-personalizacao-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(page.locator("#wizard-review")).toContainText("Doces da Vila");
  await audit(page);
  await page.getByRole("button", { name: "Salvar e continuar o guia" }).click();
  await expect(page).toHaveURL(/painel\/catalogo\?tutorial=1&capitulo=0$/);
  await expect(page.locator(".catalog-card")).toHaveCount(0);
  const store = await (await page.request.get("/painel/api/v1/loja")).json();
  expect(store).toMatchObject({
    title: "Doces da Vila",
    palette: "ocean",
    layout: "compact",
    theme: "sweets",
    setup_complete: 0,
    is_open: 0,
  });
  for (const heading of [
    "Seu primeiro produto",
    "Dois produtos",
    "Pronto para testar",
  ]) {
    await page.locator("#catalog-guide [data-guide-next]").click();
    await expect(
      page.locator("#catalog-guide [data-guide-title]"),
    ).toContainText(heading);
  }
  await audit(page);
  await page.locator("[data-guide-finish]").click();
  await expect(page).toHaveURL(/painel\/pedidos$/);
  expect(
    (await (await page.request.get("/painel/api/v1/loja")).json())
      .setup_complete,
  ).toBe(1);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByLabel("E-mail de demonstração").fill("forno@demo.doofi.test");
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/painel\/pedidos$/);
});
test("catálogo compacto, pop-ups com teclado e combos em seção própria", async ({
  page,
}) => {
  await page.goto("/painel/entrar");
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/painel\/pedidos$/);
  await pauseQueue(page);
  await page.goto("/painel/catalogo");
  await expect(page.locator(".catalog-card.is-expanded")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 800 });
  const button = page.getByRole("button", { name: "Novo produto" });
  await button.click();
  await expect(
    page.getByRole("dialog", { name: "Criar produto", exact: true }),
  ).toBeVisible();
  await audit(page);
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  await page.getByRole("button", { name: "Novo combo" }).click();
  await expect(
    page.getByRole("dialog", { name: "Criar combo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar criação" }).click();
  await page.locator(".catalog-card [data-product-toggle]").first().click();
  await expect(page.locator(".catalog-card.is-expanded")).toHaveCount(1);
  const expanded = page.locator(".catalog-card.is-expanded");
  await expect(expanded.locator("[data-product-toggle]")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expanded.locator("[data-product-toggle]").click();
  await expect(page.locator(".catalog-card.is-expanded")).toHaveCount(0);
  await expect(
    page.locator(".catalog-card .product-form").first(),
  ).toBeHidden();
  await audit(page);
});
async function prepare(request: APIRequestContext) {
  const result = await request.post("/painel/api/v1/register", {
    headers: { origin },
    data: {
      title: "Fila exclusiva",
      email: `fila-${Date.now()}@exemplo.invalid`,
      password: "senha-de-teste",
      syntheticData: true,
    },
  });
  expect(result.status()).toBe(201);
  const session = await (await request.get("/painel/api/v1/session")).json();
  const headers = { origin, "x-csrf-token": session.csrfToken };
  const store = await (await request.get("/painel/api/v1/loja")).json();
  expect(
    (
      await request.patch("/painel/api/v1/loja", {
        headers,
        data: {
          ...store,
          finishSetup: true,
          is_open: true,
          has_own_delivery: true,
          delivery_fee: 500,
        },
      })
    ).ok(),
  ).toBe(true);
  const product = await (
    await request.post("/painel/api/v1/produtos", {
      headers,
      data: {
        title: "Doce fictício",
        description: "Doce para teste da fila",
        category: "Doces",
        price: 1000,
        unavailable: false,
        image: "bread",
      },
    })
  ).json();
  return { slug: store.slug, product: product.id };
}
async function create(
  request: APIRequestContext,
  store: { slug: string; product: string },
  fulfillment = "PICKUP",
) {
  const intent = await (
    await request.post(`/api/v1/lojas/${store.slug}/intent`, {
      headers: { origin },
      data: {},
    })
  ).json();
  const response = await request.post(`/api/v1/lojas/${store.slug}/pedidos`, {
    headers: { origin },
    data: {
      intent: intent.intent,
      items: [{ productId: store.product, quantity: 1 }],
      fulfillment,
      payment: "PIX_SIMULATED",
      name: "Pessoa de teste",
      phone: "00000000",
      email: "teste@exemplo.invalid",
      address: "Rua de teste, 123",
      neighborhood: "Centro",
      postalCode: "00000000",
      consent: true,
      syntheticData: true,
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
test("fila mantém o primeiro em foco, empilha chegadas, aceita, recusa e propõe frete", async ({
  page,
}) => {
  test.setTimeout(120000);
  const store = await prepare(page.request);
  const first = await create(page.request, store);
  await page.goto("/painel/pedidos");
  await expect(page.locator("#queue-title")).toContainText(first.protocol);
  await expect(page.locator("#queue-items")).toContainText("Doce fictício");
  await expect(page.locator("#queue-total")).toContainText("10,00");
  const reject = await page.locator("#queue-reject").boundingBox(),
    accept = await page.locator("#queue-accept").boundingBox();
  expect(reject!.x).toBeLessThan(accept!.x);
  expect(Math.abs(reject!.y - accept!.y)).toBeLessThan(2);
  expect(
    await page
      .locator("#queue-total")
      .evaluate((node) => Number(getComputedStyle(node).fontWeight)),
  ).toBeGreaterThanOrEqual(700);
  await page.locator("#pause-order-queue").click();
  await page.locator("#enable-order-alerts").click();
  await expect(page.locator("#enable-order-alerts")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#open-order-queue").click();
  const second = await create(page.request, store, "FIXED");
  await expect(page.locator("#queue-count")).toContainText(
    "1 pedido(s) atrás",
    { timeout: 25000 },
  );
  await expect(page.locator("#queue-title")).toContainText(first.protocol);
  await expect(page.locator("#queue-stack")).toHaveClass(/has-next/);
  await page.setViewportSize({ width: 320, height: 800 });
  await audit(page);
  await page.screenshot({
    path: "docs/evidencias/fila-pedidos-mobile.png",
    fullPage: true,
  });
  await page.locator("#queue-accept").click();
  await expect(page.locator("#queue-title")).toContainText(second.protocol);
  await expect(page.locator("#queue-location")).toContainText(
    "Rua de teste, 123",
  );
  await expect(page.locator("#queue-total")).toContainText("15,00");
  await page.locator("#queue-reason").fill("Item indisponível no teste");
  await page.locator("#queue-reject").click();
  await expect(page.locator("#order-queue")).toBeHidden();
  const quote = await create(page.request, store, "QUOTE");
  await page.locator("#refresh-orders").click();
  await expect(page.locator("#queue-title")).toContainText(quote.protocol);
  await expect(page.locator("#queue-accept")).toBeHidden();
  await page.getByLabel("Frete da proposta (R$)").fill("7.00");
  await page.getByRole("button", { name: "Enviar proposta de frete" }).click();
  await expect(page.locator("#order-queue")).toBeHidden();
  expect(
    (
      await (
        await page.request.get(`/painel/api/v1/pedidos/${first.id}`)
      ).json()
    ).status,
  ).toBe("ACCEPTED");
  expect(
    (
      await (
        await page.request.get(`/painel/api/v1/pedidos/${second.id}`)
      ).json()
    ).status,
  ).toBe("REJECTED");
  expect(
    (
      await (
        await page.request.get(`/painel/api/v1/pedidos/${quote.id}`)
      ).json()
    ).status,
  ).toBe("QUOTE_PROPOSED");
  const fourth = await create(page.request, store);
  await page.locator("#refresh-orders").click();
  await expect(page.locator("#queue-title")).toContainText(fourth.protocol);
  const tracking = await (
    await page.request.get(`/api/v1/pedidos/${quote.token}`)
  ).json();
  const approved = await page.request.post(
    `/api/v1/pedidos/${quote.token}/accept-quote`,
    {
      headers: { origin },
      data: {
        nonce: tracking.actionNonce,
        version: tracking.version,
        quoteVersion: tracking.quote.version,
      },
    },
  );
  expect(approved.ok()).toBe(true);
  await expect(page.locator("#queue-count")).toContainText(
    "1 pedido(s) atrás",
    { timeout: 25000 },
  );
  await expect(page.locator("#queue-title")).toContainText(fourth.protocol);
  await page.keyboard.press("Escape");
  await expect(page.locator("#order-queue")).toBeHidden();
  expect(
    (
      await (
        await page.request.get(`/painel/api/v1/pedidos/${fourth.id}`)
      ).json()
    ).status,
  ).toBe("PENDING");
  await page.locator("#open-order-queue").click();
  await expect(page.locator("#queue-title")).toContainText(fourth.protocol);
  const session = await (
    await page.request.get("/painel/api/v1/session")
  ).json();
  const otherDecision = await page.request.post(
    `/painel/api/v1/pedidos/${fourth.id}/transicoes`,
    {
      headers: { origin, "x-csrf-token": session.csrfToken },
      data: { version: 0, status: "ACCEPTED" },
    },
  );
  expect(otherDecision.ok()).toBe(true);
  await page.locator("#queue-accept").click();
  await expect(page.locator("#queue-feedback")).toContainText("atualizado");
  await page.locator("#queue-reload").click();
  await expect(page.locator("#queue-title")).toContainText(quote.protocol);
  await expect(page.locator("#queue-total")).toContainText("17,00");
  await page.locator("#queue-accept").click();
  await expect(page.locator("#order-queue")).toBeHidden();
  await page.locator("#status-filter").focus();
  const fifth = await create(page.request, store);
  await expect(page.locator("#open-order-queue")).toHaveText(
    /Atender fila \(1/,
    { timeout: 25000 },
  );
  await expect(page.locator("#order-queue")).toBeHidden();
  await expect(page.locator("#status-filter")).toBeFocused();
  await page.locator("#open-order-queue").click();
  await expect(page.locator("#queue-title")).toContainText(fifth.protocol);
  await page.locator("#queue-reject").click();
  await expect(page.locator("#queue-reason-error")).toContainText(
    "pelo menos 3",
  );
  await expect(page.locator("#queue-reason")).toBeFocused();
  await page.locator("#queue-reason").fill("Motivo de teste");
  await expect(page.locator("#queue-reason")).not.toHaveAttribute(
    "aria-invalid",
  );
  await page.locator("#queue-reject").click();
  await expect(page.locator("#order-queue")).toBeHidden();
});
