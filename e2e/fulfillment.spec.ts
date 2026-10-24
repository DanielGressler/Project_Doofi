import { test, expect, type Page } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

const origin = "http://localhost:4321";
async function receive(page: Page, token: string) {
  const current = await (
    await page.request.get(`/api/v1/pedidos/${token}`)
  ).json();
  expect(
    (
      await page.request.post(`/api/v1/pedidos/${token}/confirm-receipt`, {
        headers: { origin },
        data: { version: current.version, nonce: current.actionNonce },
      })
    ).ok(),
  ).toBe(true);
  await page.locator("#reload-detail").click();
  await expect(page.locator("#customer-receipt-state")).toContainText(
    "Recebimento confirmado pelo cliente",
  );
}
async function scenario(page: Page, fulfillment = "PICKUP", accepted = false) {
  const registered = await page.request.post("/painel/api/v1/register", {
    headers: { origin },
    data: {
      title: "Loja de entrega Teste",
      email: `delivery-${Date.now()}@exemplo.invalid`,
      password: "senha-de-teste",
      syntheticData: true,
      skipTutorial: true,
    },
  });
  expect(registered.status()).toBe(201);
  const session = await (
    await page.request.get("/painel/api/v1/session")
  ).json();
  const headers = { origin, "x-csrf-token": session.csrfToken };
  const store = await (await page.request.get("/painel/api/v1/loja")).json();
  expect(
    (
      await page.request.patch("/painel/api/v1/loja", {
        headers,
        data: {
          ...store,
          is_open: true,
          has_own_delivery: true,
          delivery_fee: 500,
        },
      })
    ).ok(),
  ).toBe(true);
  const product = await (
    await page.request.post("/painel/api/v1/produtos", {
      headers,
      data: {
        title: "Produto de entrega Teste",
        description: "Porção fictícia para testar o atendimento",
        category: "Lanches",
        price: 1250,
        unavailable: false,
        image: "bread",
      },
    })
  ).json();
  const { intent } = await (
    await page.request.post(`/api/v1/lojas/${store.slug}/intent`, {
      headers: { origin },
      data: {},
    })
  ).json();
  const response = await page.request.post(
    `/api/v1/lojas/${store.slug}/pedidos`,
    {
      headers: { origin },
      data: {
        intent,
        items: [{ productId: product.id, quantity: 1 }],
        fulfillment,
        payment: "ON_FULFILLMENT_SIMULATED",
        name: "Cliente Teste",
        phone: "00000000",
        email: "cliente@exemplo.invalid",
        address: "Rua Fictícia, 10",
        neighborhood: "Centro",
        postalCode: "00000000",
        consent: true,
        syntheticData: true,
      },
    },
  );
  expect(response.status()).toBe(201);
  const order = await response.json();
  if (accepted)
    expect(
      (
        await page.request.post(
          `/painel/api/v1/pedidos/${order.id}/transicoes`,
          { headers, data: { version: 0, status: "ACCEPTED" } },
        )
      ).ok(),
    ).toBe(true);
  return { ...order, headers, path: `/painel/pedidos/${order.id}` };
}

