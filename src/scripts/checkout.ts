import { $, api, ApiError, el, feedback, readCart } from "./browser";
import { rememberCustomerOrder } from "../lib/customer-orders";
import { money } from "../lib/types";
import type { PublicProduct } from "../lib/public-data";
import {
  clearDraft,
  clearReceipt,
  draftKey,
  draftLifetime,
  readDraft,
  readReceipt,
  writeDraft,
  type CheckoutDraft,
  type CheckoutPayload,
  type TabStorage,
} from "./checkout-state";
const root = $("#checkout-app"),
  slug = root.dataset.slug!;
const products = JSON.parse(root.dataset.products!) as PublicProduct[];
const store = JSON.parse(root.dataset.store!) as {
  delivery_fee: number;
  is_open: number;
};
const form = $<HTMLFormElement>("#checkout-form");
let storage: TabStorage | null = null;
try {
  storage = sessionStorage;
  localStorage.removeItem(`doofi.lastOrder.${slug}`);
} catch {
  /* In-memory retry is still available. */
}
let draft: CheckoutDraft | null = null;
let receipt: ReturnType<typeof readReceipt> = null;
let discarded = false;
try {
  if (storage) {
    receipt = readReceipt(storage, slug);
    const raw = storage.getItem(`${draftKey(slug)}.payload`);
    if (receipt) clearDraft(storage, slug);
    else {
      draft = readDraft(storage, slug);
      discarded = !!raw && !draft;
    }
  }
} catch {
  /* A blocked tab store never changes server authorization. */
}
let pending: CheckoutPayload | null = draft?.payload ?? null;
let completed = !!receipt;
let submitting = false;
const cart = readCart(slug);
const lines =
  draft?.lines ??
  Object.entries(cart).map(([productId, quantity]) => {
    const product = products.find((p) => p.id === productId);
    return {
      productId,
      quantity,
      title: product?.title ?? "Produto indisponível",
      price: product?.price ?? 0,
    };
  });
const items = lines.map(({ productId, quantity }) => ({ productId, quantity }));
const subtotal = lines.reduce(
  (sum, line) => sum + line.price * line.quantity,
  0,
);
for (const line of lines) {
  const row = el("li");
  row.append(
    el("span", `${line.quantity} × ${line.title}`),
    el("span", money(line.price * line.quantity)),
  );
  $("#checkout-items").append(row);
}
document
  .querySelectorAll("[data-cart-count]")
  .forEach(
    (node) =>
      (node.textContent = String(
        lines.reduce((sum, line) => sum + line.quantity, 0),
      )),
  );
$("#checkout-empty").hidden = items.length > 0 || completed;
form.hidden = items.length === 0 || completed;
function lock() {
  form
    .querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea")
    .forEach((field) => {
      if (field.name !== "consent")
        field.disabled = !!pending || completed || submitting;
    });
  $("#checkout-recovery").hidden = !pending && !completed;
  $<HTMLButtonElement>("#submit-order").disabled = completed;
  if (completed && receipt) {
    $("#recovery-message").textContent =
      `O pedido ${receipt.protocol} já foi enviado. Seus dados de envio foram removidos do armazenamento do navegador.`;
    const link = $<HTMLAnchorElement>("#recovery-link");
    link.href = `/pedido/${receipt.token}`;
    link.hidden = false;
  } else if (pending) {
    $("#recovery-message").textContent =
      "Há um envio anterior em aberto. Os dados e itens originais estão bloqueados para recuperar o mesmo pedido sem misturar compradores ou duplicar o envio.";
  }
}
function refresh() {
  const mode =
    pending?.fulfillment ?? new FormData(form).get("fulfillment") ?? "PICKUP";
  const fee =
    mode === "QUOTE"
      ? null
      : mode === "PICKUP"
        ? 0
        : (draft?.deliveryFee ?? store.delivery_fee);
  $("#checkout-subtotal").textContent = money(subtotal);
  $("#checkout-fee").textContent = fee === 0 ? "Grátis" : money(fee);
  $("#checkout-total").textContent = money(
    fee === null ? null : subtotal + fee,
  );
  $("#quote-notice").hidden = mode !== "QUOTE";
  $("#address-fields").hidden = mode === "PICKUP";
  $<HTMLInputElement>('[name="address"]').required = mode !== "PICKUP";
  $<HTMLInputElement>('[name="postalCode"]').required = mode !== "PICKUP";
}
if (pending) {
  for (const [name, value] of Object.entries(pending)) {
    if (typeof value !== "string") continue;
    const field = form.elements.namedItem(name);
    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLSelectElement ||
      field instanceof HTMLTextAreaElement ||
      field instanceof RadioNodeList
    )
      field.value = value;
  }
  feedback(
    "Há um envio anterior em aberto. Ao enviar novamente, recuperaremos o mesmo pedido com os dados originais.",
  );
}
if (discarded)
  feedback(
    "Um rascunho antigo, expirado ou inválido foi descartado deste navegador. Os dados anteriores não serão reutilizados.",
  );
