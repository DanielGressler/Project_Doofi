import type { Order, Product, Store } from "./types";
import { publicProduct, publicStore } from "./public-data";

// Explicit projections also protect authenticated responses from future persistence fields.
export function panelStore(store: Store) {
  return {
    ...publicStore(store),
    id: store.id,
    version: store.version,
    active: store.active,
    setup_complete: store.setup_complete,
  };
}
export function panelProduct(product: Product) {
  return {
    ...publicProduct(product),
    store_id: product.store_id,
    version: product.version,
    components: product.components.map(({ id, title, available, version }) => ({
      id,
      title,
      available,
      version,
    })),
  };
}
export function panelOrder(order: Order) {
  return {
    id: order.id,
    store_id: order.store_id,
    protocol: order.protocol,
    status: order.status,
    fulfillment: order.fulfillment,
    subtotal: order.subtotal,
    delivery_fee: order.delivery_fee,
    total: order.total,
    version: order.version,
    customer_name: order.customer_name,
    customer_contact: order.customer_contact,
    customer_id: order.customer_id,
    customer_phone: order.customer_phone,
    customer_email: order.customer_email,
    address: order.address,
    neighborhood: order.neighborhood,
    postal_code: order.postal_code,
    note: order.note,
    quote_version: order.quote_version,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}
