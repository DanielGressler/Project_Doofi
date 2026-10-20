import { AppError, audit, integer, textField } from "./core";
import type { Product, Session, Store } from "./types";
import { palettes, fonts, layouts } from "./appearance";

export async function getStore(db: D1Database, slug: string) {
  const store = await db
    .prepare("SELECT * FROM stores WHERE slug=? AND active=1")
    .bind(slug)
    .first<Store>();
  if (!store) throw new AppError(404, "Loja não encontrada.");
  return store;
}
export async function getProducts(db: D1Database, storeId: string) {
  const products = (
    await db
      .prepare(
        "SELECT * FROM products WHERE store_id=? ORDER BY category,title",
      )
      .bind(storeId)
      .all<Product>()
  ).results;
  const links = (
    await db
      .prepare(
        `SELECT c.combo_id,p.id,p.title,p.available FROM combo_items c
    JOIN products p ON p.id=c.product_id AND p.store_id=c.store_id WHERE c.store_id=? ORDER BY p.title`,
      )
      .bind(storeId)
      .all<{ combo_id: string; id: string; title: string; available: number }>()
  ).results;
  return products.map((p) => {
    const components = links
      .filter((c) => c.combo_id === p.id)
      .map(({ id, title, available }) => ({ id, title, available }));
    return {
      ...p,
      components,
      orderable: Number(
        !!p.available &&
          (!p.is_combo ||
            (components.length === 2 && components.every((c) => c.available))),
      ),
    };
  });
}
export async function saveProduct(
  db: D1Database,
  session: Session,
  input: Record<string, unknown>,
  id?: string,
) {
  const title = textField(input.title, "Nome", 2, 80);
  const description = textField(input.description, "Descrição", 2, 300);
  const categoryValue = textField(input.category, "Categoria", 2, 60);
  const category =
    [
      "Doces",
      "Bebidas",
      "Pratos principais",
      "Petiscos",
      "Lanches",
      "Combos",
    ].find(
      (c) =>
        c.toLocaleLowerCase("pt-BR") ===
        categoryValue.toLocaleLowerCase("pt-BR"),
    ) ?? categoryValue;
  const price = integer(input.price, "Preço em centavos", 1);
  const available =
    typeof input.unavailable === "boolean"
      ? !input.unavailable
      : input.available;
  if (typeof available !== "boolean")
    throw new AppError(422, "Informe a disponibilidade.");
  const image =
    typeof input.image === "string" &&
    ["bread", "croissant", "coffee", "bowl", "salad", "juice"].includes(
      input.image,
    )
      ? input.image
      : "bread";
  const productId = id ?? crypto.randomUUID();
  const current = id
    ? await db
        .prepare("SELECT * FROM products WHERE id=? AND store_id=?")
        .bind(id, session.store_id)
        .first<Product>()
    : null;
  if (id && !current) {
    await audit(
      db,
      session.store_id,
      session.user_id,
      "ACCESS_DENIED",
      "product",
    ).run();
    throw new AppError(404, "Produto não encontrado.");
  }
  if (input.is_combo !== undefined && typeof input.is_combo !== "boolean")
    throw new AppError(422, "Informe se é um combo.");
  const isCombo = current ? !!current.is_combo : input.is_combo === true;
  if (current && input.is_combo !== undefined && input.is_combo !== isCombo)
    throw new AppError(422, "O tipo do anúncio não pode ser alterado.");
  let componentIds: string[] = [];
  if (isCombo) {
    if (
      !Array.isArray(input.componentIds) ||
      input.componentIds.length !== 2 ||
      input.componentIds.some((x) => typeof x !== "string") ||
      input.componentIds[0] === input.componentIds[1]
    )
      throw new AppError(422, "Escolha dois produtos diferentes para o combo.");
    componentIds = input.componentIds as string[];
    for (const component of componentIds) {
      if (
        !(await db
          .prepare(
            "SELECT id FROM products WHERE id=? AND store_id=? AND is_combo=0",
          )
          .bind(component, session.store_id)
          .first())
      )
        throw new AppError(
          422,
          "O combo aceita somente produtos individuais desta loja.",
        );
    }
  }
  const imageId =
    input.image_id === undefined ? (current?.image_id ?? null) : input.image_id;
  await validateMedia(db, session.store_id, imageId, "product");
  const mutation = crypto.randomUUID();
  const componentsWrites = () => [
    db
      .prepare(
        "DELETE FROM combo_items WHERE combo_id=? AND store_id=? AND EXISTS(SELECT 1 FROM audit_events WHERE id=?)",
      )
      .bind(productId, session.store_id, mutation),
    ...componentIds.map((component) =>
      db
        .prepare(
          "INSERT INTO combo_items SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?)",
        )
        .bind(productId, session.store_id, component, mutation),
    ),
  ];
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
          "UPDATE products SET title=?,description=?,category=?,price=?,available=?,image=?,image_id=?,version=version+1 WHERE id=? AND store_id=? AND version=?",
        )
        .bind(
          title,
          description,
          category,
          price,
          Number(available),
          image,
          imageId,
          id,
          session.store_id,
          version,
        ),
      conditionalAudit(
        db,
        session,
        "PRODUCT_UPDATED",
        id,
        {
          price,
          available,
          componentIds,
        },
        mutation,
      ),
      ...componentsWrites(),
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
    const writes = await db.batch([
      db
        .prepare(
          "INSERT INTO products (id,store_id,title,description,category,price,available,image,image_id,is_combo) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM products WHERE store_id=?)<50",
        )
        .bind(
          productId,
          session.store_id,
          title,
          description,
          category,
          price,
          Number(available),
          image,
          imageId,
          Number(isCombo),
          session.store_id,
        ),
      conditionalAudit(
        db,
        session,
        "PRODUCT_CREATED",
        productId,
        { price, componentIds },
        mutation,
      ),
      ...componentsWrites(),
    ]);
    if (!writes[0].meta.changes)
      throw new AppError(422, "Limite de 50 anúncios por loja.");
  }
  return { id: productId };
}
export function conditionalAudit(
  db: D1Database,
  session: Pick<Session, "store_id" | "user_id">,
  action: string,
  entity: string,
  metadata: object = {},
  eventId = crypto.randomUUID(),
) {
  return db
    .prepare(
      "INSERT INTO audit_events (id,store_id,actor_id,action,entity_id,metadata,correlation_id,created_at) SELECT ?,?,?,?,?,?,?,unixepoch() WHERE changes()>0",
    )
    .bind(
      eventId,
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
  const current = (await db
    .prepare("SELECT * FROM stores WHERE id=?")
    .bind(session.store_id)
    .first<Store>())!;
  if (
    input.has_own_delivery !== undefined &&
    typeof input.has_own_delivery !== "boolean"
  )
    throw new AppError(422, "Informe se possui entregador próprio.");
  const ownDelivery =
    input.has_own_delivery === undefined
      ? !!current.has_own_delivery
      : input.has_own_delivery;
  const palette = input.palette ?? current.palette;
  const font = input.font ?? current.font;
  const layout = input.layout ?? current.layout;
  if (
    typeof palette !== "string" ||
    !Object.hasOwn(palettes, palette) ||
    typeof font !== "string" ||
    !Object.hasOwn(fonts, font) ||
    typeof layout !== "string" ||
    !Object.hasOwn(layouts, layout)
  )
    throw new AppError(
      422,
      "Escolha uma paleta, uma fonte e um layout disponíveis.",
    );
  const bannerId =
    input.banner_id === undefined ? current.banner_id : input.banner_id;
  await validateMedia(db, session.store_id, bannerId, "banner");
  if (typeof input.is_open !== "boolean")
    throw new AppError(422, "Informe se a loja recebe pedidos.");
  const result = await db.batch([
    db
      .prepare(
        "UPDATE stores SET title=?,description=?,contact=?,hours=?,pickup_address=?,neighborhoods=?,delivery_fee=?,is_open=?,has_own_delivery=?,palette=?,font=?,banner_id=?,layout=?,version=version+1 WHERE id=? AND version=?",
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
        Number(ownDelivery),
        palette,
        font,
        bannerId,
        layout,
        session.store_id,
        version,
      ),
    conditionalAudit(db, session, "STORE_UPDATED", session.store_id, {
      delivery_fee: fee,
      is_open: input.is_open,
      palette,
      font,
      layout,
    }),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(409, "Configuração alterada. Atualize a página.");
  return { saved: true };
}

export async function validateMedia(
  db: D1Database,
  storeId: string,
  id: unknown,
  kind: string,
) {
  if (id === null) return;
  if (
    typeof id !== "string" ||
    !(await db
      .prepare(
        "SELECT id FROM media_assets WHERE id=? AND store_id=? AND kind=?",
      )
      .bind(id, storeId, kind)
      .first())
  )
    throw new AppError(422, "Imagem inválida ou pertencente a outra loja.");
}
