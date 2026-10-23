import { textField } from "./core";

export interface CustomerDetails {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  neighborhood: string | null;
  postal_code: string | null;
  created_at: number;
}

// These are delivery fields. They never create users, sessions or memberships.
export function deliveryIdentity(input: Record<string, unknown>) {
  return {
    name: textField(input.name, "Nome fictício", 2, 80),
    phone: textField(input.phone, "Telefone fictício", 3, 40),
    email: textField(input.email, "E-mail fictício", 3, 120),
  };
}
