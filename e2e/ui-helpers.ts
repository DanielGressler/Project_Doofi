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
    .filter({ has: page.locator("summary strong", { hasText: title }) });
  await expect(card).toBeVisible();
  if (!(await card.getAttribute("open"))) {
    // Boolean attributes have an empty value when present.
    if (!(await card.evaluate((node) => (node as HTMLDetailsElement).open)))
      await card.locator("summary").click();
  }
  return card.locator(".product-form");
}
