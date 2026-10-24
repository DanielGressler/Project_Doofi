import { $, api, ApiError, el, feedback } from "./browser";
import {
  readCustomerOrders,
  forgetCustomerOrder,
} from "../lib/customer-orders";
import { money, statusLabels } from "../lib/types";
import type { PublicOrder } from "../lib/public-order";
import { renderReceipt } from "./customer-receipt";
import { createPoller } from "./poller";

const root = $("#customer-orders-app");
if (root) {
  const list = $("#customer-orders-list");
  let writes = 0;
  type Card = {
    token: string;
    node: HTMLElement;
    order?: PublicOrder;
    pending: boolean;
  };
  const cards: Card[] = [];
  function render(card: Card, fresh: PublicOrder) {
    if (card.order && fresh.version < card.order.version) return;
    card.order = fresh;
    const details = card.node.querySelector<HTMLElement>(
      ".customer-order-details",
    )!;
    details.replaceChildren();
    const title = el("h2", fresh.store.title);
    const badge = el("span", statusLabels[fresh.status], "badge");
    badge.dataset.status = fresh.status;
    details.append(
      title,
      el("p", `Pedido ${fresh.protocol}`, "small muted"),
      badge,
    );
    const items = el("ul", "", "summary-list");
    for (const item of fresh.items)
      items.append(el("li", `${item.quantity} × ${item.title}`));
    details.append(items, el("p", `Total: ${money(fresh.total)}`));
    renderReceipt(
      card.node.querySelector<HTMLElement>(".receipt-confirmation")!,
      fresh,
      card.token,
      (updated) => render(card, updated),
      (value) => {
        card.pending = value;
        writes += value ? 1 : -1;
      },
    );
  }
  try {
    for (const { token } of readCustomerOrders(sessionStorage)) {
      const node = el("article", "", "card customer-order-card");
      node.append(
        el("div", "Consultando pedido…", "customer-order-details"),
        el("div", "", "receipt-confirmation"),
      );
      const link = el("a", "Acompanhar pedido", "inline-link");
      link.href = `/pedido/${token}`;
      const error = el("p", "", "feedback error customer-order-error");
      error.setAttribute("role", "alert");
      node.append(link, error);
      cards.push({ token, node, pending: false });
      list.append(node);
    }
  } catch {
    feedback(
      "O navegador bloqueou a lista desta aba. Use seu link de acompanhamento.",
      true,
    );
  }
  $("#customer-orders-empty").hidden = cards.length > 0;
  async function load() {
    if (writes) return;
    // At most two public reads at once; no endpoint lists customer or merchant identities.
    const remaining = [...cards];
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        for (let card = remaining.shift(); card; card = remaining.shift()) {
          if (writes) return;
          const error = card.node.querySelector<HTMLElement>(
            ".customer-order-error",
          )!;
          try {
            const fresh = await api<PublicOrder>(`pedidos/${card.token}`);
            if (!card.pending) render(card, fresh);
            error.textContent = "";
          } catch (failure) {
            if (failure instanceof ApiError && failure.status === 404) {
              try {
                forgetCustomerOrder(sessionStorage, card.token);
              } catch {
                /* No additional persistence needed. */
              }
              card.node
                .querySelector(".receipt-confirmation")!
                .replaceChildren();
              card.node.querySelector(".customer-order-details")!.textContent =
                "Pedido indisponível ou link expirado.";
              cards.splice(cards.indexOf(card), 1);
            } else error.textContent = (failure as Error).message;
          }
        }
      }),
    );
  }
  const poller = createPoller(load, {
    enabled: () =>
      !writes && !document.hidden && !root.contains(document.activeElement),
    onError: (error) => feedback((error as Error).message, true),
  });
  $("#refresh-customer-orders").onclick = () => {
    if (!writes) void poller.refresh(true);
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !writes) void poller.refresh();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && !writes) void poller.refresh(true);
  });
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) poller.stop();
  });
  void poller.refresh();
}