test("Meus pedidos confirma recebimento, recupera resposta perdida e libera somente a própria compra", async ({
  page,
  browser,
}) => {
  const order = await scenario(page, "FIXED", true);
  const customer = await browser.newContext({
    viewport: { width: 320, height: 900 },
  });
  const otherCustomer = await browser.newContext();
  try {
    const client = await customer.newPage(),
      stranger = await otherCustomer.newPage();
    await client.goto(`/pedido/${order.token}`);
    await client
      .getByRole("link", { name: "Meus pedidos", exact: true })
      .first()
      .click();
    await expect(client.locator(".customer-order-card")).toHaveCount(1);
    await expect(
      client.getByRole("button", {
        name: "Confirmar recebimento",
        exact: true,
      }),
    ).toHaveCount(0);
    await stranger.goto("/meus-pedidos");
    await expect(stranger.locator("#customer-orders-empty")).toBeVisible();
    await expect(stranger.locator(".customer-order-card")).toHaveCount(0);
    await page.goto(order.path);
    await page
      .getByRole("button", { name: "Pedido pronto", exact: true })
      .click();
    await expect(page.locator("#order-status")).toHaveText("Pedido pronto");
    await expect(
      page.getByRole("button", { name: "Entregar pedido", exact: true }),
    ).toBeDisabled();
    const forbidden = await page.request.post(
      `/painel/api/v1/pedidos/${order.id}/transicoes`,
      {
        headers: order.headers,
        data: { version: 2, status: "COMPLETED", received_at: 1 },
      },
    );
    expect(forbidden.status()).toBe(409);
    expect((await forbidden.json()).code).toBe("RECEIPT_REQUIRED");
    await client
      .getByRole("button", { name: "Atualizar meus pedidos", exact: true })
      .click();
    await expect(
      client.getByRole("button", {
        name: "Confirmar recebimento",
        exact: true,
      }),
    ).toBeVisible();
    let writes = 0;
    await client.route(
      `**/api/v1/pedidos/${order.token}/confirm-receipt`,
      async (route) => {
        writes++;
        expect((await route.fetch()).status()).toBe(200);
        await route.abort("failed");
      },
    );
    await client
      .getByRole("button", { name: "Confirmar recebimento", exact: true })
      .click();
    await expect(client.locator(".receipt-confirmation")).toContainText(
      "Recebimento confirmado",
    );
    await expect(
      client.locator('.receipt-confirmation [role="status"]'),
    ).toBeFocused();
    expect(writes).toBe(1);
    await expect(
      client.getByRole("button", {
        name: "Confirmar recebimento",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      await client.evaluate(() => localStorage.getItem("doofi.customerOrders")),
    ).toBeNull();
    const references = await client.evaluate(() =>
      JSON.parse(sessionStorage.getItem("doofi.customerOrders")!),
    );
    expect(Object.keys(references[0]).sort()).toEqual(["savedAt", "token"]);
    expect(
      (await customer.cookies()).some((cookie) =>
        /doofi_panel/.test(cookie.name),
      ),
    ).toBe(false);
    expect(
      await client.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page: client })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await client.evaluate(() => scrollTo(0, 0));
    await client.screenshot({
      path: "docs/evidencias/cliente-recebimento-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.locator("#reload-detail").click();
    await expect(page.locator("#customer-receipt-state")).toContainText(
      "Recebimento confirmado pelo cliente",
    );
    await page
      .getByRole("button", { name: "Entregar pedido", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar entrega", exact: true })
      .click();
    await expect(page.locator("#order-status")).toHaveText("Concluído");
    await client
      .getByRole("button", { name: "Atualizar meus pedidos", exact: true })
      .click();
    await expect(client.locator(".badge")).toHaveText("Concluído");
  } finally {
    await customer.close();
    await otherCustomer.close();
  }
});

test("cliente com tela antiga recupera confirmação já registrada e conclusão sem misturar versões", async ({
  page,
  browser,
}) => {
  const order = await scenario(page, "PICKUP", true);
  await page.goto(order.path);
  await page
    .getByRole("button", { name: "Pedido pronto", exact: true })
    .click();
  await expect(page.locator("#order-status")).toHaveText("Pedido pronto");
  const context = await browser.newContext();
  try {
    const client = await context.newPage();
    await client.goto(`/pedido/${order.token}`);
    await client
      .getByRole("link", { name: "Meus pedidos", exact: true })
      .first()
      .click();
    const button = client.getByRole("button", {
      name: "Confirmar recebimento",
      exact: true,
    });
    await expect(button).toBeVisible();
    await button.focus();
    await receive(page, order.token);
    expect(
      (
        await page.request.post(
          `/painel/api/v1/pedidos/${order.id}/transicoes`,
          {
            headers: order.headers,
            data: { version: 3, status: "COMPLETED" },
          },
        )
      ).ok(),
    ).toBe(true);
    await button.click();
    await expect(client.locator(".badge")).toHaveText("Concluído");
    await expect(client.locator(".receipt-confirmation")).toContainText(
      "Pedido concluído",
    );
    await expect(button).toHaveCount(0);
  } finally {
    await context.close();
  }
});

for (const fulfillment of ["PICKUP", "FIXED"]) {
  test(`${fulfillment}: barra, confirmação manual e histórico recolhido sem recarregar`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    const order = await scenario(page, fulfillment);
    let audits = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/auditoria")) audits++;
    });
    await page.goto(order.path);
    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations++;
    });
    await expect(page.locator("#transaction-log")).not.toHaveAttribute("open");
    await page
      .getByRole("button", { name: "Aceitar pedido", exact: true })
      .click();
    await expect(page.locator("#order-status")).toHaveText("Pedido aceito");
    const action = page.getByRole("button", {
      name: "Pedido pronto",
      exact: true,
    });
    await expect(action).toHaveCSS("min-height", "60px");
    const width = (await action.boundingBox())!.width;
    expect(width).toBeGreaterThan(
      (await page.locator(".fulfillment-card").boundingBox())!.width * 0.7,
    );
    if (fulfillment === "FIXED") {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: "docs/evidencias/pedido-pronto-mobile.png",
        fullPage: true,
        animations: "disabled",
      });
    }
    await action.click();
    await expect(page.locator("#order-status")).toHaveText("Pedido pronto");
    await expect(
      page
        .locator(".action-notice")
        .filter({ hasText: "Pedido marcado como pronto" }),
    ).toBeVisible();
    const customer = await browser.newContext();
    const tracking = await customer.newPage();
    await tracking.goto(`/pedido/${order.token}`);
    await expect(tracking.locator("#tracking-state")).toContainText(
      "Pedido pronto",
    );
    if (fulfillment === "FIXED")
      await expect(
        tracking.locator("#tracking-instructions"),
      ).not.toContainText("vir buscar");
    await expect(tracking.locator("#tracking-history")).not.toHaveAttribute(
      "open",
    );
    await expect(page.locator("#fulfill-order")).toBeDisabled();
    await tracking
      .getByRole("link", { name: "Meus pedidos", exact: true })
      .first()
      .click();
    await tracking
      .getByRole("button", { name: "Confirmar recebimento", exact: true })
      .click();
    await expect(tracking.locator(".receipt-confirmation")).toContainText(
      "Recebimento confirmado",
    );
    await page.locator("#reload-detail").click();
    await expect(page.locator("#customer-receipt-state")).toContainText(
      "Recebimento confirmado pelo cliente",
    );
    await page
      .getByRole("button", { name: "Entregar pedido", exact: true })
      .click();
    await expect(page.locator("#delivery-confirmation")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Voltar", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#delivery-confirmation")).not.toBeVisible();
    expect(
      (await (await page.request.get(`/api/v1/pedidos/${order.token}`)).json())
        .status,
    ).toBe("READY");
    await page
      .getByRole("button", { name: "Entregar pedido", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar entrega", exact: true })
      .click();
    await expect(page.locator("#order-status")).toHaveText("Concluído");
    await expect(page.locator("#fulfillment-final")).toBeFocused();
    await expect(
      page
        .locator(".action-notice")
        .filter({ hasText: "Entrega confirmada com sucesso" }),
    ).toBeVisible();
    await page
      .locator(".action-notice")
      .filter({ hasText: "Entrega confirmada com sucesso" })
      .getByRole("button", { name: "Fechar aviso" })
      .click();
    await expect(page.locator("main h1")).toBeFocused();
    expect(audits).toBe(0);
    await page.locator("#transaction-log > summary").click();
    await expect(page.locator("#audit-list")).toContainText("Pedido pronto");
    await expect(page.locator("#audit-list")).toContainText("Concluído");
    await expect(page.locator("#audit-count")).toHaveText("5 evento(s)");
    expect(audits).toBe(1);
    expect(navigations).toBe(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    if (fulfillment === "FIXED") {
      await page.locator("#transaction-log > summary").click();
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: "docs/evidencias/pedido-concluido-mobile.png",
        fullPage: true,
        animations: "disabled",
      });
    }
    await customer.close();
  });
}

