// Per-tab order references only: no contacts, customer account, or merchant session.
type ReferenceStorage = Pick<Storage, "getItem" | "setItem">;
const key = "doofi.customerOrders";
const lifetime = 30 * 24 * 60 * 60 * 1000;
export function readCustomerOrders(
  storage: ReferenceStorage,
  now = Date.now(),
) {
  try {
    const values: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    return values
      .flatMap((value): { token: string; savedAt: number }[] => {
        if (
          !value ||
          typeof value !== "object" ||
          typeof value.token !== "string" ||
          !/^[a-f0-9]{64}$/.test(value.token) ||
          !Number.isSafeInteger(value.savedAt) ||
          value.savedAt > now + 60_000 ||
          now - value.savedAt >= lifetime ||
          seen.has(value.token)
        )
          return [];
        seen.add(value.token);
        return [{ token: value.token, savedAt: value.savedAt }];
      })
      .slice(0, 20);
  } catch {
    return [];
  }
}
export function rememberCustomerOrder(
  storage: ReferenceStorage,
  token: string,
  now = Date.now(),
) {
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  storage.setItem(
    key,
    JSON.stringify(
      [
        { token, savedAt: now },
        ...readCustomerOrders(storage, now).filter(
          (entry) => entry.token !== token,
        ),
      ].slice(0, 20),
    ),
  );
}
export function forgetCustomerOrder(storage: ReferenceStorage, token: string) {
  storage.setItem(
    key,
    JSON.stringify(
      readCustomerOrders(storage).filter((entry) => entry.token !== token),
    ),
  );
}
