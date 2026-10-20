import {
  AppError,
  audit,
  hash,
  hmac,
  integer,
  now,
  object,
  randomToken,
  same,
  textField,
} from "./core";
import { conditionalAudit, getStore } from "./catalog";
import type {
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  Product,
  Quote,
  Session,
} from "./types";

export async function issueIntent(db: D1Database, slug: string) {
  const store = await getStore(db, slug);
  const intent = randomToken();
  await db
    .prepare("INSERT INTO checkout_intents VALUES (?,?,?)")
    .bind(await hash(intent), store.id, now() + 3600)
    .run();
  return { intent };
}
async function key(db: D1Database) {
  return (await db
    .prepare("SELECT value FROM app_keys WHERE name='tracking_hmac'")
    .first<{ value: string }>())!.value;
}
async function trackingToken(db: D1Database, store: string, intent: string) {
  return hmac(await key(db), `tracking:${store}:${intent}`);
}
async function actionNonce(db: D1Database, token: string) {
  return hmac(await key(db), `customer-action:${token}`);
}

function normalize(input: Record<string, unknown>) {
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 20
  )
    throw new AppError(422, "Escolha entre 1 e 20 produtos.");
  const seen = new Set<string>();
  const items = input.items
    .map((item) => {
      const i = object(item);
      const productId = textField(i.productId, "Produto", 1, 80);
      if (seen.has(productId))
        throw new AppError(422, "Há produtos repetidos no carrinho.");
      seen.add(productId);
      return { productId, quantity: integer(i.quantity, "Quantidade", 1, 10) };
    })
    .sort((a, b) => a.productId.localeCompare(b.productId));
  if (!["PICKUP", "FIXED", "QUOTE"].includes(String(input.fulfillment)))
    throw new AppError(422, "Escolha a modalidade de entrega.");
  const fulfillment = input.fulfillment as Order["fulfillment"];
  if (
    !["PIX_SIMULATED", "ON_FULFILLMENT_SIMULATED"].includes(
      String(input.payment),
    )
  )
    throw new AppError(422, "Escolha uma forma de pagamento demonstrativa.");
  if (input.consent !== true || input.syntheticData !== true)
    throw new AppError(
      422,
      "Confirme o uso exclusivo de dados fictícios e as condições da demonstração.",
    );
  const name = textField(input.name, "Nome fictício", 2, 80);
  const contact = textField(input.contact, "Contato fictício", 4, 80);
  const note = textField(input.note ?? "", "Observação", 0, 300);
  const address =
    fulfillment === "PICKUP"
      ? null
      : textField(input.address, "Endereço fictício", 5, 160);
  const neighborhood =
    fulfillment === "PICKUP"
      ? null
      : textField(input.neighborhood, "Bairro", 2, 80);
  const postalCode =
    fulfillment === "PICKUP"
      ? null
      : textField(input.postalCode, "CEP fictício", 8, 9).replace(/-/g, "");
  if (postalCode !== null && !/^\d{8}$/.test(postalCode))
    throw new AppError(422, "Informe um CEP com 8 dígitos.");
  return {
    items,
    fulfillment,
    payment: input.payment as Payment["method"],
    name,
    contact,
    note,
    address,
    neighborhood,
    postalCode,
  };
}

