// Maintenance only. Never run this from migrations, deploy, request handlers or seeding.
export function demoResetStatements(seed) {
  const rows = seed
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (
    !rows.length ||
    rows.some(
      (line) =>
        !/^INSERT OR IGNORE INTO (stores|users|store_memberships|products)\b/.test(
          line,
        ) || !line.endsWith(";"),
    )
  )
    throw new Error(
      "O seed deve conter um INSERT completo por linha. Reset não executado.",
    );
  return [
    "DROP TRIGGER audit_no_delete",
    "DELETE FROM payment_records",
    "DELETE FROM delivery_quotes",
    "DELETE FROM order_items",
    "DELETE FROM orders",
    "DELETE FROM customer_details",
    "DELETE FROM combo_items",
    "DELETE FROM products",
    "UPDATE stores SET banner_id=NULL",
    "DELETE FROM media_assets",
    "DELETE FROM sessions",
    "DELETE FROM checkout_intents",
    "DELETE FROM store_memberships",
    "DELETE FROM users",
    "DELETE FROM audit_events",
    "DELETE FROM stores",
    "DELETE FROM rate_limits",
    "DELETE FROM app_keys",
    "INSERT INTO app_keys VALUES ('tracking_hmac',lower(hex(randomblob(32))))",
    "INSERT INTO app_keys VALUES ('browser_epoch',lower(hex(randomblob(16))))",
    "CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'audit is append-only'); END",
    ...rows.map((line) => line.slice(0, -1)),
  ];
}
export const resetCountsSql =
  "SELECT (SELECT COUNT(*) FROM stores) stores,(SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM products) products,(SELECT COUNT(*) FROM store_memberships) memberships,(SELECT COUNT(*) FROM orders) orders,(SELECT COUNT(*) FROM order_items) items,(SELECT COUNT(*) FROM customer_details) customer_details,(SELECT COUNT(*) FROM delivery_quotes) quotes,(SELECT COUNT(*) FROM payment_records) payments,(SELECT COUNT(*) FROM audit_events) audit,(SELECT COUNT(*) FROM combo_items) combos,(SELECT COUNT(*) FROM media_assets) images,(SELECT COUNT(*) FROM sessions) sessions,(SELECT COUNT(*) FROM checkout_intents) intents,(SELECT COUNT(*) FROM rate_limits) rate_limits";
export const resetBaseline = {
  stores: 2,
  users: 2,
  products: 6,
  memberships: 2,
  orders: 0,
  items: 0,
  customer_details: 0,
  quotes: 0,
  payments: 0,
  audit: 0,
  combos: 0,
  images: 0,
  sessions: 0,
  intents: 0,
  rate_limits: 0,
};
