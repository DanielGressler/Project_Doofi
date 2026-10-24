import { audit, hash, hmac, now, randomToken } from "../../src/lib/core";
import { issueIntent } from "../../src/lib/orders";

// A real pre-0006 record, including the previous canonical idempotency payload.
export async function legacyOrder(
  db: D1Database,
  contact = "antigo@exemplo.invalid",
) {
  const { intent } = await issueIntent(db, "casa-do-forno");
  const canonical = {
    items: [{ productId: "a-pao", quantity: 1 }],
    fulfillment: "FIXED",
    payment: "PIX_SIMULATED",
    name: "Cliente Antigo",
    contact,
    note: "Observação antiga",
    address: "Rua Antiga, 10",
    neighborhood: "Centro",
    postalCode: "00000000",
  };
  const key = (await db
    .prepare("SELECT value FROM app_keys WHERE name='tracking_hmac'")
    .first<{ value: string }>())!.value;
  const token = await hmac(key, `tracking:store-a:${intent}`);
  const id = crypto.randomUUID(),
    timestamp = now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO orders (id,store_id,protocol,public_token_hash,token_expires_at,intent_hash,request_hash,status,fulfillment,subtotal,delivery_fee,total,customer_name,customer_contact,address,neighborhood,postal_code,note,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        "store-a",
        `DF-${id.slice(0, 8)}`,
        await hash(token),
        timestamp + 2592000,
        await hash(intent),
        await hash(JSON.stringify(canonical)),
        "PENDING",
        "FIXED",
        2400,
        600,
        3000,
        canonical.name,
        canonical.contact,
        canonical.address,
        canonical.neighborhood,
        canonical.postalCode,
        canonical.note,
        timestamp,
        timestamp,
      ),
    db
      .prepare("INSERT INTO order_items VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), id, "store-a", "a-pao", "Pão", 2400, 1),
    db
      .prepare(
        "INSERT INTO payment_records (order_id,store_id,method,updated_at) VALUES (?,?,?,?)",
      )
      .bind(id, "store-a", "PIX_SIMULATED", timestamp),
    audit(db, "store-a", "guest", "ORDER_CREATED", id),
  ]);
  return {
    id,
    token,
    input: { ...canonical, intent, consent: true, syntheticData: true },
  };
}

// Issue a session using the schema available before onboarding existed.
export async function legacySession(db: D1Database) {
  const token = randomToken(),
    csrf = randomToken();
  await db
    .prepare(
      "INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at) VALUES (?,'user-a',?,?)",
    )
    .bind(await hash(token), csrf, now() + 28800)
    .run();
  return { cookie: `doofi_session=${token}`, csrf };
}
