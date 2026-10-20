import { AppError, audit, integer, textField } from "./core";
import type { Product, Session, Store } from "./types";

export async function getStore(db: D1Database, slug: string) {
  const store = await db
    .prepare("SELECT * FROM stores WHERE slug=? AND active=1")
    .bind(slug)
    .first<Store>();
  if (!store) throw new AppError(404, "Loja não encontrada.");
  return store;
}
export async function getProducts(db: D1Database, storeId: string) {
  return (
    await db
      .prepare(
        "SELECT * FROM products WHERE store_id=? ORDER BY category,title",
      )
      .bind(storeId)
      .all<Product>()
  ).results;
}
export async function saveProduct(
  db: D1Database,
  session: Session,
  input: Record<string, unknown>,
  id?: string,
) {
  const title = textField(input.title, "Nome", 2, 80);
  const description = textField(input.description, "Descrição", 2, 300);
  const category = textField(input.category, "Categoria", 2, 60);
  const price = integer(input.price, "Preço em centavos", 1);
  if (typeof input.available !== "boolean")
    throw new AppError(422, "Informe a disponibilidade.");
  const image =
    typeof input.image === "string" &&
    ["bread", "croissant", "coffee", "bowl", "salad", "juice"].includes(
      input.image,
    )
      ? input.image
      : "bread";
  const productId = id ?? crypto.randomUUID();
  if (id) {
    const version = integer(input.version, "Versão");
    const product = await db
      .prepare("SELECT id FROM products WHERE id=? AND store_id=?")
      .bind(id, session.store_id)
      .first();
    if (!product) {
      await audit(
        db,
        session.store_id,
        session.user_id,
        "ACCESS_DENIED",
        "product",
      ).run();
      throw new AppError(404, "Produto não encontrado.");
    }
    const r = await db.batch([
      db
        .prepare(
          "UPDATE products SET title=?,description=?,category=?,price=?,available=?,image=?,version=version+1 WHERE id=? AND store_id=? AND version=?",
        )
        .bind(
          title,
          description,
          category,
          price,
          Number(input.available),
          image,
          id,
          session.store_id,
          version,
        ),
      conditionalAudit(db, session, "PRODUCT_UPDATED", id, {
        price,
        available: input.available,
      }),
    ]);
    if (!r[0].meta.changes)
      throw new AppError(
        409,
        "O produto foi alterado. Atualize a página antes de salvar.",
      );
  } else {
    const count = await db
      .prepare("SELECT COUNT(*) AS n FROM products WHERE store_id=?")
      .bind(session.store_id)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 50)
      throw new AppError(
        422,
        "Limite de 50 produtos por loja nesta demonstração.",
      );
    await db.batch([
      db
        .prepare(
          "INSERT INTO products (id,store_id,title,description,category,price,available,image) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(
          productId,
          session.store_id,
          title,
          description,
          category,
          price,
          Number(input.available),
          image,
        ),
      audit(
        db,
        session.store_id,
        session.user_id,
        "PRODUCT_CREATED",
        productId,
        { price },
      ),
    ]);
  }
  return { id: productId };
}
export function conditionalAudit(
  db: D1Database,
  session: Pick<Session, "store_id" | "user_id">,
  action: string,
  entity: string,
  metadata: object = {},
) {
  return db
    .prepare(
      "INSERT INTO audit_events (id,store_id,actor_id,action,entity_id,metadata,correlation_id,created_at) SELECT ?,?,?,?,?,?,?,unixepoch() WHERE changes()>0",
    )
    .bind(
      crypto.randomUUID(),
      session.store_id,
      session.user_id,
      action,
      entity,
      JSON.stringify(metadata),
      crypto.randomUUID(),
    );
}
export async function saveStore(
  db: D1Database,
  session: Session,
  input: Record<string, unknown>,
) {
  if (session.role !== "owner")
    throw new AppError(403, "Somente o proprietário pode configurar a loja.");
  const title = textField(input.title, "Nome da loja", 2, 80);
  const description = textField(input.description, "Descrição", 2, 300);
  const contact = textField(input.contact, "Contato fictício", 4, 80);
  const hours = textField(input.hours, "Horários", 3, 120);
  const pickup = textField(input.pickup_address, "Endereço fictício", 4, 160);
  const neighborhoods = textField(input.neighborhoods, "Bairros", 2, 300);
  const fee = integer(input.delivery_fee, "Frete em centavos");
  const version = integer(input.version, "Versão");
  if (typeof input.is_open !== "boolean")
    throw new AppError(422, "Informe se a loja recebe pedidos.");
  const result = await db.batch([
    db
      .prepare(
        "UPDATE stores SET title=?,description=?,contact=?,hours=?,pickup_address=?,neighborhoods=?,delivery_fee=?,is_open=?,version=version+1 WHERE id=? AND version=?",
      )
      .bind(
        title,
        description,
        contact,
        hours,
        pickup,
        neighborhoods,
        fee,
        Number(input.is_open),
        session.store_id,
        version,
      ),
    conditionalAudit(db, session, "STORE_UPDATED", session.store_id, {
      delivery_fee: fee,
      is_open: input.is_open,
    }),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(409, "Configuração alterada. Atualize a página.");
  return { saved: true };
}
