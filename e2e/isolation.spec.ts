import { expect, test } from "./fixtures";

test("carrinhos por empresa, clientes em contextos separados e descarte dos dados do envio", async ({
  page,
  browser,
}) => {
  const slug = "casa-do-forno";
  await page.goto(`/loja/${slug}`);
  await page.evaluate(() =>
    localStorage.setItem(
      "doofi.lastOrder.casa-do-forno",
      JSON.stringify({ token: "legado" }),
    ),
  );
  const publicProducts = await page
    .locator("#store-app")
    .getAttribute("data-products");
  expect(publicProducts).not.toContain('"store_id"');
  expect(publicProducts).not.toContain('"version"');
  await page
    .getByRole("button", {
      name: "Adicionar Pão de fermentação natural",
      exact: true,
    })
    .click();
  await page.goto("/loja/verde-mesa/carrinho");
  await expect(page.locator("#cart-empty")).toBeVisible();
  await page.goto("/loja/verde-mesa");
  await page
    .getByRole("button", { name: "Adicionar Bowl de verão", exact: true })
    .click();
  await page.goto(`/loja/${slug}/carrinho`);
  await expect(page.locator("#cart-items")).toContainText(
    "Pão de fermentação natural",
  );
  await expect(page.locator("#cart-items")).not.toContainText("Bowl de verão");
  const clientB = await browser.newContext();
  try {
    const other = await clientB.newPage();
    await other.goto(`/loja/${slug}/carrinho`);
    await expect(other.locator("#cart-empty")).toBeVisible();
    await page
      .getByRole("link", { name: "Avançar para dados e entrega" })
      .click();
    await expect(page.locator("#submit-order")).toBeEnabled();
    expect(
      await page.evaluate(() =>
        localStorage.getItem("doofi.lastOrder.casa-do-forno"),
      ),
    ).toBeNull();
    await page
      .getByRole("textbox", { name: /^Nome fictício/ })
      .fill("Cliente Teste isolado A");
    await page
      .getByRole("textbox", { name: /^E-mail fictício/ })
      .fill("privado-a@exemplo.invalid");
    await page.locator('input[name="consent"]').check();
    await page.getByRole("button", { name: "Enviar pedido de teste" }).click();
    await expect(page).toHaveURL(/\/pedido\/[a-f0-9]{64}$/);
    await expect(page.locator("#tracking-state")).toContainText("Aguardando");
    const storage = await page.evaluate(() => ({
      shared: Object.keys(localStorage),
      tab: Object.keys(sessionStorage),
    }));
    expect(storage.shared).not.toContain("doofi.lastOrder.casa-do-forno");
    expect(
      storage.tab.filter(
        (key) =>
          key.startsWith("doofi.intent.casa-do-forno") ||
          key === "doofi.lastOrder.casa-do-forno",
      ),
    ).toEqual([]);
    expect(await page.content()).not.toContain("privado-a@exemplo.invalid");
    expect(await page.content()).not.toContain("Cliente Teste isolado A");
    await other.reload();
    await expect(other.locator("#cart-empty")).toBeVisible();
    await page.goto("/loja/verde-mesa/carrinho");
    await expect(page.locator("#cart-items")).toContainText("Bowl de verão");
  } finally {
    await clientB.close();
  }
});

test("HTML privado fica restrito à empresa autenticada e não permite cache", async ({
  browser,
}) => {
  const merchantA = await browser.newContext(),
    merchantB = await browser.newContext();
  try {
    const pageA = await merchantA.newPage(),
      pageB = await merchantB.newPage();
    const redirect = await merchantA.request.get("/painel/pedidos", {
      maxRedirects: 0,
    });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()["cache-control"]).toBe("no-store");
    for (const [page, email] of [
      [pageA, "forno@demo.doofi.test"],
      [pageB, "verde@demo.doofi.test"],
    ] as const) {
      await page.goto("/painel/entrar");
      await page.getByLabel("E-mail de demonstração").fill(email);
      await page.getByRole("button", { name: "Entrar no painel" }).click();
      await expect(page).toHaveURL(/painel\/pedidos$/);
    }
    const intent = await (
      await merchantA.request.post("/api/v1/lojas/casa-do-forno/intent", {
        headers: { origin: "http://localhost:4321" },
        data: {},
      })
    ).json();
    const response = await merchantA.request.post(
      "/api/v1/lojas/casa-do-forno/pedidos",
      {
        headers: { origin: "http://localhost:4321" },
        data: {
          intent: intent.intent,
          items: [{ productId: "a-pao", quantity: 1 }],
          fulfillment: "FIXED",
          payment: "PIX_SIMULATED",
          name: "Cliente Teste secreto A",
          phone: "00000000",
          email: "privado-a@exemplo.invalid",
          address: "Rua privativa A, 123",
          neighborhood: "Centro",
          postalCode: "00000000",
          consent: true,
          syntheticData: true,
        },
      },
    );
    expect(response.status()).toBe(201);
    const created = await response.json();
    const privateResponse = await pageA.goto(`/painel/pedidos/${created.id}`);
    expect(privateResponse!.headers()["cache-control"]).toBe("no-store");
    expect(privateResponse!.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(pageA.locator("#order-detail")).toContainText(
      "privado-a@exemplo.invalid",
    );
    const denied = await pageB.goto(`/painel/pedidos/${created.id}`);
    expect(denied!.status()).toBe(404);
    expect(await pageB.content()).not.toContain("privado-a@exemplo.invalid");
    expect(await pageB.content()).not.toContain("Rua privativa A");
    const publicResponse = await pageB.goto(`/pedido/${created.token}`);
    expect(publicResponse!.headers()["cache-control"]).toBe("no-store");
    expect(await pageB.content()).not.toContain("privado-a@exemplo.invalid");
    expect(await pageB.content()).not.toContain("Rua privativa A");
  } finally {
    await merchantA.close();
    await merchantB.close();
  }
});
