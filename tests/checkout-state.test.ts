import { expect, it } from "vitest";
import {
  clearDraft,
  draftKey,
  draftLifetime,
  parseDraft,
  readDraft,
  readReceipt,
  writeDraft,
  type CheckoutDraft,
  type TabStorage,
} from "../src/scripts/checkout-state";
class MemoryStorage implements TabStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
const time = 1800000000000;
function draft(slug = "loja-a"): CheckoutDraft {
  return {
    slug,
    savedAt: time,
    deliveryFee: 600,
    lines: [{ productId: "a-pao", title: "Pão", price: 2400, quantity: 1 }],
    payload: {
      intent: "a".repeat(64),
      items: [{ productId: "a-pao", quantity: 1 }],
      fulfillment: "PICKUP",
      payment: "PIX_SIMULATED",
      name: "Pessoa fictícia",
      phone: "00000000",
      email: "pessoa@exemplo.invalid",
      note: "",
      consent: true,
      syntheticData: true,
    },
  };
}
it("recupera o corpo original e os preços visíveis sem depender de um carrinho alterado", () => {
  const store = new MemoryStorage(),
    original = draft();
  writeDraft(store, original);
  const recovered = readDraft(store, "loja-a", time + 1000);
  expect(recovered).toEqual(original);
  expect(recovered?.payload.items).toEqual([
    { productId: "a-pao", quantity: 1 },
  ]);
});
it("rascunho expirado é descartado sem apagar os dados de outra empresa", () => {
  const store = new MemoryStorage();
  writeDraft(store, draft());
  writeDraft(store, {
    ...draft("loja-b"),
    savedAt: time + draftLifetime - 1000,
  });
  expect(readDraft(store, "loja-a", time + draftLifetime)).toBeNull();
  expect(store.getItem(`${draftKey("loja-a")}.payload`)).toBeNull();
  expect(readDraft(store, "loja-b", time + draftLifetime)?.slug).toBe("loja-b");
});
it("rascunhos malformados, de outra loja, futuros ou sem prazo conhecido não são reutilizados", () => {
  for (const value of [
    "{",
    JSON.stringify({ ...draft(), slug: "loja-b" }),
    JSON.stringify({ ...draft(), savedAt: time + 120000 }),
    JSON.stringify(draft().payload),
    JSON.stringify({ ...draft(), savedAt: null }),
    JSON.stringify({ ...draft(), lines: [] }),
  ])
    expect(parseDraft(value, "loja-a", time)).toBeNull();
});
it("campos de conta, chaves de outra empresa e prototype pollution são removidos do estado", () => {
  const original = draft();
  const payload = {
    ...original.payload,
    ...JSON.parse(
      '{"__proto__":{"polluted":true},"customer_id":"foreign","password":"secret","role":"owner","store_id":"loja-b"}',
    ),
    address: "Endereço que não é necessário na retirada",
  };
  const recovered = parseDraft(
    JSON.stringify({ ...original, payload }),
    "loja-a",
    time,
  )!;
  expect(recovered.payload).toEqual(original.payload);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});
it("falhas de tipo e itens inconsistentes não restauram dados pessoais na tela", () => {
  const original = draft();
  for (const payload of [
    { ...original.payload, name: [] },
    { ...original.payload, items: [{ productId: "a-pao", quantity: 0 }] },
    {
      ...original.payload,
      items: [...original.payload.items, ...original.payload.items],
    },
    { ...original.payload, fulfillment: "OTHER" },
    {
      ...original.payload,
      fulfillment: ["FIXED"],
      address: "Rua fictícia, 10",
      neighborhood: "Centro",
      postalCode: "00000000",
    },
    { ...original.payload, payment: ["PIX_SIMULATED"] },
    { ...original.payload, intent: "bad" },
  ])
    expect(
      parseDraft(JSON.stringify({ ...original, payload }), "loja-a", time),
    ).toBeNull();
});
it("confirmação conserva somente uma referência de acompanhamento com prazo e escopo", () => {
  const store = new MemoryStorage();
  store.setItem(
    "doofi.lastOrder.loja-a",
    JSON.stringify({
      slug: "loja-a",
      token: "b".repeat(64),
      protocol: "DF-EXEMPLO",
      savedAt: time,
      name: "não deve sair",
    }),
  );
  expect(readReceipt(store, "loja-a", time)).toEqual({
    token: "b".repeat(64),
    protocol: "DF-EXEMPLO",
  });
  expect(readReceipt(store, "loja-b", time)).toBeNull();
  expect(readReceipt(store, "loja-a", time + draftLifetime)).toBeNull();
  expect(store.getItem("doofi.lastOrder.loja-a")).toBeNull();
});
it("limpeza do rascunho elimina o corpo com contatos, preservando o link já recebido", () => {
  const store = new MemoryStorage();
  writeDraft(store, draft());
  store.setItem("doofi.lastOrder.loja-a", "receipt");
  clearDraft(store, "loja-a");
  expect([...store.values.values()]).toEqual(["receipt"]);
});