test("aviso de sucesso dura 20 segundos e pausa enquanto o lojista está lendo", async ({
  page,
}) => {
  await page.clock.install();
  const order = await scenario(page, "PICKUP", true);
  await page.goto(order.path);
  await page
    .getByRole("button", { name: "Pedido pronto", exact: true })
    .click();
  const notice = page.locator(".action-notice");
  await expect(notice).toBeVisible();
  await notice.hover();
  await page.clock.fastForward(25000);
  await expect(notice).toBeVisible();
  await page.locator("h1").hover();
  await page.clock.fastForward(19000);
  await expect(notice).toBeVisible();
  await page.clock.fastForward(1500);
  await expect(notice).toHaveCount(0);
  await expect(page.locator("#order-status")).toHaveText("Pedido pronto");
});

test("atualização por outro atendente e retorno da aba invalidam confirmação antiga", async ({
  page,
}) => {
  await page.clock.install();
  const order = await scenario(page, "FIXED", true);
  await page.goto(order.path);
  await page
    .getByRole("button", { name: "Pedido pronto", exact: true })
    .click();
  await expect(page.locator("#order-status")).toHaveText("Pedido pronto");
  await receive(page, order.token);
  await page
    .getByRole("button", { name: "Entregar pedido", exact: true })
    .click();
  expect(
    (
      await page.request.post(`/painel/api/v1/pedidos/${order.id}/transicoes`, {
        headers: order.headers,
        data: {
          version: 3,
          status: "CANCELLED",
          reason: "Cancelamento de teste por outro atendente",
        },
      })
    ).ok(),
  ).toBe(true);
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })),
  );
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  await expect(page.locator("#order-status")).toHaveText("Cancelado");
  await expect(page.locator("#delivery-confirmation")).not.toBeVisible();
  await expect(page.locator("#fulfill-order")).not.toBeVisible();
  const state = await (
    await page.request.get(`/api/v1/pedidos/${order.token}`)
  ).json();
  expect(state.status).toBe("CANCELLED");
  expect(
    state.events.some(
      (event: { status: string }) => event.status === "COMPLETED",
    ),
  ).toBe(false);
});

