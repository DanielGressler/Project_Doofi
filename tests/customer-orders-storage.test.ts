import { expect, it } from "vitest";
import {
  readCustomerOrders,
  rememberCustomerOrder,
  forgetCustomerOrder,
} from "../src/lib/customer-orders";
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
it("referências são limitadas, expiram e não misturam o estado de duas abas", () => {
  const a = storage(),
    b = storage();
  for (let index = 0; index < 25; index++)
    rememberCustomerOrder(a, index.toString(16).padStart(64, "0"));
  expect(readCustomerOrders(a)).toHaveLength(20);
  expect(readCustomerOrders(b)).toEqual([]);
  expect(readCustomerOrders(a, Date.now() + 31 * 86400000)).toEqual([]);
  const token = "f".repeat(64);
  rememberCustomerOrder(a, token);
  rememberCustomerOrder(a, token);
  expect(
    readCustomerOrders(a).filter((item) => item.token === token),
  ).toHaveLength(1);
  forgetCustomerOrder(a, token);
  expect(readCustomerOrders(a).some((item) => item.token === token)).toBe(
    false,
  );
});
it("armazenamento adulterado não injeta URLs, contatos ou campos de escopo", () => {
  const a = storage(),
    token = "a".repeat(64);
  a.setItem(
    "doofi.customerOrders",
    JSON.stringify([
      { token: "javascript:alert(1)", savedAt: Date.now() },
      { token, savedAt: Date.now(), email: "private", store_id: "store-b" },
      { token: "b".repeat(64), savedAt: Date.now() + 3600000 },
    ]),
  );
  expect(readCustomerOrders(a)).toEqual([
    { token, savedAt: expect.any(Number) },
  ]);
  rememberCustomerOrder(a, token);
  expect(a.getItem("doofi.customerOrders")).not.toContain("private");
  a.setItem("doofi.customerOrders", "invalid");
  expect(readCustomerOrders(a)).toEqual([]);
});
