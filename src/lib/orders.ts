import {
  AppError,
  audit,
  conditionalAudit,
  hash,
  hmac,
  integer,
  now,
  object,
  randomToken,
  same,
  textField,
  versionField,
} from "./core";
import { getStore, getProducts } from "./catalog";
import type {
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  Quote,
  Session,
  Store,
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
  if (normalized.fulfillment === "FIXED" && !store.has_own_delivery)
    throw new AppError(
      422,
      "Esta loja não oferece entrega com taxa fixa. Escolha retirada ou frete a combinar.",
    );
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
  const products = await getProducts(
    db,
    store.id,
    normalized.items.map((item) => item.productId),
  );
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );
  const items = normalized.items.map((cartItem) => {
    const product = productsById.get(cartItem.productId);
    if (!product?.orderable)
      throw new AppError(
        422,
        "Um produto está indisponível ou pertence a outra loja. Revise o carrinho.",
      );
    return {
      ...cartItem,
      price: product.price,
      title: product.is_combo
        ? `${product.title} (${product.components.map((component) => component.title).join(" + ")})`
        : product.title,
    };
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
  const snapshotProducts = new Map(
    products.flatMap((product) => [
      [product.id, product.version] as const,
      ...product.components.map(
        (component) => [component.id, component.version] as const,
      ),
    ]),
  );
  // Verify the snapshots inside the same transaction that creates the order.
  try {
    const writes = await db.batch([
      db
        .prepare(
          `INSERT INTO orders (id,store_id,protocol,public_token_hash,token_expires_at,intent_hash,request_hash,status,fulfillment,subtotal,delivery_fee,total,customer_name,customer_contact,address,neighborhood,postal_code,note,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
        WHERE EXISTS(SELECT 1 FROM stores WHERE id=? AND version=? AND active=1 AND is_open=1)
          AND EXISTS(SELECT 1 FROM checkout_intents WHERE key_hash=? AND store_id=? AND expires_at>unixepoch())
          AND NOT EXISTS(
            SELECT 1 FROM json_each(?) snapshot
            LEFT JOIN products product ON product.id=json_extract(snapshot.value,'$[0]') AND product.store_id=?
            WHERE product.id IS NULL OR product.version<>json_extract(snapshot.value,'$[1]') OR product.available<>1
          )`,
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
          store.id,
          store.version,
          intentHash,
          store.id,
          JSON.stringify([...snapshotProducts]),
          store.id,
        ),
      conditionalAudit(
        db,
        { store_id: store.id, user_id: "guest" },
        "ORDER_CREATED",
        id,
        { status, subtotal, fulfillment: normalized.fulfillment },
        crypto.randomUUID(),
        correlationId,
      ),
      ...items.map((i) =>
        db
          .prepare(
            "INSERT INTO order_items SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=?)",
          )
          .bind(
            crypto.randomUUID(),
            id,
            store.id,
            i.productId,
            i.title,
            i.price,
            i.quantity,
            id,
          ),
      ),
      db
        .prepare(
          "INSERT INTO payment_records (order_id,store_id,method,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=?)",
        )
        .bind(id, store.id, normalized.payment, timestamp, id),
    ]);
    if (!writes[0].meta.changes) {
      const concurrentReplay = await replay();
      if (concurrentReplay) return concurrentReplay;
      throw new AppError(
        409,
        "A loja, o catálogo ou o checkout mudou durante o envio. Revise o carrinho e tente novamente.",
        "CATALOG_CHANGED",
      );
    }
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
    if (error instanceof AppError) throw error;
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
  const [items, quotes, payments] = await db.batch([
    db
      .prepare(
        "SELECT product_id,title,price,quantity FROM order_items WHERE order_id=? AND store_id=?",
      )
      .bind(order.id, order.store_id),
    db
      .prepare(
        "SELECT * FROM delivery_quotes WHERE order_id=? AND store_id=? AND version=?",
      )
      .bind(order.id, order.store_id, order.quote_version),
    db
      .prepare(
        "SELECT method,status FROM payment_records WHERE order_id=? AND store_id=?",
      )
      .bind(order.id, order.store_id),
  ]);
  return {
    items: items.results as OrderItem[],
    quote: (quotes.results[0] as Quote | undefined) ?? null,
    payment: payments.results[0] as Payment,
  };
}
async function paymentForOrder(db: D1Database, order: Order) {
  const payment = await db
    .prepare(
      "SELECT method,status FROM payment_records WHERE order_id=? AND store_id=?",
    )
    .bind(order.id, order.store_id)
    .first<Payment>();
  if (!payment)
    throw new AppError(
      500,
      "Registro de pagamento indisponível.",
      "PAYMENT_MISSING",
    );
  return payment;
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
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new AppError(404, "Pedido não encontrado ou link expirado.");
  const tokenHash = await hash(token);
  const timestamp = now();
  const visibleOrder =
    "o.public_token_hash=? AND o.token_revoked=0 AND o.token_expires_at>?";
  // A single transactional snapshot prevents mixing old status with new payment/events.
  const [orders, items, quotes, payments, stores, auditRows, keys] =
    await db.batch([
      db
        .prepare(`SELECT o.* FROM orders o WHERE ${visibleOrder}`)
        .bind(tokenHash, timestamp),
      db
        .prepare(
          `SELECT i.product_id,i.title,i.price,i.quantity FROM order_items i
      JOIN orders o ON o.id=i.order_id AND o.store_id=i.store_id WHERE ${visibleOrder}`,
        )
        .bind(tokenHash, timestamp),
      db
        .prepare(
          `SELECT q.* FROM delivery_quotes q JOIN orders o
      ON o.id=q.order_id AND o.store_id=q.store_id AND o.quote_version=q.version WHERE ${visibleOrder}`,
        )
        .bind(tokenHash, timestamp),
      db
        .prepare(
          `SELECT p.method,p.status FROM payment_records p JOIN orders o
      ON o.id=p.order_id AND o.store_id=p.store_id WHERE ${visibleOrder}`,
        )
        .bind(tokenHash, timestamp),
      db
        .prepare(
          `SELECT s.title,s.slug,s.contact,s.pickup_address,s.palette,s.font,s.layout FROM stores s
      JOIN orders o ON o.store_id=s.id WHERE ${visibleOrder}`,
        )
        .bind(tokenHash, timestamp),
      db
        .prepare(
          `SELECT a.action,a.created_at,a.metadata FROM audit_events a
      JOIN orders o ON o.id=a.entity_id AND o.store_id=a.store_id WHERE ${visibleOrder}
      AND a.action IN ('ORDER_CREATED','ORDER_TRANSITION','QUOTE_PROPOSED','QUOTE_ACCEPTED','QUOTE_REJECTED','PAYMENT_DECLARED','PAYMENT_LATE','PAYMENT_SIMULATED_CONFIRMED')
      ORDER BY a.created_at DESC,a.rowid DESC LIMIT 100`,
        )
        .bind(tokenHash, timestamp),
      db.prepare("SELECT value FROM app_keys WHERE name='tracking_hmac'"),
    ]);
  const order = orders.results[0] as Order | undefined;
  if (!order)
    throw new AppError(404, "Pedido não encontrado ou link expirado.");
  const quote = quotes.results[0] as Quote | undefined;
  const events = (
    auditRows.results as {
      action: string;
      created_at: number;
      metadata: string;
    }[]
  )
    .reverse()
    .map((event) => ({
      action: event.action,
      created_at: event.created_at,
      status: JSON.parse(event.metadata).status,
    }));
  return {
    protocol: order.protocol,
    status: order.status,
    fulfillment: order.fulfillment,
    subtotal: order.subtotal,
    delivery_fee: order.delivery_fee,
    total: order.total,
    version: order.version,
    created_at: order.created_at,
    items: items.results as OrderItem[],
    payment: payments.results[0] as Payment,
    quote: quote
      ? {
          version: quote.version,
          fee: quote.fee,
          estimate: quote.estimate,
          expires_at: quote.expires_at,
          accepted_at: quote.accepted_at,
        }
      : null,
    store: stores.results[0] as Pick<
      Store,
      | "title"
      | "slug"
      | "contact"
      | "pickup_address"
      | "palette"
      | "font"
      | "layout"
    >,
    events,
    actionNonce: await hmac(
      (keys.results[0] as { value: string }).value,
      `customer-action:${token}`,
    ),
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
  const version = versionField(input.version);
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
  const version = versionField(input.version);
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
  const version = versionField(input.version);
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
          `UPDATE orders SET status=?,delivery_fee=?,total=?,version=version+1,updated_at=?
          WHERE id=? AND version=? AND token_revoked=0 AND token_expires_at>unixepoch()
            AND EXISTS(SELECT 1 FROM delivery_quotes WHERE order_id=orders.id AND store_id=orders.store_id AND version=orders.quote_version AND expires_at>unixepoch())`,
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
  const payment = await paymentForOrder(db, order);
  if (payment.method !== "PIX_SIMULATED")
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
  if (payment.status !== "SIMULATED_NOT_COLLECTED")
    throw new AppError(409, "A declaração já foi registrada.");
  const result = await db.batch([
    db
      .prepare(
        "UPDATE orders SET version=version+1,updated_at=? WHERE id=? AND version=? AND token_revoked=0 AND token_expires_at>unixepoch()",
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
  const version = versionField(input.version);
  const payment = await paymentForOrder(db, order);
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
    payment.status === "SIMULATED_SELLER_CONFIRMED"
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