export async function createOrder(
  db: D1Database,
  slug: string,
  input: Record<string, unknown>,
) {
  const intent = textField(input.intent, "Identificador do checkout", 64, 64);
  if (!/^[a-f0-9]{64}$/.test(intent))
    throw new AppError(422, "Checkout inválido. Reabra a loja.");
  const normalized = normalize(input);
  const store = await getStore(db, slug);
  const intentHash = await hash(intent);
  const requestHash = await hash(JSON.stringify(normalized));
  const token = await trackingToken(db, store.id, intent);
  const replay = async () => {
    const existing = await db
      .prepare(
        "SELECT id,protocol,status,request_hash FROM orders WHERE store_id=? AND intent_hash=?",
      )
      .bind(store.id, intentHash)
      .first<Pick<Order, "id" | "protocol" | "status" | "request_hash">>();
    if (!existing) return null;
    if (!same(existing.request_hash, requestHash))
      throw new AppError(
        409,
        "Este envio já foi usado com outros dados. Inicie um novo pedido.",
        "IDEMPOTENCY_CONFLICT",
      );
    return {
      id: existing.id,
      protocol: existing.protocol,
      status: existing.status,
      token,
      replayed: true,
    };
  };
  const existing = await replay();
  if (existing) return existing;
  if (!store.is_open)
    throw new AppError(422, "A loja está fechada para novos pedidos.");
  const issued = await db
    .prepare(
      "SELECT key_hash FROM checkout_intents WHERE key_hash=? AND store_id=? AND expires_at>?",
    )
    .bind(intentHash, store.id, now())
    .first();
  if (!issued)
    throw new AppError(
      422,
      "Checkout expirado. Atualize a página para tentar novamente.",
      "INTENT_EXPIRED",
    );
  if (
    normalized.neighborhood &&
    !store.neighborhoods
      .split(",")
      .map((x) => x.trim().toLocaleLowerCase("pt-BR"))
      .includes(normalized.neighborhood.toLocaleLowerCase("pt-BR"))
  )
    throw new AppError(
      422,
      "Este bairro não é atendido pela loja. Escolha retirada ou um bairro disponível.",
    );
  const products = (
    await db
      .prepare("SELECT * FROM products WHERE store_id=? AND available=1")
      .bind(store.id)
      .all<Product>()
  ).results;
  const items = normalized.items.map((i) => {
    const p = products.find((p) => p.id === i.productId);
    if (!p)
      throw new AppError(
        422,
        "Um produto está indisponível ou pertence a outra loja. Revise o carrinho.",
      );
    return { ...i, price: p.price, title: p.title };
  });
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  if (subtotal > 1000000)
    throw new AppError(422, "O valor excede o limite da demonstração.");
  const fee =
    normalized.fulfillment === "QUOTE"
      ? null
      : normalized.fulfillment === "PICKUP"
        ? 0
        : store.delivery_fee;
  const total = fee === null ? null : subtotal + fee;
  const status: OrderStatus =
    normalized.fulfillment === "QUOTE" ? "QUOTE_PENDING" : "PENDING";
  const id = crypto.randomUUID();
  const protocol = "DF-" + id.replace(/-/g, "").slice(0, 10).toUpperCase();
  const timestamp = now();
  const correlationId = crypto.randomUUID();
  try {
    const writes = await db.batch([
      db
        .prepare(
          `INSERT INTO orders (id,store_id,protocol,public_token_hash,token_expires_at,intent_hash,request_hash,status,fulfillment,subtotal,delivery_fee,total,customer_name,customer_contact,address,neighborhood,postal_code,note,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          id,
          store.id,
          protocol,
          await hash(token),
          timestamp + 2592000,
          intentHash,
          requestHash,
          status,
          normalized.fulfillment,
          subtotal,
          fee,
          total,
          normalized.name,
          normalized.contact,
          normalized.address,
          normalized.neighborhood,
          normalized.postalCode,
          normalized.note,
          timestamp,
          timestamp,
        ),
      ...items.map((i) =>
        db
          .prepare("INSERT INTO order_items VALUES (?,?,?,?,?,?,?)")
          .bind(
            crypto.randomUUID(),
            id,
            store.id,
            i.productId,
            i.title,
            i.price,
            i.quantity,
          ),
      ),
      db
        .prepare(
          "INSERT INTO payment_records (order_id,store_id,method,updated_at) VALUES (?,?,?,?)",
        )
        .bind(id, store.id, normalized.payment, timestamp),
      audit(
        db,
        store.id,
        "guest",
        "ORDER_CREATED",
        id,
        { status, subtotal, fulfillment: normalized.fulfillment },
        correlationId,
      ),
    ]);
    console.info(
      JSON.stringify({
        event: "ORDER_CREATED_SYNTHETIC",
        correlationId,
        rowsRead: writes.reduce((s, r) => s + (r.meta.rows_read ?? 0), 0),
        rowsWritten: writes.reduce((s, r) => s + (r.meta.rows_written ?? 0), 0),
        durationMs: writes.reduce((s, r) => s + (r.meta.duration ?? 0), 0),
      }),
    );
  } catch (error) {
    // The unique constraint, rather than the preceding read, arbitrates concurrent retries.
    const result = await replay();
    if (result) return result;
    throw error;
  }
  return { id, protocol, status, token, replayed: false };
}

export async function ownedOrder(db: D1Database, session: Session, id: string) {
  const order = await db
    .prepare("SELECT * FROM orders WHERE id=? AND store_id=?")
    .bind(id, session.store_id)
    .first<Order>();
  if (!order) {
    await audit(
      db,
      session.store_id,
      session.user_id,
      "ACCESS_DENIED",
      "order",
    ).run();
    throw new AppError(404, "Pedido não encontrado.");
  }
  return order;
}
export async function orderDetails(db: D1Database, order: Order) {
  const [items, quote, payment] = await Promise.all([
    db
      .prepare(
        "SELECT product_id,title,price,quantity FROM order_items WHERE order_id=? AND store_id=?",
      )
      .bind(order.id, order.store_id)
      .all<OrderItem>(),
    db
      .prepare(
        "SELECT * FROM delivery_quotes WHERE order_id=? AND store_id=? AND version=?",
      )
      .bind(order.id, order.store_id, order.quote_version)
      .first<Quote>(),
    db
      .prepare(
        "SELECT method,status FROM payment_records WHERE order_id=? AND store_id=?",
      )
      .bind(order.id, order.store_id)
      .first<Payment>(),
  ]);
  return { items: items.results, quote, payment: payment! };
}
export async function publicOrder(db: D1Database, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new AppError(404, "Pedido não encontrado ou link expirado.");
  const order = await db
    .prepare(
      "SELECT * FROM orders WHERE public_token_hash=? AND token_revoked=0 AND token_expires_at>?",
    )
    .bind(await hash(token), now())
    .first<Order>();
  if (!order)
    throw new AppError(404, "Pedido não encontrado ou link expirado.");
  return order;
}
export async function publicStatus(db: D1Database, token: string) {
  const order = await publicOrder(db, token);
  const detail = await orderDetails(db, order);
  const store = await db
    .prepare("SELECT title,slug,contact,pickup_address FROM stores WHERE id=?")
    .bind(order.store_id)
    .first();
  const events = (
    await db
      .prepare(
        "SELECT action,created_at,metadata FROM audit_events WHERE entity_id=? AND store_id=? AND action IN ('ORDER_CREATED','ORDER_TRANSITION','QUOTE_PROPOSED','QUOTE_ACCEPTED','QUOTE_REJECTED','PAYMENT_DECLARED','PAYMENT_LATE','PAYMENT_SIMULATED_CONFIRMED') ORDER BY created_at,rowid",
      )
      .bind(order.id, order.store_id)
      .all<{ action: string; created_at: number; metadata: string }>()
  ).results.map((e) => ({
    action: e.action,
    created_at: e.created_at,
    status: JSON.parse(e.metadata).status,
  }));
  const { quote } = detail;
  const safeQuote = quote
    ? {
        version: quote.version,
        fee: quote.fee,
        estimate: quote.estimate,
        expires_at: quote.expires_at,
        accepted_at: quote.accepted_at,
      }
    : null;
  return {
    protocol: order.protocol,
    status: order.status,
    fulfillment: order.fulfillment,
    subtotal: order.subtotal,
    delivery_fee: order.delivery_fee,
    total: order.total,
    version: order.version,
    created_at: order.created_at,
    items: detail.items,
    payment: detail.payment,
    quote: safeQuote,
    store,
    events,
    actionNonce: await actionNonce(db, token),
  };
}
export const transitions: Record<string, OrderStatus[]> = {
  PENDING: ["ACCEPTED", "REJECTED"],
  QUOTE_PENDING: ["REJECTED"],
  QUOTE_PROPOSED: ["REJECTED"],
  QUOTE_ACCEPTED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "OUT_FOR_DELIVERY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["COMPLETED", "CANCELLED"],
};
export async function transition(
  db: D1Database,
  session: Session,
  id: string,
  input: Record<string, unknown>,
) {
  const order = await ownedOrder(db, session, id);
  const version = integer(input.version, "Versão");
  const target = textField(input.status, "Status", 2, 32) as OrderStatus;
  if (order.version !== version)
    throw new AppError(409, "O pedido foi atualizado. Recarregue os dados.");
  if (
    !transitions[order.status]?.includes(target) ||
    (target === "READY" && order.fulfillment !== "PICKUP") ||
    (target === "OUT_FOR_DELIVERY" && order.fulfillment === "PICKUP")
  )
    throw new AppError(409, "Esta mudança de status não é permitida.");
  if (target === "ACCEPTED" && order.total === null)
    throw new AppError(
      409,
      "O comprador precisa aceitar o frete antes do pedido.",
    );
  const reason = textField(
    input.reason ?? "",
    "Motivo",
    ["REJECTED", "CANCELLED"].includes(target) ? 3 : 0,
    160,
  );
  const result = await db.batch([
    db
      .prepare(
        "UPDATE orders SET status=?,version=version+1,updated_at=? WHERE id=? AND store_id=? AND version=?",
      )
      .bind(target, now(), id, session.store_id, version),
    conditionalAudit(db, session, "ORDER_TRANSITION", id, {
      status: target,
      reason,
    }),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(409, "O pedido foi atualizado. Recarregue os dados.");
  return { status: target };
}
export async function proposeQuote(
  db: D1Database,
  session: Session,
  id: string,
  input: Record<string, unknown>,
) {
  const order = await ownedOrder(db, session, id);
  const version = integer(input.version, "Versão");
  if (
    version !== order.version ||
    order.fulfillment !== "QUOTE" ||
    !["QUOTE_PENDING", "QUOTE_PROPOSED"].includes(order.status)
  )
    throw new AppError(
      409,
      "Este pedido não aceita uma nova proposta de frete.",
    );
  const fee = integer(input.fee, "Frete em centavos");
  const estimate = textField(input.estimate, "Prazo", 3, 100);
  const validMinutes = integer(
    input.validMinutes,
    "Validade em minutos",
    1,
    1440,
  );
  const expires = now() + validMinutes * 60;
  const nextQuote = order.quote_version + 1;
  const result = await db.batch([
    db
      .prepare(
        "UPDATE orders SET status='QUOTE_PROPOSED',quote_version=quote_version+1,version=version+1,updated_at=? WHERE id=? AND store_id=? AND version=?",
      )
      .bind(now(), id, session.store_id, version),
    db
      .prepare(
        "INSERT INTO delivery_quotes (id,order_id,store_id,version,fee,estimate,expires_at) SELECT ?,?,?,?,?,?,? WHERE changes()>0",
      )
      .bind(
        crypto.randomUUID(),
        id,
        session.store_id,
        nextQuote,
        fee,
        estimate,
        expires,
      ),
    conditionalAudit(db, session, "QUOTE_PROPOSED", id, {
      status: "QUOTE_PROPOSED",
      fee,
      estimate,
      expires_at: expires,
      quoteVersion: nextQuote,
    }),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(409, "O pedido foi atualizado. Recarregue os dados.");
  return { proposed: true };
}
export async function customerAction(
  db: D1Database,
  token: string,
  action: string,
  input: Record<string, unknown>,
) {
  const order = await publicOrder(db, token);
  if (
    !same(
      typeof input.nonce === "string" ? input.nonce : "",
      await actionNonce(db, token),
    )
  )
    throw new AppError(
      403,
      "Solicitação inválida. Atualize a página do pedido.",
    );
  const version = integer(input.version, "Versão");
  if (order.version !== version)
    throw new AppError(
      409,
      "O pedido foi atualizado. Atualize antes de continuar.",
    );
  const guest = { store_id: order.store_id, user_id: "guest" };
  if (["accept-quote", "reject-quote"].includes(action)) {
    const quote = await db
      .prepare(
        "SELECT * FROM delivery_quotes WHERE order_id=? AND store_id=? AND version=?",
      )
      .bind(order.id, order.store_id, order.quote_version)
      .first<Quote>();
    if (
      order.status !== "QUOTE_PROPOSED" ||
      !quote ||
      quote.expires_at <= now() ||
      input.quoteVersion !== quote.version
    )
      throw new AppError(
        409,
        "Esta proposta expirou ou foi substituída. Peça uma nova cotação à loja.",
      );
    const accept = action === "accept-quote";
    const status = accept ? "QUOTE_ACCEPTED" : "CANCELLED";
    const result = await db.batch([
      db
        .prepare(
          "UPDATE orders SET status=?,delivery_fee=?,total=?,version=version+1,updated_at=? WHERE id=? AND version=?",
        )
        .bind(
          status,
          accept ? quote.fee : null,
          accept ? order.subtotal + quote.fee : null,
          now(),
          order.id,
          version,
        ),
      conditionalAudit(
        db,
        guest,
        accept ? "QUOTE_ACCEPTED" : "QUOTE_REJECTED",
        order.id,
        { status, quoteVersion: quote.version },
      ),
      db
        .prepare(
          "UPDATE delivery_quotes SET accepted_at=? WHERE order_id=? AND version=? AND changes()>0",
        )
        .bind(accept ? now() : null, order.id, quote.version),
    ]);
    if (!result[0].meta.changes)
      throw new AppError(409, "Pedido atualizado. Recarregue os dados.");
    return { status };
  }
  if (action !== "declare-payment")
    throw new AppError(404, "Ação não encontrada.");
  const detail = await orderDetails(db, order);
  if (detail.payment.method !== "PIX_SIMULATED")
    throw new AppError(
      409,
      "Este pedido usa pagamento simulado na retirada ou entrega.",
    );
  const late = ["CANCELLED", "REJECTED"].includes(order.status);
  if (
    !late &&
    (![
      "ACCEPTED",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
      "COMPLETED",
    ].includes(order.status) ||
      order.total === null)
  )
    throw new AppError(
      409,
      "A simulação aguarda total definido e aceite do lojista.",
    );
  if (detail.payment.status !== "SIMULATED_NOT_COLLECTED")
    throw new AppError(409, "A declaração já foi registrada.");
  const result = await db.batch([
    db
      .prepare(
        "UPDATE orders SET version=version+1,updated_at=? WHERE id=? AND version=?",
      )
      .bind(now(), order.id, version),
    db
      .prepare(
        "UPDATE payment_records SET status=?,updated_at=? WHERE order_id=? AND store_id=? AND status='SIMULATED_NOT_COLLECTED' AND changes()>0",
      )
      .bind(
        late ? "SIMULATED_LATE_DECLARATION" : "SIMULATED_CUSTOMER_DECLARED",
        now(),
        order.id,
        order.store_id,
      ),
    conditionalAudit(
      db,
      guest,
      late ? "PAYMENT_LATE" : "PAYMENT_DECLARED",
      order.id,
      { simulated: true },
    ),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(409, "Pedido atualizado. Recarregue os dados.");
  return { simulated: true, late };
}
export async function confirmSimulatedPayment(
  db: D1Database,
  session: Session,
  id: string,
  input: Record<string, unknown>,
) {
  const order = await ownedOrder(db, session, id);
  const version = integer(input.version, "Versão");
  const detail = await orderDetails(db, order);
  if (
    version !== order.version ||
    order.total === null ||
    [
      "PENDING",
      "QUOTE_PENDING",
      "QUOTE_PROPOSED",
      "QUOTE_ACCEPTED",
      "REJECTED",
      "CANCELLED",
    ].includes(order.status) ||
    detail.payment.status === "SIMULATED_SELLER_CONFIRMED"
  )
    throw new AppError(
      409,
      "Este pagamento não pode ser confirmado na simulação.",
    );
  const result = await db.batch([
    db
      .prepare(
        "UPDATE orders SET version=version+1,updated_at=? WHERE id=? AND store_id=? AND version=?",
      )
      .bind(now(), id, session.store_id, version),
    db
      .prepare(
        "UPDATE payment_records SET status='SIMULATED_SELLER_CONFIRMED',updated_at=? WHERE order_id=? AND store_id=? AND changes()>0",
      )
      .bind(now(), id, session.store_id),
    conditionalAudit(db, session, "PAYMENT_SIMULATED_CONFIRMED", id, {
      simulated: true,
    }),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(409, "Pedido atualizado. Recarregue os dados.");
  return { simulated: true };
}
