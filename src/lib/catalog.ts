import { syntheticError } from "./synthetic-data";
import {
  AppError,
  audit,
  conditionalAudit,
  integer,
  textField,
  versionField,
} from "./core";
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
export async function getProducts(
  db: D1Database,
  storeId: string,
  productIds?: string[],
) {
  if (productIds?.length === 0) return [];
  const selection = productIds
    ? ` AND id IN (${productIds.map(() => "?").join(",")})`
    : "";
  const componentSelection = productIds
    ? ` AND c.combo_id IN (${productIds.map(() => "?").join(",")})`
    : "";
  // One D1 transaction: products and combo composition belong to the same snapshot.
  const [productRows, componentRows] = await db.batch([
    db
      .prepare(
        `SELECT * FROM products WHERE store_id=?${selection} ORDER BY category,title`,
      )
      .bind(storeId, ...(productIds ?? [])),
    db
      .prepare(
        `SELECT c.combo_id,p.id,p.title,p.available,p.version FROM combo_items c
    JOIN products p ON p.id=c.product_id AND p.store_id=c.store_id WHERE c.store_id=?${componentSelection} ORDER BY p.title`,
      )
      .bind(storeId, ...(productIds ?? [])),
  ]);
  const componentsByCombo = new Map<string, Product["components"]>();
  for (const row of componentRows.results as (Product["components"][number] & {
    combo_id: string;
  })[]) {
    const components = componentsByCombo.get(row.combo_id) ?? [];
    components.push({
      id: row.id,
      title: row.title,
      available: row.available,
      version: row.version,
    });
    componentsByCombo.set(row.combo_id, components);
  }
  return (productRows.results as Product[]).map((product) => {
    const components = componentsByCombo.get(product.id) ?? [];
    return {
      ...product,
      components,
      orderable: Number(
        !!product.available &&
          (!product.is_combo ||
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
  if (
    (input.unavailable !== undefined &&
      typeof input.unavailable !== "boolean") ||
    (input.available !== undefined && typeof input.available !== "boolean") ||
    (typeof input.available === "boolean" &&
      typeof input.unavailable === "boolean" &&
      input.available === input.unavailable)
  )
    throw new AppError(
      422,
      "Informe uma disponibilidade consistente para o produto.",
    );
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
    const components = await db
      .prepare(
        "SELECT id FROM products WHERE id IN (?,?) AND store_id=? AND is_combo=0",
      )
      .bind(...componentIds, session.store_id)
      .all();
    if (components.results.length !== 2)
      throw new AppError(
        422,
        "O combo aceita somente produtos individuais desta loja.",
      );
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
    const version = versionField(input.version);
    const writes = await db.batch([
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
    if (!writes[0].meta.changes)
      throw new AppError(
        409,
        "O produto foi alterado. Atualize a página antes de salvar.",
      );
  } else {
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
  const contactError = syntheticError("contact", contact);
  if (contactError)
    throw new AppError(422, contactError, "SYNTHETIC_DATA_REQUIRED");
  const hours = textField(input.hours, "Horários", 3, 120);
  const pickup = textField(input.pickup_address, "Endereço fictício", 4, 160);
  const neighborhoods = textField(input.neighborhoods, "Bairros", 2, 300);
  const fee = integer(input.delivery_fee, "Frete em centavos");
  const version = versionField(input.version);
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
  const preset = input.banner_preset ?? current.theme;
  if (
    typeof preset !== "string" ||
    !["bakery", "terracotta", "green", "sweets"].includes(preset)
  )
    throw new AppError(422, "Escolha um banner ilustrado disponível.");
  const bannerId =
    input.banner_id === undefined ? current.banner_id : input.banner_id;
  await validateMedia(db, session.store_id, bannerId, "banner");
  if (typeof input.is_open !== "boolean")
    throw new AppError(422, "Informe se a loja recebe pedidos.");
  const result = await db.batch([
    db
      .prepare(
        "UPDATE stores SET title=?,description=?,contact=?,hours=?,pickup_address=?,neighborhoods=?,delivery_fee=?,is_open=?,has_own_delivery=?,palette=?,font=?,banner_id=?,layout=?,theme=?,setup_complete=CASE WHEN ?=1 THEN 1 ELSE setup_complete END,version=version+1 WHERE id=? AND version=?",
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
        preset,
        Number(input.finishSetup === true),
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

export async function finishStoreGuide(
  db: D1Database,
  session: Session,
  input: Record<string, unknown>,
) {
  if (session.role !== "owner")
    throw new AppError(
      403,
      "Somente o proprietário pode concluir a configuração.",
    );
  const version = versionField(input.version);
  if (input.skip !== undefined && typeof input.skip !== "boolean")
    throw new AppError(422, "Informe se deseja pular o tutorial.");
  const skip = input.skip === true;
  const results = await db.batch([
    db
      .prepare(
        "UPDATE stores SET setup_complete=1,version=version+1 WHERE id=? AND version=? AND setup_complete=0 AND (version>0 OR ?=1)",
      )
      .bind(session.store_id, version, Number(skip)),
    conditionalAudit(
      db,
      session,
      skip ? "GUIDE_SKIPPED" : "GUIDE_COMPLETED",
      session.store_id,
      { version },
    ),
  ]);
  if (!results[0].meta.changes) {
    const store = await db
      .prepare("SELECT setup_complete,version FROM stores WHERE id=?")
      .bind(session.store_id)
      .first<Pick<Store, "setup_complete" | "version">>();
    if (!store?.setup_complete)
      throw new AppError(
        409,
        "Salve a personalização da loja e atualize a página antes de concluir o guia.",
      );
    if (skip && store.version !== version) {
      // Recover a lost skip response only if this exact decision produced the current version.
      const replay =
        store.version === version + 1 &&
        (await db
          .prepare(
            "SELECT id FROM audit_events WHERE store_id=? AND actor_id=? AND action='GUIDE_SKIPPED' AND json_extract(metadata,'$.version')=? LIMIT 1",
          )
          .bind(session.store_id, session.user_id, version)
          .first());
      if (!replay)
        throw new AppError(
          409,
          "A loja foi alterada. Atualize a página antes de pular o tutorial.",
        );
    }
    return { completed: true, version: store.version };
  }
  return { completed: true, version: version + 1 };
}
