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
  order: Pick<Order, "status" | "fulfillment">,
) {
  return (transitions[order.status] ?? []).filter(
    (target) =>
      !(target === "OUT_FOR_DELIVERY" && order.fulfillment === "PICKUP"),
  );
}

export function fulfillmentAction(status: OrderStatus) {
  if (status === "ACCEPTED" || status === "PREPARING")
    return {
      label: "Pedido pronto",
      target: "READY" as const,
      confirmation: false,
    };
  if (status === "READY" || status === "OUT_FOR_DELIVERY")
    return {
      label: "Entregar pedido",
      target: "COMPLETED" as const,
      confirmation: true,
    };
  return null;
}
