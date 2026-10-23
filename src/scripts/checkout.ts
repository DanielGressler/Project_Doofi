import { $, api, ApiError, el, feedback, readCart } from "./browser";
import { money } from "../lib/types";
import type { PublicProduct } from "../lib/public-data";
const root = $("#checkout-app");
const slug = root.dataset.slug!;
const products = JSON.parse(root.dataset.products!) as PublicProduct[];
const store = JSON.parse(root.dataset.store!) as {
  delivery_fee: number;
  is_open: number;
};
const cart = readCart(slug);
const items = Object.entries(cart).map(([id, quantity]) => ({
  productId: id,
  quantity,
}));
document
  .querySelectorAll("[data-cart-count]")
  .forEach(
    (node) =>
      (node.textContent = String(
        Object.values(cart).reduce((sum, quantity) => sum + quantity, 0),
      )),
  );
const form = $<HTMLFormElement>("#checkout-form");
let intent: string | null = null;
let pending: Record<string, unknown> | null = null;
const intentKey = `doofi.intent.${slug}`;
try {
  localStorage.removeItem(`doofi.lastOrder.${slug}`);
} catch {}
try {
  intent = sessionStorage.getItem(intentKey);
} catch {
  /* In-memory retry remains available. */
}
const subtotal = items.reduce(
  (sum, i) =>
    sum + (products.find((p) => p.id === i.productId)?.price ?? 0) * i.quantity,
  0,
);
for (const i of items) {
  const p = products.find((p) => p.id === i.productId);
  const row = el("li");
  row.append(
    el("span", `${i.quantity} × ${p?.title ?? "Produto indisponível"}`),
    el("span", money((p?.price ?? 0) * i.quantity)),
  );
  $("#checkout-items").append(row);
}
$("#checkout-empty").hidden = items.length > 0;
form.hidden = items.length === 0;
function refresh() {
  const mode = (new FormData(form).get("fulfillment") ?? "PICKUP") as string;
  const quote = mode === "QUOTE";
  const fee = quote ? null : mode === "PICKUP" ? 0 : store.delivery_fee;
  $("#checkout-subtotal").textContent = money(subtotal);
  $("#checkout-fee").textContent = fee === 0 ? "Grátis" : money(fee);
  $("#checkout-total").textContent = money(
    fee === null ? null : subtotal + fee,
  );
  $("#quote-notice").hidden = !quote;
  $("#address-fields").hidden = mode === "PICKUP";
  $<HTMLInputElement>('[name="address"]').required = mode !== "PICKUP";
  $<HTMLInputElement>('[name="postalCode"]').required = mode !== "PICKUP";
}
form.addEventListener("change", refresh);
refresh();
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $<HTMLButtonElement>("#submit-order");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  feedback("Enviando pedido...");
  try {
    if (!pending) {
      if (!intent) {
        intent = (await api<{ intent: string }>(`lojas/${slug}/intent`, {}))
          .intent;
        try {
          sessionStorage.setItem(intentKey, intent);
        } catch {}
      }
      const fields = new FormData(form);
      pending = {
        intent,
        items,
        ...Object.fromEntries(fields),
        consent: fields.get("consent") === "on",
        syntheticData: true,
      };
      try {
        sessionStorage.setItem(`${intentKey}.payload`, JSON.stringify(pending));
      } catch {}
    }
    const result = await api<{ token: string; protocol: string }>(
      `lojas/${slug}/pedidos`,
      pending,
    );
    // Keep the submitted cart and intent until a later visit starts another order.
    // If navigation fails, repeating this submission safely returns the same order.
    try {
      sessionStorage.setItem(
        `doofi.lastOrder.${slug}`,
        JSON.stringify({ token: result.token, protocol: result.protocol }),
      );
      sessionStorage.setItem(`${intentKey}.completed`, "true");
    } catch {}
    location.assign(`/pedido/${result.token}`);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      ![409, 429].includes(error.status)
    ) {
      pending = null;
      try {
        sessionStorage.removeItem(`${intentKey}.payload`);
      } catch {}
      if (error.code === "INTENT_EXPIRED") {
        intent = null;
        try {
          sessionStorage.removeItem(intentKey);
        } catch {}
      }
    }
    feedback(
      error instanceof Error
        ? error.message
        : "Falha no envio. Tente novamente; o mesmo envio não duplica o pedido.",
      true,
    );
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
});
// Retain the exact intent across reloads after an uncertain network response.
try {
  if (sessionStorage.getItem(`${intentKey}.completed`) === "true") {
    sessionStorage.removeItem(intentKey);
    sessionStorage.removeItem(`${intentKey}.payload`);
    sessionStorage.removeItem(`${intentKey}.completed`);
    intent = null;
  } else {
    const saved = sessionStorage.getItem(`${intentKey}.payload`);
    if (saved) {
      pending = JSON.parse(saved);
      for (const [name, value] of Object.entries(pending!)) {
        const field = form.elements.namedItem(name);
        if (
          field instanceof HTMLInputElement &&
          field.type !== "radio" &&
          field.type !== "checkbox"
        )
          field.value = String(value);
        if (
          field instanceof HTMLTextAreaElement ||
          field instanceof HTMLSelectElement
        )
          field.value = String(value);
        if (field instanceof RadioNodeList) field.value = String(value);
      }
      refresh();
      feedback(
        "Há um envio anterior em aberto. Ao enviar novamente, recuperaremos o mesmo pedido com os dados originais.",
      );
    }
  }
} catch {
  pending = null;
}
