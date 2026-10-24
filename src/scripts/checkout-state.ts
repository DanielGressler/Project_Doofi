// This is a per-tab delivery draft, never a customer account or authorization.
export const draftLifetime = 60 * 60 * 1000;
export interface CheckoutPayload {
  intent: string;
  items: { productId: string; quantity: number }[];
  fulfillment: "PICKUP" | "FIXED" | "QUOTE";
  payment: "PIX_SIMULATED" | "ON_FULFILLMENT_SIMULATED";
  name: string;
  phone: string;
  email: string;
  note: string;
  address?: string;
  neighborhood?: string;
  postalCode?: string;
  consent: true;
  syntheticData: true;
}
export interface CheckoutDraft {
  slug: string;
  savedAt: number;
  payload: CheckoutPayload;
  lines: {
    productId: string;
    title: string;
    price: number;
    quantity: number;
  }[];
  deliveryFee: number;
}
export type TabStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const draftKey = (slug: string) => `doofi.intent.${slug}`;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" && value.length >= min && value.length <= max;
const amount = (value: unknown, max = 100000): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;
const recent = (value: unknown, now: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value <= now + 60000 &&
  now - value < draftLifetime;
export function clearDraft(storage: TabStorage, slug: string) {
  storage.removeItem(draftKey(slug));
  storage.removeItem(`${draftKey(slug)}.payload`);
}
export function clearReceipt(storage: TabStorage, slug: string) {
  storage.removeItem(`doofi.lastOrder.${slug}`);
  storage.removeItem(`${draftKey(slug)}.completed`);
}
export function parseDraft(
  raw: string,
  slug: string,
  now = Date.now(),
): CheckoutDraft | null {
  try {
    const draft: unknown = JSON.parse(raw);
    if (
      !record(draft) ||
      draft.slug !== slug ||
      !recent(draft.savedAt, now) ||
      !record(draft.payload)
    )
      return null;
    const p = draft.payload;
    if (
      !text(p.intent, 64, 64) ||
      !/^[a-f0-9]{64}$/.test(p.intent) ||
      !Array.isArray(p.items) ||
      !p.items.length ||
      p.items.length > 20 ||
      typeof p.fulfillment !== "string" ||
      !["PICKUP", "FIXED", "QUOTE"].includes(p.fulfillment) ||
      typeof p.payment !== "string" ||
      !["PIX_SIMULATED", "ON_FULFILLMENT_SIMULATED"].includes(p.payment)
    )
      return null;
    if (
      !text(p.name, 2, 80) ||
      !text(p.phone, 3, 40) ||
      !text(p.email, 3, 120) ||
      !text(p.note, 0, 300) ||
      p.consent !== true ||
      p.syntheticData !== true
    )
      return null;
    const items: CheckoutPayload["items"] = [];
    for (const item of p.items) {
      if (
        !record(item) ||
        !text(item.productId, 1, 80) ||
        !amount(item.quantity, 10) ||
        item.quantity < 1 ||
        items.some((i) => i.productId === item.productId)
      )
        return null;
      items.push({ productId: item.productId, quantity: item.quantity });
    }
    const delivery = p.fulfillment !== "PICKUP";
    if (
      delivery &&
      (!text(p.address, 5, 160) ||
        !text(p.neighborhood, 2, 80) ||
        !text(p.postalCode, 8, 9))
    )
      return null;
    if (
      !Array.isArray(draft.lines) ||
      draft.lines.length !== items.length ||
      !amount(draft.deliveryFee)
    )
      return null;
    const lines: CheckoutDraft["lines"] = [];
    for (let index = 0; index < items.length; index++) {
      const line = draft.lines[index],
        item = items[index];
      if (
        !record(line) ||
        line.productId !== item.productId ||
        line.quantity !== item.quantity ||
        !text(line.title, 1, 300) ||
        !amount(line.price) ||
        line.price < 1
      )
        return null;
      lines.push({
        productId: item.productId,
        quantity: item.quantity,
        title: line.title,
        price: line.price,
      });
    }
    // Rebuild an allowlist; storage cannot inject account IDs, new fields or prototype keys.
    const payload: CheckoutPayload = {
      intent: p.intent,
      items,
      fulfillment: p.fulfillment as CheckoutPayload["fulfillment"],
      payment: p.payment as CheckoutPayload["payment"],
      name: p.name,
      phone: p.phone,
      email: p.email,
      note: p.note,
      consent: true,
      syntheticData: true,
      ...(delivery
        ? {
            address: p.address as string,
            neighborhood: p.neighborhood as string,
            postalCode: p.postalCode as string,
          }
        : {}),
    };
    return {
      slug,
      savedAt: draft.savedAt,
      payload,
      lines,
      deliveryFee: draft.deliveryFee,
    };
  } catch {
    return null;
  }
}
export function readDraft(storage: TabStorage, slug: string, now = Date.now()) {
  const raw = storage.getItem(`${draftKey(slug)}.payload`);
  if (!raw) return null;
  const draft = parseDraft(raw, slug, now);
  if (!draft) clearDraft(storage, slug);
  return draft;
}
export function writeDraft(storage: TabStorage, draft: CheckoutDraft) {
  storage.setItem(`${draftKey(draft.slug)}.payload`, JSON.stringify(draft));
}
export function readReceipt(
  storage: TabStorage,
  slug: string,
  now = Date.now(),
) {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(`doofi.lastOrder.${slug}`) ?? "null",
    );
    if (
      record(value) &&
      value.slug === slug &&
      text(value.token, 64, 64) &&
      /^[a-f0-9]{64}$/.test(value.token) &&
      text(value.protocol, 1, 40) &&
      recent(value.savedAt, now)
    )
      return { token: value.token, protocol: value.protocol };
  } catch {
    /* An invalid receipt is discarded without rendering its fields. */
  }
  clearReceipt(storage, slug);
  return null;
}
