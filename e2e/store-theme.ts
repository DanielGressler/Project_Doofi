import { expect, type Page, type Browser } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const presets = [
  {
    layout: "showcase",
    font: "classic",
    palette: "plum",
    body: "Georgia",
    heading: "Georgia",
    hero: "rgb(239, 224, 236)",
    accent: "rgb(121, 69, 110)",
    radius: "3px",
  },
  {
    layout: "compact",
    font: "simple",
    palette: "ocean",
    body: "DM Sans Variable",
    heading: "DM Sans Variable",
    hero: "rgb(220, 236, 245)",
    accent: "rgb(35, 99, 138)",
    radius: "6px",
  },
  {
    layout: "cozy",
    font: "editorial",
    palette: "forest",
    body: "DM Sans Variable",
    heading: "Fraunces Variable",
    hero: "rgb(225, 235, 218)",
    accent: "rgb(64, 104, 57)",
    radius: "14px",
  },
];
async function family(page: Page, selector: string, expected: string) {
  const nodes = page.locator(selector);
  for (let i = 0; i < (await nodes.count()); i++)
    expect(
      await nodes.nth(i).evaluate((el) => getComputedStyle(el).fontFamily),
    ).toContain(expected);
}

export async function verifyGlobalTheme(page: Page, browser: Browser) {
  await page.goto("/painel/loja");
  const initial = await page
    .locator("#store-form")
    .evaluate((form) =>
      Object.fromEntries(
        ["palette", "font", "layout"].map((name) => [
          name,
          (form.querySelector(`[name="${name}"]`) as HTMLSelectElement).value,
        ]),
      ),
    );
  const shopper = await browser.newContext(),
    shop = await shopper.newPage();
  try {
    for (const preset of presets) {
      await page
        .getByLabel("Layout da página", { exact: true })
        .selectOption(preset.layout);
      await page
        .getByLabel("Paleta de cores", { exact: true })
        .selectOption(preset.palette);
      await page
        .getByLabel("Estilo das fontes", { exact: true })
        .selectOption(preset.font);
      await expect(page.locator("#appearance-preview")).toHaveAttribute(
        "data-layout",
        preset.layout,
      );
      await family(page, "#appearance-preview h3", preset.heading);
      await page.getByRole("button", { name: "Salvar configurações" }).click();
      await expect(page.locator("#feedback")).toContainText(
        "Configurações salvas",
      );
      for (const width of [1440, 320]) {
        await shop.setViewportSize({ width, height: 1000 });
        await shop.goto("/loja/casa-do-forno");
        await shop.evaluate(() => document.fonts.ready);
        await expect(shop.locator("html")).toHaveAttribute(
          "data-layout",
          preset.layout,
        );
        await family(
          shop,
          "body,.site-header .brand,.category-tab,.cart-footnote,.site-footer p",
          preset.body,
        );
        await family(
          shop,
          ".hero-copy h1,.store-identity h2,.product-content h3,.cart-title h2",
          preset.heading,
        );
        await expect(shop.locator(".store-hero")).toHaveCSS(
          "background-color",
          preset.hero,
        );
        await expect(shop.locator(".category-tab.active")).toHaveCSS(
          "background-color",
          preset.accent,
        );
        await expect(shop.locator(".product-card").first()).toHaveCSS(
          "border-radius",
          preset.radius,
        );
        if (preset.layout === "showcase")
          await shop.screenshot({
            path: `docs/evidencias/tema-vitrine-${width === 1440 ? "desktop" : "mobile"}.png`,
            fullPage: true,
          });
        expect(
          await shop.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const results = await new AxeBuilder({ page: shop })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(
          results.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          })),
        ).toEqual([]);
      }
      await shop
        .getByRole("button", {
          name: "Adicionar Pão de fermentação natural",
          exact: true,
        })
        .click();
      await shop.getByRole("link", { name: "Continuar pedido" }).click();
      await family(
        shop,
        'body,.field input[name="name"],.site-footer p',
        preset.body,
      );
      await family(shop, ".card h2,.page-heading h1", preset.heading);
      await expect(shop.locator("html")).toHaveAttribute(
        "data-layout",
        preset.layout,
      );
      expect(
        await shop.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (preset.layout === "showcase") {
        await shop.locator('input[name="consent"]').check();
        await shop
          .getByRole("button", { name: "Enviar pedido de teste" })
          .click();
        await expect(shop).toHaveURL(/pedido\/[a-f0-9]{64}$/);
        await expect(shop.locator("html")).toHaveAttribute(
          "data-layout",
          "showcase",
        );
        await family(
          shop,
          ".tracking-heading h1,.summary h2,.site-footer p",
          "Georgia",
        );
      }
    }
    await shop.goto("/loja/verde-mesa");
    await expect(shop.locator("html")).toHaveAttribute("data-layout", "cozy");
    await expect(shop.locator(".category-tab.active")).toHaveCSS(
      "background-color",
      "rgb(64, 104, 57)",
    );
    await expect(page.locator("html")).not.toHaveClass(/store-theme/);
  } finally {
    for (const name of ["palette", "font", "layout"])
      await page.locator(`[name="${name}"]`).selectOption(initial[name]);
    await page.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(page.locator("#feedback")).toContainText(
      "Configurações salvas",
    );
    await shopper.close();
  }
}
