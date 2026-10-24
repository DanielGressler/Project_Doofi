import { $, api, el, feedback } from "./browser";
import { money, type Order, type OrderItem } from "../lib/types";

export type QueueEntry = Pick<
  Order,
  "id" | "protocol" | "status" | "version" | "created_at"
>;
type Detail = Order & { items: OrderItem[] };
const eligible = (status: string) =>
  ["PENDING", "QUOTE_PENDING", "QUOTE_ACCEPTED"].includes(status);

export function createOrderQueue(refresh: () => Promise<void>) {
  const dialog = $<HTMLDialogElement>("#order-queue");
  let entries: QueueEntry[] = [];
  let current: Detail | null = null;
  let loadingId: string | null = null;
  let sequence = 0;
  let paused = false;
  let writing = false;
  function lock(disabled: boolean) {
    dialog
      .querySelectorAll<HTMLButtonElement>(
        "#queue-accept, #queue-reject, #queue-propose, #queue-reload",
      )
      .forEach((button) => (button.disabled = disabled));
  }
  function count() {
    $("#open-order-queue").textContent =
      `Atender fila (${entries.length}${entries.length === 50 ? "+" : ""})`;
    $("#queue-count").textContent =
      entries.length > 1
        ? `${entries.length - 1} pedido(s) atrás deste. Novas chegadas aguardam sua decisão.`
        : "Este é o primeiro pedido. Aceite, recuse ou pause para atender depois.";
    $("#queue-stack").classList.toggle("has-next", entries.length > 1);
  }
  async function focusNext(force = false) {
    if (paused || writing || document.hidden) return;
    const first = entries[0];
    if (!first) {
      current = null;
      loadingId = null;
      sequence++;
      if (dialog.open) dialog.close("empty");
      return;
    }
    if (
      !force &&
      (loadingId === first.id ||
        (current?.id === first.id && current.version === first.version))
    )
      return;
    const serial = ++sequence;
    current = null;
    loadingId = first.id;
    lock(true);
    $("#queue-title").textContent = `Pedido ${first.protocol}`;
    $("#queue-customer").textContent = "Carregando informações…";
    $("#queue-location").textContent = "";
    $("#queue-items").replaceChildren();
    for (const id of ["subtotal", "fee", "total"])
      $(`#queue-${id}`).textContent = "—";
    $("#queue-note").textContent = "";
    $("#queue-detail").removeAttribute("href");
    $("#queue-quote").hidden = true;
    $("#queue-propose").hidden = true;
    $("#queue-accept").hidden = true;
    $<HTMLInputElement>("#queue-reason").value = "";
    feedback("", false, "#queue-feedback");
    if (!dialog.open) dialog.showModal();
    try {
      const order = await api<Detail>(`painel/pedidos/${first.id}`);
      if (serial !== sequence || paused) return;
      if (!eligible(order.status)) {
        entries = entries.filter((entry) => entry.id !== order.id);
        loadingId = null;
        count();
        await focusNext();
        return;
      }
      current = order;
      $("#queue-customer").textContent = order.customer_name;
      $("#queue-location").textContent =
        order.fulfillment === "PICKUP"
          ? "Retirada na loja"
          : `Entrega: ${order.address ?? ""} · ${order.neighborhood ?? ""} · CEP ${order.postal_code ?? ""}`;
      for (const item of order.items) {
        const row = el("li");
        row.append(
          el("strong", `${item.quantity} × ${item.title}`),
          el("span", money(item.price * item.quantity)),
        );
        $("#queue-items").append(row);
      }
      $("#queue-subtotal").textContent = money(order.subtotal);
      $("#queue-fee").textContent = money(order.delivery_fee);
      $("#queue-total").textContent = money(order.total);
      $("#queue-note").textContent = order.note
        ? `Observação: ${order.note}`
        : "";
      $("#queue-accept").hidden = order.status === "QUOTE_PENDING";
      $("#queue-quote").hidden = order.status !== "QUOTE_PENDING";
      $("#queue-propose").hidden = order.status !== "QUOTE_PENDING";
      $<HTMLAnchorElement>("#queue-detail").href =
        `/painel/pedidos/${order.id}`;
      $("#queue-title").focus();
    } catch (error) {
      if (serial === sequence)
        feedback((error as Error).message, true, "#queue-feedback");
    } finally {
      if (serial === sequence) {
        loadingId = null;
        lock(false);
        $<HTMLButtonElement>("#queue-accept").disabled = !current;
        $<HTMLButtonElement>("#queue-reject").disabled = !current;
        $<HTMLButtonElement>("#queue-propose").disabled = !current;
      }
    }
  }
  async function decide(action: "ACCEPTED" | "REJECTED" | "QUOTE") {
    if (!current || writing) return;
    const order = current;
    const reason = $<HTMLInputElement>("#queue-reason");
    if (action === "REJECTED") {
      reason.required = true;
      const valid = reason.reportValidity();
      reason.required = false;
      if (!valid) return;
    }
    writing = true;
    lock(true);
    try {
      const quote = new FormData($<HTMLFormElement>("#queue-quote"));
      await api(
        `painel/pedidos/${order.id}/${action === "QUOTE" ? "cotacao" : "transicoes"}`,
        action === "QUOTE"
          ? {
              version: order.version,
              fee: Math.round(Number(quote.get("fee")) * 100),
              estimate: quote.get("estimate"),
              validMinutes: 30,
            }
          : { version: order.version, status: action, reason: reason.value },
        "POST",
        $("#panel-app").dataset.csrf,
      );
      entries = entries.filter((entry) => entry.id !== order.id);
      current = null;
      $<HTMLFormElement>("#queue-quote").reset();
      feedback("", false, "#queue-feedback");
      // Refresh server state before enabling the next decision; never retry a write automatically.
      await refresh();
    } catch (error) {
      feedback(
        `${(error as Error).message} Atualize o pedido em foco antes de tentar novamente.`,
        true,
        "#queue-feedback",
      );
    } finally {
      writing = false;
      lock(false);
      count();
      if (!current) void focusNext();
    }
  }
  $("#queue-accept").onclick = () => void decide("ACCEPTED");
  $("#queue-reject").onclick = () => void decide("REJECTED");
  $<HTMLFormElement>("#queue-quote").onsubmit = (event) => {
    event.preventDefault();
    void decide("QUOTE");
  };
  $("#queue-reload").onclick = () => void focusNext(true);
  function pause() {
    if (writing) return;
    paused = true;
    sequence++;
    loadingId = null;
    dialog.close("paused");
  }
  $("#pause-order-queue").onclick = pause;
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    pause();
  });
  $("#open-order-queue").onclick = () => {
    paused = false;
    if (!entries.length)
      feedback("Nenhum pedido aguardando decisão neste momento.");
    else {
      current = null;
      void focusNext();
    }
  };
  return {
    update(queue: QueueEntry[]) {
      // A previously quoted order may return with an older creation date.
      // Keep the active decision in front even when the server's oldest entry changes.
      const activeId = current?.id ?? loadingId;
      const active = queue.find((entry) => entry.id === activeId);
      entries = active
        ? [active, ...queue.filter((entry) => entry.id !== activeId)]
        : queue;
      count();
      void focusNext();
    },
  };
}