test("leitura atrasada e clique repetido não liberam ações antes de conferir a gravação", async ({
  page,
}) => {
  const order = await scenario(page, "PICKUP", true);
  let releaseOld!: () => void, releaseFresh!: () => void;
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  const freshGate = new Promise<void>((resolve) => {
    releaseFresh = resolve;
  });
  let reads = 0,
    writes = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/transicoes") && request.method() === "POST")
      writes++;
  });
  await page.route(`**/painel/api/v1/pedidos/${order.id}`, async (route) => {
    const response = await route.fetch();
    reads++;
    if (reads === 1) await oldGate;
    if (reads === 2) await freshGate;
    await route.fulfill({ response });
  });
  try {
    await page.goto(order.path);
    await expect.poll(() => reads).toBe(1);
    await page
      .getByRole("button", { name: "Pedido pronto", exact: true })
      .click();
    await expect(page.locator("#fulfill-order")).toBeDisabled();
    await page
      .locator("#fulfill-order")
      .evaluate((button: HTMLButtonElement) => button.click());
    expect(writes).toBe(1);
    releaseOld();
    await expect.poll(() => reads).toBe(2);
    await expect(page.locator("#fulfill-order")).toBeDisabled();
    releaseFresh();
    await expect(page.locator("#order-status")).toHaveText("Pedido pronto");
    await expect(
      page.getByRole("button", { name: "Entregar pedido", exact: true }),
    ).toBeDisabled();
    expect(writes).toBe(1);
  } finally {
    releaseOld();
    releaseFresh();
  }
});

test("resposta perdida após gravar é conferida sem repetir preparo ou entrega", async ({
  page,
}) => {
  await page.clock.install();
  const order = await scenario(page, "FIXED", true);
  let writes = 0;
  await page.route(
    `**/painel/api/v1/pedidos/${order.id}/transicoes`,
    async (route) => {
      writes++;
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.abort("failed");
    },
  );
  await page.goto(order.path);
  await page
    .getByRole("button", { name: "Pedido pronto", exact: true })
    .click();
  await expect(page.locator("#order-status")).toHaveText("Pedido pronto");
  await expect(
    page
      .locator(".action-notice")
      .filter({ hasText: "Estado conferido: Pedido pronto" }),
  ).toBeVisible();
  await expect(page.locator("#feedback")).toBeEmpty();
  await page.clock.fastForward(6500);
  expect(writes).toBe(1);
  await receive(page, order.token);
  await page
    .getByRole("button", { name: "Entregar pedido", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar entrega", exact: true })
    .click();
  await expect(page.locator("#order-status")).toHaveText("Concluído");
  await expect(
    page
      .locator(".action-notice")
      .filter({ hasText: "Estado conferido: Concluído" }),
  ).toBeVisible();
  await expect(page.locator("#feedback")).toBeEmpty();
  expect(writes).toBe(2);
  const state = await (
    await page.request.get(`/api/v1/pedidos/${order.token}`)
  ).json();
  expect(
    state.events.filter(
      (event: { status: string }) => event.status === "READY",
    ),
  ).toHaveLength(1);
  expect(
    state.events.filter(
      (event: { status: string }) => event.status === "COMPLETED",
    ),
  ).toHaveLength(1);
});
