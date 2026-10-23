import type { Product, Store } from "./types";

// Explicit projections keep persistence-only fields out of public responses,
// including columns added to the database by future implementations.
export function publicStore(store: Store) {
  return {
    slug: store.slug,
    title: store.title,
    description: store.description,
    contact: store.contact,
    pickup_address: store.pickup_address,
    hours: store.hours,
    is_open: store.is_open,
    delivery_fee: store.delivery_fee,
    neighborhoods: store.neighborhoods,
    theme: store.theme,
    has_own_delivery: store.has_own_delivery,
    palette: store.palette,
    font: store.font,
    layout: store.layout,
    banner_id: store.banner_id,
  };
}

export function publicProduct(product: Product) {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    category: product.category,
    price: product.price,
    available: product.available,
    image: product.image,
    image_id: product.image_id,
    is_combo: product.is_combo,
    orderable: product.orderable,
    components: product.components.map(({ id, title, available }) => ({
      id,
      title,
      available,
    })),
  };
}

export type PublicProduct = ReturnType<typeof publicProduct>;
