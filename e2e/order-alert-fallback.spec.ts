import { expect, test } from "./fixtures";
import { pauseQueue } from "./ui-helpers";

test("som bloqueado pelo navegador mantém o atendimento disponível", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      value: class {
        constructor() {
          throw new Error("Áudio indisponível neste navegador");
        }
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/painel/entrar");
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(page).toHaveURL(/painel\/pedidos$/);
  await pauseQueue(page);
  await page.locator("#enable-order-alerts").click();
  await expect(page.locator("#alert-status")).toContainText(
    "Os avisos visuais continuam funcionando",
  );
  await expect(page.locator("#enable-order-alerts")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.locator("#open-order-queue")).toBeEnabled();
  await page.locator("#refresh-orders").click();
  await expect(page.locator("#feedback")).not.toHaveClass(/error/);
  expect(errors).toEqual([]);
});
