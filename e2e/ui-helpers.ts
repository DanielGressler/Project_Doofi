import { expect, type Page } from "@playwright/test";
export async function pauseQueue(page: Page) {
  await expect(page.locator("#open-order-queue")).toHaveText(
    /Atender fila \(\d/,
  );
  if (await page.locator("#order-queue").isVisible())
    await page.locator("#pause-order-queue").click();
}
export async function openEditor(page: Page, title: string) {
  const card = page
    .locator(".catalog-card")
    .filter({ has: page.locator("h3", { hasText: title }) });
  await expect(card).toBeVisible();
  const toggle = card.locator("[data-product-toggle]");
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  return card.locator(".product-form");
}
