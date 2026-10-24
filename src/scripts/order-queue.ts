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
  let priority: QueueEntry | null = null;
  let loadingId: string | null = null;
  let sequence = 0;
  let paused = false;
  let writing = false;
  function lock(disabled: boolean) {
    dialog
      .querySelectorAll<HTMLButtonElement>(
        "#queue-accept, #queue-reject, #queue-propose",
      )
      .forEach((button) => (button.disabled = disabled));
  }
  function count() {
    $("#open-order-queue").textContent =
      `Atender fila (${entries.length}${entries.length >= 50 ? "+" : ""})`;
    $("#queue-count").textContent =
      entries.length > 1
        ? `${entries.length - 1} pedido(s) atrás deste. Novas chegadas aguardam sua decisão.`
        : "Este pedido mantém a prioridade até receber uma resposta.";
  }
  async function focusNext(force = false) {
    if (paused || writing || document.hidden) return;
    if (
      !force &&
      !dialog.open &&
      document.activeElement?.matches(
        "input,select,textarea,[contenteditable='true']",
      )
    )
      return;
    const first = entries[0];
    if (!first) {
      current = null;
      priority = null;
      loadingId = null;
      sequence++;
      if (dialog.open) dialog.close("empty");
      return;
    }
    // A background reconciliation must not overlap an already pending detail read.
    if (loadingId === first.id) return;
    if (!force && current?.id === first.id && current.version === first.version)
      return;
    const changedOrder = priority?.id !== first.id;
    const wasOpen = dialog.open;
    priority = first;
    const serial = ++sequence;
    current = null;
    loadingId = first.id;
    lock(true);
    $("#queue-title").textContent =
      first.status === "QUOTE_PENDING" ? "Combinar entrega" : "Novo pedido";
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
    if (changedOrder) $<HTMLInputElement>("#queue-reason").value = "";
    $("#queue-reason").removeAttribute("aria-invalid");
    $("#queue-reason-error").textContent = "";
    feedback("", false, "#queue-feedback");
    if (!dialog.open) dialog.showModal();
    try {
      const order = await api<Detail>(`painel/pedidos/${first.id}`);
      if (serial !== sequence || paused) return;
      if (!eligible(order.status)) {
        entries = entries.filter((entry) => entry.id !== order.id);
        priority = null;
        loadingId = null;
        count();
        await focusNext();
        return;
      }
      current = order;
      priority = order;
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
      if (changedOrder || !wasOpen) $("#queue-title").focus();
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
      const valid = reason.checkValidity();
      reason.required = false;
      if (!valid) {
        reason.setAttribute("aria-invalid", "true");
        $("#queue-reason-error").textContent =
          "Informe um motivo com pelo menos 3 caracteres para recusar este pedido.";
        reason.focus();
        return;
      }
      reason.removeAttribute("aria-invalid");
      $("#queue-reason-error").textContent = "";
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
      priority = null;
      $<HTMLFormElement>("#queue-quote").reset();
      feedback("", false, "#queue-feedback");
      // Refresh server state before enabling the next decision; never retry a write automatically.
      await refresh();
    } catch (error) {
      feedback(
        `${(error as Error).message} Estamos conferindo o estado do pedido automaticamente; sua decisão não será reenviada.`,
        true,
        "#queue-feedback",
      );
      current = null;
      await refresh();
    } finally {
      writing = false;
      lock(false);
      count();
      if (!current) void focusNext();
    }
  }
  $("#queue-accept").onclick = () => void decide("ACCEPTED");
  $("#queue-reject").onclick = () => void decide("REJECTED");
  $("#queue-reason").addEventListener("input", () => {
    if ($<HTMLInputElement>("#queue-reason").value.trim().length >= 3) {
      $("#queue-reason").removeAttribute("aria-invalid");
      $("#queue-reason-error").textContent = "";
    }
  });
  $<HTMLFormElement>("#queue-quote").onsubmit = (event) => {
    event.preventDefault();
    void decide("QUOTE");
  };
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
      void focusNext(true);
    }
  };
  return {
    update(queue: QueueEntry[]) {
      // The focused order survives minimization, new arrivals and a failed decision.
      // If it leaves the paginated queue, read its detail before releasing priority.
      const active = queue.find((entry) => entry.id === priority?.id);
      const pinned = active ?? priority;
      entries = pinned
        ? [pinned, ...queue.filter((entry) => entry.id !== pinned.id)]
        : queue;
      count();
      void focusNext(!!priority && !active);
    },
  };
}
