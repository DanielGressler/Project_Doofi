export interface Store {
  id: string;
  slug: string;
  title: string;
  description: string;
  contact: string;
  pickup_address: string;
  hours: string;
  is_open: number;
  active: number;
  delivery_fee: number;
  neighborhoods: string;
  theme: string;
  version: number;
  has_own_delivery: number;
  palette: "terracotta" | "forest" | "ocean" | "plum";
  font: "editorial" | "simple" | "classic";
  layout: "cozy" | "compact" | "showcase";
  banner_id: string | null;
  setup_complete: number;
}
export type StoreAppearance = Pick<Store, "palette" | "font" | "layout">;
export interface Product {
  id: string;
  store_id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  available: number;
  image: string;
  version: number;
  image_id: string | null;
  is_combo: number;
  orderable: number;
  components: {
    id: string;
    title: string;
    available: number;
    version: number;
  }[];
}
export interface Session {
  user_id: string;
  store_id: string;
  role: "owner" | "staff";
  csrf_token: string;
  token_hash: string;
  email: string;
}
export interface AuthenticatedSession extends Session {
  store_title: string;
  store_slug: string;
  store_setup_complete: number;
}
export type OrderStatus =
  | "PENDING"
  | "QUOTE_PENDING"
  | "QUOTE_PROPOSED"
  | "QUOTE_ACCEPTED"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";
export interface Order {
  id: string;
  store_id: string;
  protocol: string;
  status: OrderStatus;
  public_token_hash: string;
  intent_hash: string;
  request_hash: string;
  fulfillment: "PICKUP" | "FIXED" | "QUOTE";
  subtotal: number;
  delivery_fee: number | null;
  total: number | null;
  version: number;
  customer_name: string;
  customer_contact: string;
  customer_id: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  address: string | null;
  neighborhood: string | null;
  postal_code: string | null;
  note: string;
  quote_version: number;
  created_at: number;
  updated_at: number;
}
export interface Quote {
  id: string;
  order_id: string;
  version: number;
  fee: number;
  estimate: string;
  expires_at: number;
  accepted_at: number | null;
}
export interface Payment {
  method: "PIX_SIMULATED" | "ON_FULFILLMENT_SIMULATED";
  status: string;
}
export interface OrderItem {
  product_id: string;
  title: string;
  price: number;
  quantity: number;
}
export const statusLabels: Record<OrderStatus, string> = {
  PENDING: "Aguardando aceite",
  QUOTE_PENDING: "Aguardando cotação",
  QUOTE_PROPOSED: "Frete proposto",
  QUOTE_ACCEPTED: "Frete aceito pelo comprador",
  ACCEPTED: "Pedido aceito",
  PREPARING: "Em preparo",
  READY: "Pronto para retirar",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  COMPLETED: "Concluído",
  REJECTED: "Recusado",
  CANCELLED: "Cancelado",
};
export const paymentLabels: Record<string, string> = {
  SIMULATED_NOT_COLLECTED: "Simulado · aguardando",
  SIMULATED_CUSTOMER_DECLARED: "Simulado · declaração do comprador",
  SIMULATED_SELLER_CONFIRMED: "Simulado · conferência do lojista",
  SIMULATED_LATE_DECLARATION: "Simulado · declaração após cancelamento",
};
export const money = (cents: number | null) =>
  cents === null
    ? "A combinar"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(cents / 100);
export const formatDate = (seconds: number) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(seconds * 1000));
