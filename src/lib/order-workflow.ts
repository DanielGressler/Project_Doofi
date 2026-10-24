import type { Order, OrderStatus } from "./types";

export const transitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PENDING: ["ACCEPTED", "REJECTED"],
  QUOTE_PENDING: ["REJECTED"],
  QUOTE_PROPOSED: ["REJECTED"],
  QUOTE_ACCEPTED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["PREPARING", "READY", "CANCELLED"],
  PREPARING: ["READY", "OUT_FOR_DELIVERY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["COMPLETED", "CANCELLED"],
};

export function allowedOrderTransitions(
  order: Pick<Order, "status" | "fulfillment" | "received_at">,
) {
  return (transitions[order.status] ?? []).filter(
    (target) =>
      !(target === "OUT_FOR_DELIVERY" && order.fulfillment === "PICKUP") &&
      !(target === "COMPLETED" && order.received_at == null),
  );
}

export function canConfirmReceipt(status: OrderStatus) {
  return status === "READY" || status === "OUT_FOR_DELIVERY";
}

export function fulfillmentAction(
  order: Pick<Order, "status" | "received_at">,
) {
  const { status } = order;
  if (status === "ACCEPTED" || status === "PREPARING")
    return {
      label: "Pedido pronto",
      target: "READY" as const,
      confirmation: false,
      blocked: false,
    };
  if (status === "READY" || status === "OUT_FOR_DELIVERY")
    return {
      label: "Entregar pedido",
      target: "COMPLETED" as const,
      confirmation: true,
      blocked: order.received_at == null,
    };
  return null;
}
