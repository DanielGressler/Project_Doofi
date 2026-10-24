import { api, ApiError, el } from "./browser";
import { canConfirmReceipt } from "../lib/order-workflow";
import { formatDate } from "../lib/types";
import type { PublicOrder } from "../lib/public-order";

export function renderReceipt(
  root: HTMLElement,
  order: PublicOrder,
  token: string,
  update: (fresh: PublicOrder) => void,
  pending: (value: boolean) => void,
) {
  root.replaceChildren();
  const status = el("p", "", "small");
  status.setAttribute("role", "status");
  const error = el("p", "", "feedback error");
  error.setAttribute("role", "alert");
  root.append(status, error);
  if (order.received_at != null) {
    status.textContent = `Recebimento confirmado em ${formatDate(order.received_at)}. ${order.status === "COMPLETED" ? "Pedido concluído." : canConfirmReceipt(order.status) ? "A loja já pode concluir o pedido." : "Este atendimento já foi encerrado."}`;
    return;
  }
  if (!canConfirmReceipt(order.status)) {
    status.textContent = ["COMPLETED", "CANCELLED", "REJECTED"].includes(
      order.status,
    )
      ? "Este atendimento já foi encerrado."
      : "Você poderá confirmar o recebimento quando a loja marcar o pedido como pronto.";
    return;
  }
  status.textContent =
    "Confirme somente depois de receber os produtos. Isso libera a conclusão pela loja.";
  const button = el(
    "button",
    "Confirmar recebimento",
    "button button-primary button-full",
  );
  button.type = "button";
  error.before(button);
  let writing = false;
  function confirmed(fresh: PublicOrder) {
    update(fresh);
    const message = root.querySelector<HTMLElement>('[role="status"]');
    if (message) {
      message.tabIndex = -1;
      message.focus({ preventScroll: true });
    }
  }
  button.onclick = async () => {
    if (writing) return;
    writing = true;
    pending(true);
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    error.textContent = "";
    try {
      const result = await api<{ received_at: number; version: number }>(
        `pedidos/${token}/confirm-receipt`,
        {
          version: order.version,
          nonce: order.actionNonce,
        },
      );
      let fresh: PublicOrder = {
        ...order,
        received_at: result.received_at,
      };
      // A replay may return a newer version after the merchant already completed.
      // Never attach that version to an older snapshot of status/payment/events.
      try {
        fresh = await api<PublicOrder>(`pedidos/${token}`);
      } catch {
        /* Keep the confirmed fact and old version so the next read still refreshes. */
      }
      confirmed(fresh);
    } catch (failure) {
      // A lost response may follow a committed write. Read once; never replay automatically.
      try {
        const fresh = await api<PublicOrder>(`pedidos/${token}`);
        if (fresh.received_at != null) {
          confirmed(fresh);
          return;
        }
        update(fresh);
      } catch {
        /* Preserve the original actionable error. */
      }
      const target = root.querySelector<HTMLElement>('[role="alert"]');
      if (target)
        target.textContent = `${(failure as Error).message}${failure instanceof ApiError && failure.status === 0 ? " Consulte o pedido antes de tentar novamente; a ação não foi reenviada." : ""}`;
    } finally {
      writing = false;
      pending(false);
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  };
}