lock();
refresh();
form.addEventListener("change", refresh);
let expiry: ReturnType<typeof setTimeout> | undefined;
function scheduleExpiry() {
  clearTimeout(expiry);
  if (!draft) return;
  expiry = setTimeout(
    () => {
      try {
        if (storage) clearDraft(storage, slug);
      } catch {
        /* Storage may have been disabled. */
      }
      // Remove personal fields from both storage and the visible form, without sending a request.
      pending = null;
      draft = null;
      form.reset();
      lock();
      refresh();
      feedback(
        "O prazo deste rascunho terminou. Os dados de envio foram descartados. Um envio anterior pode já ter criado um pedido; confira seu link de acompanhamento.",
        true,
      );
    },
    Math.max(0, draft.savedAt + draftLifetime - Date.now()),
  );
}
scheduleExpiry();
$("#reset-checkout").onclick = () => {
  try {
    if (storage) {
      clearDraft(storage, slug);
      clearReceipt(storage, slug);
    }
  } catch {
    /* Clear the in-memory form as well. */
  }
  pending = null;
  draft = null;
  receipt = null;
  form.reset();
  clearTimeout(expiry);
  location.reload();
};
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $<HTMLButtonElement>("#submit-order"),
    reset = $<HTMLButtonElement>("#reset-checkout");
  if (button.disabled || completed) return;
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const fields = new FormData(form);
  submitting = true;
  lock();
  button.disabled = true;
  reset.disabled = true;
  button.setAttribute("aria-busy", "true");
  feedback("Enviando pedido...");
  try {
    if (!pending) {
      const { intent } = await api<{ intent: string }>(
        `lojas/${slug}/intent`,
        {},
      );
      const fulfillment = fields.get(
        "fulfillment",
      ) as CheckoutPayload["fulfillment"];
      pending = {
        intent,
        items,
        fulfillment,
        payment: fields.get("payment") as CheckoutPayload["payment"],
        name: String(fields.get("name")),
        phone: String(fields.get("phone")),
        email: String(fields.get("email")),
        note: String(fields.get("note") ?? ""),
        consent: true,
        syntheticData: true,
        ...(fulfillment !== "PICKUP"
          ? {
              address: String(fields.get("address")),
              neighborhood: String(fields.get("neighborhood")),
              postalCode: String(fields.get("postalCode")),
            }
          : {}),
      };
      draft = {
        slug,
        savedAt: Date.now(),
        payload: pending,
        lines,
        deliveryFee: store.delivery_fee,
      };
      try {
        if (storage) writeDraft(storage, draft);
      } catch {
        /* Preserve exact payload in memory. */
      }
      scheduleExpiry();
      lock();
      button.disabled = true;
    }
    const result = await api<{ token: string; protocol: string }>(
      `lojas/${slug}/pedidos`,
      pending,
    );
    completed = true;
    receipt = result;
    try {
      rememberCustomerOrder(sessionStorage, result.token);
    } catch {
      /* The tracking link remains visible. */
    }
    clearTimeout(expiry);
    // A confirmed response needs only the tracking link, never retained delivery fields.
    try {
      if (storage) {
        storage.setItem(
          `doofi.lastOrder.${slug}`,
          JSON.stringify({
            slug,
            token: result.token,
            protocol: result.protocol,
            savedAt: Date.now(),
          }),
        );
        storage.setItem(`${draftKey(slug)}.completed`, "true");
        clearDraft(storage, slug);
      }
    } catch {
      /* The visible tracking link is still available if navigation fails. */
    }
    form.hidden = true;
    lock();
    location.assign(`/pedido/${result.token}`);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      ![409, 429].includes(error.status)
    ) {
      pending = null;
      draft = null;
      clearTimeout(expiry);
      try {
        if (storage) clearDraft(storage, slug);
      } catch {
        /* Do not keep a rejected payload in memory. */
      }
    }
    lock();
    refresh();
    feedback((error as Error).message, true);
  } finally {
    submitting = false;
    lock();
    refresh();
    button.disabled = completed;
    reset.disabled = false;
    button.removeAttribute("aria-busy");
  }
});
