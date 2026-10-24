import { $, api, busy, el, feedback } from "./browser";
import { createPoller } from "./poller";
import {
  money,
  statusLabels,
  paymentLabels,
  formatDate,
  type OrderStatus,
  type OrderItem,
} from "../lib/types";
interface PublicOrder {
  protocol: string;
  status: OrderStatus;
  fulfillment: string;
  subtotal: number;
  delivery_fee: number | null;
  total: number | null;
  version: number;
  actionNonce: string;
  items: OrderItem[];
  payment: { method: string; status: string };
  store: {
    title: string;
    slug: string;
    contact: string;
    pickup_address: string;
  };
  quote: {
    version: number;
    fee: number;
    estimate: string;
    expires_at: number;
    accepted_at: number | null;
  } | null;
  events: { action: string; created_at: number; status?: OrderStatus }[];
}
const root = $("#tracking-app");
if (root) {
  const token = root.dataset.token!;
  let order = JSON.parse(root.dataset.initial!) as PublicOrder;
  const nextSteps: Partial<Record<OrderStatus, string>> = {
    PENDING:
      "Seu pedido chegou à loja. Agora é só aguardar o aceite do lojista.",
    QUOTE_PENDING:
      "A loja vai propor uma taxa e um prazo de entrega. Você poderá aceitar antes de fechar o total.",
    QUOTE_PROPOSED:
      "Confira a proposta abaixo. O total só será definido se você aceitar.",
    QUOTE_ACCEPTED:
      "Você aceitou o frete. A loja ainda precisa confirmar o pedido antes da simulação de pagamento.",
    ACCEPTED: "Tudo certo com o pedido. A loja vai iniciar o preparo.",
    PREPARING: "Seu pedido está sendo preparado com cuidado.",
    READY: "Pode vir buscar! O pedido está pronto para retirada na loja.",
    OUT_FOR_DELIVERY:
      "O próprio lojista está cuidando da entrega. Este protótipo não mostra localização.",
    COMPLETED: "Atendimento concluído. Obrigado por testar a experiência!",
    REJECTED: "A loja não pôde atender este pedido de teste.",
    CANCELLED: "Este pedido foi cancelado. Nenhum pagamento real ocorreu.",
  };
  function actionButton(
    label: string,
    action: string,
    kind = "button-primary",
  ) {
    const button = el("button", label, `button ${kind}`);
    button.type = "button";
    button.onclick = () =>
      void busy(button, async () => {
        await api(`pedidos/${token}/${action}`, {
          version: order.version,
          nonce: order.actionNonce,
          quoteVersion: order.quote?.version,
        });
        await refresh();
        feedback("Ação registrada na demonstração.");
      });
    return button;
  }
  function render() {
    const state = $("#tracking-state");
    state.replaceChildren();
    const stateCopy = el("div");
    stateCopy.append(
      el("h2", statusLabels[order.status]),
      el(
        "p",
        order.fulfillment === "PICKUP"
          ? "Retirada na loja"
          : "Entrega pelo vendedor",
      ),
    );
    state.append(
      el(
        "div",
        ["CANCELLED", "REJECTED"].includes(order.status) ? "–" : "✓",
        "state-icon",
      ),
      stateCopy,
    );
    $("#tracking-instructions").replaceChildren(
      el("p", nextSteps[order.status] ?? "", "small muted"),
    );
    const quoteRoot = $("#tracking-quote");
    quoteRoot.replaceChildren();
    if (order.status === "QUOTE_PROPOSED" && order.quote) {
      const q = order.quote;
      const box = el("div", "", "quote-box");
      const expired = q.expires_at * 1000 <= Date.now();
      box.append(
        el(
          "h3",
          expired ? "Esta proposta expirou" : "A loja propôs uma entrega",
        ),
        el("p", `Frete: ${money(q.fee)} · ${q.estimate}`),
        el("p", `Total se você aceitar: ${money(order.subtotal + q.fee)}`),
        el(
          "p",
          `Proposta ${q.version} · Válida até ${formatDate(q.expires_at)}`,
        ),
      );
      if (!expired) {
        const actions = el("div", "", "actions");
        actions.append(
          actionButton("Aceitar frete", "accept-quote"),
          actionButton("Recusar proposta", "reject-quote", "button-quiet"),
        );
        box.append(actions);
      } else
        box.append(
          el(
            "p",
            "Aguarde uma nova proposta do lojista. Nenhum valor foi fechado.",
          ),
        );
      quoteRoot.append(box);
    }
    const timeline = $("#tracking-timeline");
    timeline.replaceChildren();
    const eventLabels: Record<string, string> = {
      ORDER_CREATED: "Pedido enviado à loja",
      QUOTE_PROPOSED: "Nova proposta de frete",
      QUOTE_ACCEPTED: "Frete aceito pelo comprador",
      QUOTE_REJECTED: "Proposta recusada pelo comprador",
      PAYMENT_DECLARED: "Declaração de Pix simulada",
      PAYMENT_LATE: "Declaração simulada após cancelamento",
      PAYMENT_SIMULATED_CONFIRMED: "Conferência simulada pelo lojista",
    };
    for (const event of order.events) {
      const li = el(
        "li",
        event.status && event.action === "ORDER_TRANSITION"
          ? statusLabels[event.status]
          : (eventLabels[event.action] ?? event.action),
      );
      li.append(el("small", formatDate(event.created_at)));
      timeline.append(li);
    }
    $("#tracking-store").textContent = order.store.title;
    const items = $("#tracking-items");
    items.replaceChildren();
    for (const i of order.items) {
      const li = el("li");
      li.append(
        el("span", `${i.quantity} × ${i.title}`),
        el("span", money(i.price * i.quantity)),
      );
      items.append(li);
    }
    $("#tracking-subtotal").textContent = money(order.subtotal);
    $("#tracking-fee").textContent =
      order.delivery_fee === 0 ? "Grátis" : money(order.delivery_fee);
    $("#tracking-total").textContent = money(order.total);
    const info = $("#tracking-store-info");
    info.replaceChildren(
      el(
        "h3",
        order.fulfillment === "PICKUP" ? "Onde retirar" : "Contato da loja",
      ),
      el(
        "p",
        order.fulfillment === "PICKUP"
          ? order.store.pickup_address
          : order.store.contact,
      ),
    );
    const back = el("a", "Voltar ao cardápio", "inline-link tracking-back");
    back.href = `/loja/${order.store.slug}`;
    info.append(back);
    const payment = $("#tracking-payment");
    payment.replaceChildren(
      el("p", paymentLabels[order.payment.status], "notice"),
    );
    if (
      order.payment.method === "PIX_SIMULATED" &&
      order.payment.status === "SIMULATED_NOT_COLLECTED"
    ) {
      if (["CANCELLED", "REJECTED"].includes(order.status)) {
        payment.append(
          el(
            "p",
            "Teste de exceção: registrar uma declaração tardia não reativa o pedido.",
            "small muted",
          ),
          actionButton(
            "Simular declaração após cancelamento",
            "declare-payment",
            "button-quiet",
          ),
        );
      } else if (
        order.total !== null &&
        [
          "ACCEPTED",
          "PREPARING",
          "READY",
          "OUT_FOR_DELIVERY",
          "COMPLETED",
        ].includes(order.status)
      )
        payment.append(actionButton("Simular “já paguei”", "declare-payment"));
      else
        payment.append(
          el(
            "p",
            "A simulação de Pix aguarda total definido e aceite do lojista.",
            "small muted",
          ),
        );
    } else if (order.payment.method === "ON_FULFILLMENT_SIMULATED")
      payment.append(
        el(
          "p",
          "Pagamento na retirada ou entrega, apenas simulado.",
          "small muted",
        ),
      );
  }
  async function load() {
    const explicit = requestedRefresh;
    requestedRefresh = false;
    const next = await api<PublicOrder>(`pedidos/${token}`);
    if (!automaticUpdates && !explicit) return;
    if (next.version < order.version) return;
    if (
      next.version !== order.version ||
      (next.quote && next.quote.expires_at <= Date.now() / 1000)
    ) {
      order = next;
      render();
    }
    feedback("Dados atualizados.");
  }
  let automaticUpdates = true;
  let requestedRefresh = false;
  const canRefresh = () =>
    automaticUpdates &&
    !document.hidden &&
    !root.contains(document.activeElement);
  const poller = createPoller(load, {
    enabled: canRefresh,
    onError: (error) => feedback((error as Error).message, true),
  });
  const refresh = () => {
    requestedRefresh = true;
    return poller.refresh(true);
  };
  $("#refresh-tracking").onclick = () => void refresh();
  $("#pause-tracking-updates").onclick = (event) => {
    automaticUpdates = !automaticUpdates;
    const button = event.currentTarget as HTMLButtonElement;
    button.setAttribute("aria-pressed", String(!automaticUpdates));
    button.textContent = automaticUpdates
      ? "Pausar atualização automática"
      : "Retomar atualização automática";
    if (automaticUpdates) void refresh();
    else
      feedback(
        "Atualização automática pausada. Use Atualizar pedido para consultar sem reativá-la.",
      );
  };
  $("#copy-link").onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      feedback("Link copiado. Guarde-o para acompanhar o pedido.");
    } catch {
      feedback("Copie o endereço desta página para guardar o link.", true);
    }
  };
  const slug = order.store.slug;
  try {
    localStorage.removeItem(`doofi.lastOrder.${slug}`);
  } catch {}
  try {
    const intentKey = `doofi.intent.${slug}`;
    const last = JSON.parse(
      sessionStorage.getItem(`doofi.lastOrder.${slug}`) ?? "null",
    );
    if (
      last?.token === token &&
      sessionStorage.getItem(`${intentKey}.completed`) === "true"
    ) {
      localStorage.removeItem(`doofi.cart.${slug}`);
      sessionStorage.removeItem(intentKey);
      sessionStorage.removeItem(`${intentKey}.payload`);
      sessionStorage.removeItem(`${intentKey}.completed`);
      sessionStorage.removeItem(`doofi.lastOrder.${slug}`);
    }
  } catch {}
  render();
  document.addEventListener("visibilitychange", () => {
    if (canRefresh()) void poller.refresh();
  });
}
