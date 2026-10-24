import { $, api, ApiError, el, feedback } from "./browser";
import { createPoller } from "./poller";
import { notifyAction } from "./action-notices";
import {
  allowedOrderTransitions,
  fulfillmentAction,
} from "../lib/order-workflow";
import {
  money,
  statusLabels,
  paymentLabels,
  formatDate,
  type Order,
  type Payment,
  type Quote,
  type OrderStatus,
} from "../lib/types";

type State = Pick<
  Order,
  | "status"
  | "version"
  | "fulfillment"
  | "subtotal"
  | "delivery_fee"
  | "total"
  | "received_at"
> & { payment: Payment; quote: Quote | null };
type AuditEvent = { action: string; metadata: string; created_at: number };
const root = $("#order-detail");
if (root) {
  const id = root.dataset.id!;
  const csrf = $("#panel-app").dataset.csrf!;
  let state = JSON.parse(root.dataset.initial!) as State;
  const confirmation = $<HTMLDialogElement>("#delivery-confirmation");
  const log = $<HTMLDetailsElement>("#transaction-log");
  let confirmationVersion: number | null = null;
  let writing = false;
  let synchronized = true;
  let mutationEpoch = 0;
  let actionError = "";
  let focusCompletion = false;
  let uncertainOutcome: {
    version: number;
    matches: (fresh: State) => boolean;
    error: string;
    message: (fresh: State) => string;
  } | null = null;
  let auditInFlight: Promise<void> | undefined;
  let auditVersion = -1;

  function lock() {
    const disabled = writing || !synchronized;
    root
      .querySelectorAll<HTMLButtonElement | HTMLInputElement>(
        "#fulfill-order,#accept-order,#reject-order,#cancel-order,#confirm-payment,#confirm-delivery,#close-delivery-confirmation,#quote-form button,#quote-form input,#transition-reason",
      )
      .forEach((button) => {
        button.disabled =
          disabled ||
          (button.id === "fulfill-order" &&
            !!fulfillmentAction(state)?.blocked);
      });
    root.setAttribute("aria-busy", String(disabled));
    $("#reload-detail").setAttribute("aria-busy", String(writing));
  }
  function render() {
    root.dataset.version = String(state.version);
    const badge = $("#order-status");
    badge.textContent = statusLabels[state.status];
    badge.dataset.status = state.status;
    $("#detail-subtotal").textContent = money(state.subtotal);
    $("#detail-fee").textContent = money(state.delivery_fee);
    $("#detail-total").textContent = money(state.total);
    const action = fulfillmentAction(state);
    const primary = $("#fulfill-order");
    primary.hidden = !action;
    if (action) primary.textContent = action.label;
    $("#fulfillment-help").textContent = ["ACCEPTED", "PREPARING"].includes(
      state.status,
    )
      ? "Ao terminar o preparo, marque o pedido como pronto."
      : ["READY", "OUT_FOR_DELIVERY"].includes(state.status)
        ? state.received_at == null
          ? "Aguardando o cliente confirmar o recebimento em Meus pedidos. A conclusão será liberada depois dessa confirmação."
          : "O cliente confirmou o recebimento. Você já pode concluir a entrega."
        : "";
    $("#customer-receipt-state").textContent =
      state.received_at != null
        ? `Recebimento confirmado pelo cliente em ${formatDate(state.received_at)}.`
        : "Recebimento ainda não confirmado pelo cliente.";
    const allowed = allowedOrderTransitions(state);
    $("#accept-order").hidden = !allowed.includes("ACCEPTED");
    $("#reject-order").hidden = !allowed.includes("REJECTED");
    $("#cancel-order").hidden = !allowed.includes("CANCELLED");
    $("#other-order-actions").hidden = !allowed.some((target) =>
      ["REJECTED", "CANCELLED"].includes(target),
    );
    $("#fulfillment-final").hidden = allowed.length > 0;
    $("#fulfillment-final").textContent =
      state.status === "COMPLETED"
        ? "Entrega confirmada pelo lojista. O histórico continua disponível."
        : "O atendimento chegou a um estado final. O histórico continua disponível.";
    $("#payment-state").replaceChildren(
      el(
        "span",
        paymentLabels[state.payment.status] ?? "Pagamento de demonstração",
      ),
      document.createElement("br"),
      document.createTextNode("Nenhuma transferência ou confirmação bancária."),
    );
    $("#confirm-payment").hidden =
      state.total === null ||
      ![
        "ACCEPTED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "COMPLETED",
      ].includes(state.status) ||
      state.payment.status === "SIMULATED_SELLER_CONFIRMED";
    const quoteForm = $("#quote-form");
    if (quoteForm)
      quoteForm.hidden = !["QUOTE_PENDING", "QUOTE_PROPOSED"].includes(
        state.status,
      );
    const quoteInfo = $("#quote-info");
    if (quoteInfo) {
      quoteInfo.hidden = !state.quote;
      if (state.quote)
        quoteInfo.textContent = `Proposta ${state.quote.version}: ${money(state.quote.fee)} · ${state.quote.estimate}. Válida até ${formatDate(state.quote.expires_at)}. ${state.quote.accepted_at ? "Aceita pelo comprador." : "Aguardando aceite explícito do comprador."}`;
    }
    lock();
  }
  function closeConfirmation() {
    if (confirmation.open) confirmation.close();
    confirmationVersion = null;
  }
  async function loadAudit() {
    if (auditInFlight) return auditInFlight;
    const version = state.version;
    auditInFlight = (async () => {
      try {
        const events = await api<AuditEvent[]>(
          `painel/pedidos/${id}/auditoria`,
        );
        const labels: Record<string, string> = {
          ORDER_CREATED: "Pedido recebido",
          QUOTE_PROPOSED: "Proposta de frete enviada",
          QUOTE_ACCEPTED: "Frete aceito pelo comprador",
          QUOTE_REJECTED: "Frete recusado pelo comprador",
          PAYMENT_DECLARED: "Pagamento declarado na simulação",
          PAYMENT_LATE: "Declaração após cancelamento",
          PAYMENT_SIMULATED_CONFIRMED: "Conferência simulada pelo lojista",
          CUSTOMER_RECEIPT_CONFIRMED: "Recebimento confirmado pelo cliente",
        };
        const list = $("#audit-list");
        list.replaceChildren();
        for (const event of events) {
          let status: OrderStatus | undefined;
          try {
            status = JSON.parse(event.metadata).status;
          } catch {
            /* Historical malformed metadata must not block the order. */
          }
          const label =
            event.action === "ORDER_TRANSITION" &&
            status &&
            Object.hasOwn(statusLabels, status)
              ? statusLabels[status]
              : (labels[event.action] ?? event.action.replaceAll("_", " "));
          const row = el("li", label);
          row.append(el("small", formatDate(event.created_at)));
          list.append(row);
        }
        if (!events.length) list.append(el("li", "Nenhum evento disponível."));
        $("#audit-count").textContent =
          `${events.length} evento(s)${events.length === 100 ? " recentes" : ""}`;
        auditVersion = version;
        feedback("", false, "#audit-feedback");
        $("#retry-audit").hidden = true;
      } catch (error) {
        feedback((error as Error).message, true, "#audit-feedback");
        $("#retry-audit").hidden = false;
      } finally {
        auditInFlight = undefined;
      }
    })();
    return auditInFlight;
  }
  async function load() {
    if (writing) return;
    const epoch = mutationEpoch;
    const fresh = await api<State>(`painel/pedidos/${id}`);
    if (epoch !== mutationEpoch || writing || fresh.version < state.version)
      return;
    if (confirmation.open && confirmationVersion !== fresh.version) {
      closeConfirmation();
      actionError =
        "O pedido foi atualizado. Confira os dados antes de confirmar a entrega.";
    }
    const changed = fresh.version !== state.version;
    state = fresh;
    synchronized = true;
    if (uncertainOutcome) {
      if (
        fresh.version > uncertainOutcome.version &&
        uncertainOutcome.matches(fresh)
      ) {
        actionError = "";
        focusCompletion = fresh.status === "COMPLETED";
        notifyAction(uncertainOutcome.message(fresh));
      } else {
        actionError = `${uncertainOutcome.error} O estado atual foi consultado; nenhuma operação foi reenviada automaticamente.`;
      }
      uncertainOutcome = null;
    }
    if (changed) render();
    else lock();
    if (focusCompletion && state.status === "COMPLETED") {
      const completed = $("#fulfillment-final");
      completed.tabIndex = -1;
      completed.focus({ preventScroll: true });
      focusCompletion = false;
    }
    feedback(actionError, !!actionError);
    if (log.open && auditVersion !== state.version) await loadAudit();
  }
  const poller = createPoller(load, {
    interval: 5_000,
    enabled: () => !writing && !document.hidden,
    onError: (error) =>
      feedback(
        `${(error as Error).message}${!synchronized ? " Os botões aguardam a conferência do estado do pedido." : ""}`,
        true,
      ),
  });
  async function mutate(
    path: string,
    data: Record<string, unknown>,
    message: string,
  ) {
    if (writing || !synchronized) return;
    writing = true;
    synchronized = false;
    mutationEpoch++;
    actionError = "";
    uncertainOutcome = null;
    feedback("");
    lock();
    try {
      await api(`painel/pedidos/${id}/${path}`, data, "POST", csrf);
      focusCompletion = path === "transicoes" && data.status === "COMPLETED";
      closeConfirmation();
      notifyAction(message);
    } catch (error) {
      closeConfirmation();
      if (
        !(error instanceof ApiError) ||
        error.status === 0 ||
        error.status >= 500
      ) {
        const nextQuote = (state.quote?.version ?? 0) + 1;
        uncertainOutcome = {
          version: Number(data.version),
          error: (error as Error).message,
          matches: (fresh) =>
            path === "transicoes"
              ? fresh.status === data.status
              : path === "simular-conferencia"
                ? fresh.payment.status === "SIMULATED_SELLER_CONFIRMED"
                : fresh.quote?.version === nextQuote &&
                  fresh.status === "QUOTE_PROPOSED",
          message: (fresh) =>
            path === "transicoes"
              ? `Estado conferido: ${statusLabels[fresh.status]}.`
              : path === "simular-conferencia"
                ? "Conferência simulada confirmada após consultar o pedido."
                : "Proposta de frete conferida após consultar o pedido.",
        };
      }
      actionError = `${(error as Error).message} ${error instanceof ApiError && error.status === 0 ? "Conferindo o resultado antes de permitir outra ação. A operação não será reenviada automaticamente." : "Conferindo o estado atual do pedido."}`;
      feedback(actionError, true);
    } finally {
      writing = false;
      // Discard reads started before the write, then require a fresh read before unlocking.
      await poller.refresh(true);
      lock();
    }
  }
  function change(target: OrderStatus, message: string) {
    const reason = $<HTMLInputElement>("#transition-reason");
    if (
      ["REJECTED", "CANCELLED"].includes(target) &&
      reason.value.trim().length < 3
    ) {
      $<HTMLDetailsElement>("#other-order-actions").open = true;
      reason.setAttribute("aria-invalid", "true");
      feedback(
        "Informe um motivo com pelo menos 3 caracteres.",
        true,
        "#reason-error",
      );
      reason.focus();
      return;
    }
    void mutate(
      "transicoes",
      { version: state.version, status: target, reason: reason.value },
      message,
    );
  }
  $("#fulfill-order").onclick = () => {
    if (writing || !synchronized) return;
    const action = fulfillmentAction(state);
    if (!action || action.blocked) return;
    if (action.confirmation) {
      confirmationVersion = state.version;
      feedback("", false, "#delivery-confirmation-error");
      if (!confirmation.open) confirmation.showModal();
    } else change(action.target, "Pedido marcado como pronto.");
  };
  $("#accept-order").onclick = () => change("ACCEPTED", "Pedido aceito.");
  $("#reject-order").onclick = () => change("REJECTED", "Pedido recusado.");
  $("#cancel-order").onclick = () => change("CANCELLED", "Pedido cancelado.");
  $("#confirm-delivery").onclick = () => {
    if (
      confirmationVersion === null ||
      confirmationVersion !== state.version ||
      !allowedOrderTransitions(state).includes("COMPLETED")
    ) {
      closeConfirmation();
      feedback(
        "O pedido mudou. Confira o estado atual antes de confirmar.",
        true,
      );
      void poller.refresh(true);
      return;
    }
    void mutate(
      "transicoes",
      { version: confirmationVersion, status: "COMPLETED" },
      "Entrega confirmada com sucesso.",
    );
  };
  $("#close-delivery-confirmation").onclick = closeConfirmation;
  confirmation.addEventListener("cancel", (event) => {
    if (writing) event.preventDefault();
  });
  confirmation.addEventListener("close", () => {
    confirmationVersion = null;
  });
  $("#confirm-payment").onclick = () =>
    void mutate(
      "simular-conferencia",
      { version: state.version },
      "Conferência simulada registrada.",
    );
  $<HTMLFormElement>("#quote-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget as HTMLFormElement);
    void mutate(
      "cotacao",
      {
        version: state.version,
        fee: Math.round(Number(fields.get("fee")) * 100),
        validMinutes: Number(fields.get("validMinutes")),
        estimate: fields.get("estimate"),
      },
      "Proposta de frete enviada.",
    );
  });
  $("#transition-reason").addEventListener("input", (event) => {
    if ((event.currentTarget as HTMLInputElement).value.trim().length >= 3) {
      $("#transition-reason").removeAttribute("aria-invalid");
      feedback("", false, "#reason-error");
    }
  });
  $("#reload-detail").onclick = () => {
    if (!writing) void poller.refresh(true);
  };
  log.addEventListener("toggle", () => {
    if (log.open && auditVersion !== state.version) void loadAudit();
  });
  $("#retry-audit").onclick = () => void loadAudit();
  render();
  void poller.refresh();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !writing) void poller.refresh();
  });
  window.addEventListener("online", () => {
    if (!writing) void poller.refresh(true);
  });
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) poller.stop();
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    closeConfirmation();
    mutationEpoch++;
    synchronized = false;
    lock();
    void poller.refresh(true);
  });
}
