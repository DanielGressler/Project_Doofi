import { $, api, el, feedback } from "./browser";
import { money, statusLabels, formatDate, type Order } from "../lib/types";
import type { OrderSummary } from "../lib/dashboard";
import { createPoller } from "./poller";
import { createOrderQueue, type QueueEntry } from "./order-queue";
import { createOrderAlerts } from "./order-alerts";
type Row = Pick<
  Order,
  | "id"
  | "protocol"
  | "status"
  | "total"
  | "fulfillment"
  | "customer_name"
  | "created_at"
>;
let rows: Row[] = [];
let requestedRefresh = false;
function render() {
  const root = $("#order-list");
  root.replaceChildren();
  const filter = $<HTMLSelectElement>("#status-filter").value;
  const selected = rows.filter(
    (o) =>
      filter === "all" ||
      (filter === "pending" &&
        [
          "PENDING",
          "QUOTE_PENDING",
          "QUOTE_PROPOSED",
          "QUOTE_ACCEPTED",
        ].includes(o.status)) ||
      (filter === "active" &&
        ["ACCEPTED", "PREPARING", "READY", "OUT_FOR_DELIVERY"].includes(
          o.status,
        )) ||
      (filter === "completed" && o.status === "COMPLETED") ||
      (filter === "cancelled" && ["REJECTED", "CANCELLED"].includes(o.status)),
  );
  if (!selected.length) {
    const empty = el("div", "", "empty-state");
    empty.append(
      el("h2", "O balcão está tranquilo."),
      el(
        "p",
        "Nenhum pedido neste filtro. Abra a loja e envie um pedido de teste.",
      ),
    );
    root.append(empty);
  }
  for (const o of selected) {
    const link = el("a", "", "order-row");
    link.href = `/painel/pedidos/${o.id}`;
    const info = el("div");
    info.append(
      el("strong", o.protocol),
      el(
        "small",
        `${o.customer_name} · ${formatDate(o.created_at)} · ${o.fulfillment === "PICKUP" ? "Retirada" : "Entrega da loja"}`,
      ),
    );
    const badge = el("span", statusLabels[o.status], "badge");
    badge.dataset.status = o.status;
    link.append(info, badge, el("strong", money(o.total)), el("span", "→"));
    root.append(link);
  }
}
async function load() {
  const explicit = requestedRefresh;
  requestedRefresh = false;
  const { orders, summary, queue } = await api<{
    orders: Row[];
    summary: OrderSummary;
    queue: QueueEntry[];
  }>("painel/visao-geral");
  if (!automaticUpdates && !explicit) return;
  rows = orders;
  $("#stat-total").textContent = String(summary.total_orders);
  $("#stat-pending").textContent = String(summary.pending);
  $("#stat-completed").textContent = String(summary.completed);
  $("#stat-average").textContent =
    summary.average_order === null ? "—" : money(summary.average_order);
  $("#extra-stats").textContent =
    `Recusados ou cancelados: ${summary.cancelled} · Mais pedido: ${summary.topItem ? summary.topItem.title + " (" + summary.topItem.units + " unidades)" : "sem dados"}`;
  render();
  orderAlerts.update(queue);
  orderQueue.update(queue);
  feedback("");
}
let automaticUpdates = true;
const canRefresh = () =>
  automaticUpdates &&
  !document.hidden &&
  !$("#order-list").contains(document.activeElement);
const poller = createPoller(load, {
  enabled: canRefresh,
  onError: (error) => feedback((error as Error).message, true),
});
const refresh = () => {
  requestedRefresh = true;
  return poller.refresh(true);
};
const orderQueue = createOrderQueue(refresh);
const orderAlerts = createOrderAlerts();
$("#refresh-orders").onclick = () => void refresh();
$("#pause-order-updates").onclick = (event) => {
  automaticUpdates = !automaticUpdates;
  const button = event.currentTarget as HTMLButtonElement;
  button.setAttribute("aria-pressed", String(!automaticUpdates));
  button.textContent = automaticUpdates
    ? "Pausar atualização automática"
    : "Retomar atualização automática";
  if (automaticUpdates) void refresh();
  else
    feedback(
      "Atualização automática pausada. Use Atualizar para consultar sem reativá-la.",
    );
};
$("#status-filter").onchange = render;
void refresh();
document.addEventListener("visibilitychange", () => {
  if (canRefresh()) void poller.refresh();
});
