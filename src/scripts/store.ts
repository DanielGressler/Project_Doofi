import { $, el, readCart, saveCart } from "./browser";
import { money } from "../lib/types";
import type { PublicProduct } from "../lib/public-data";
const root = $("#store-app");
const slug = root.dataset.slug!;
const products = JSON.parse(root.dataset.products!) as PublicProduct[];
let cart = readCart(slug);
function render() {
  const rows = $("#cart-items");
  rows?.replaceChildren();
  let count = 0;
  let subtotal = 0;
  for (const [id, quantity] of Object.entries(cart)) {
    const product = products.find((p) => p.id === id);
    if (!product) {
      delete cart[id];
      continue;
    }
    count += quantity;
    subtotal += quantity * product.price;
    if (!rows) continue;
    const row = el("div", "", "cart-item");
    const line = el("div", "", "cart-item-top");
    line.append(
      el("strong", product.title),
      el("span", money(product.price * quantity)),
    );
    if (!product.orderable)
      row.append(
        el(
          "p",
          "Indisponível. Remova este item para continuar.",
          "error small",
        ),
      );
    if (product.is_combo)
      row.append(
        el("small", product.components.map((c) => c.title).join(" + ")),
      );
    const control = el("div", "", "quantity-control");
    const minus = el("button", "−");
    minus.type = "button";
    minus.setAttribute("aria-label", `Remover uma unidade de ${product.title}`);
    minus.onclick = () => change(id, -1);
    const plus = el("button", "+");
    plus.type = "button";
    plus.setAttribute(
      "aria-label",
      `Adicionar uma unidade de ${product.title}`,
    );
    plus.disabled = quantity >= 10 || !product.orderable;
    plus.onclick = () => change(id, 1);
    control.append(minus, el("span", String(quantity)), plus);
    row.append(line, control);
    rows?.append(row);
  }
  document
    .querySelectorAll("[data-cart-count]")
    .forEach((n) => (n.textContent = String(count)));
  if ($("#cart-empty")) $("#cart-empty").hidden = count > 0;
  if ($("#cart-totals")) $("#cart-totals").hidden = count === 0;
  $("#cart-subtotal").textContent = money(subtotal);
  const next = $<HTMLAnchorElement>("#cart-next");
  if (next) {
    const blocked =
      Object.keys(cart).some(
        (id) => !products.find((p) => p.id === id)?.orderable,
      ) || root.dataset.open === "false";
    next.setAttribute("aria-disabled", String(blocked));
    if (blocked) next.removeAttribute("href");
    else next.href = `/loja/${slug}/checkout`;
  }
}
function change(id: string, delta: number) {
  if (delta > 0 && !products.find((p) => p.id === id)?.orderable) {
    $("#cart-feedback").textContent =
      "Este produto ou um item do combo está indisponível.";
    return;
  }
  const updated = { ...cart };
  const quantity = (updated[id] ?? 0) + delta;
  if (quantity > 10) {
    $("#cart-feedback").textContent =
      "Limite de 10 unidades por produto nesta demonstração.";
    return;
  }
  if (quantity <= 0) delete updated[id];
  else updated[id] = quantity;
  try {
    saveCart(slug, updated);
    cart = updated;
    render();
    const p = products.find((p) => p.id === id);
    $("#cart-feedback").textContent =
      delta > 0
        ? `${p?.title} adicionado ao pedido.`
        : "Quantidade atualizada.";
  } catch (e) {
    $("#cart-feedback").textContent = (e as Error).message;
  }
}
document
  .querySelectorAll<HTMLButtonElement>("[data-add]")
  .forEach((b) => b.addEventListener("click", () => change(b.dataset.add!, 1)));
document.querySelectorAll<HTMLButtonElement>("[data-category]").forEach(
  (button) =>
    (button.onclick = () => {
      document
        .querySelectorAll<HTMLButtonElement>("[data-category]")
        .forEach((b) => {
          const active = b === button;
          b.classList.toggle("active", active);
          b.setAttribute("aria-pressed", String(active));
        });
      document
        .querySelectorAll<HTMLElement>("[data-product-category]")
        .forEach(
          (card) =>
            (card.hidden =
              button.dataset.category !== "all" &&
              card.dataset.productCategory !== button.dataset.category),
        );
      document
        .querySelectorAll<HTMLElement>("[data-menu-section]")
        .forEach((section) => {
          section.hidden = !section.querySelector(
            "[data-product-category]:not([hidden])",
          );
        });
      $("#filter-empty").hidden = !!document.querySelector(
        "[data-product-category]:not([hidden])",
      );
    }),
);
window.addEventListener("storage", (event) => {
  if (event.key === `doofi.cart.${slug}`) {
    cart = readCart(slug);
    render();
  }
});
render();
