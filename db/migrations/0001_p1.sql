CREATE TABLE stores (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  contact TEXT NOT NULL,
  pickup_address TEXT NOT NULL,
  hours TEXT NOT NULL,
  is_open INTEGER NOT NULL DEFAULT 1 CHECK(is_open IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  delivery_fee INTEGER NOT NULL CHECK(delivery_fee BETWEEN 0 AND 100000),
  neighborhoods TEXT NOT NULL,
  theme TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE store_memberships (
  store_id TEXT NOT NULL REFERENCES stores(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('owner','staff')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  PRIMARY KEY(store_id,user_id),
  UNIQUE(user_id)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price BETWEEN 1 AND 100000),
  available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)),
  image TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  UNIQUE(id,store_id)
);
CREATE INDEX products_store ON products(store_id);
CREATE TABLE checkout_intents (
  key_hash TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE app_keys (name TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO app_keys VALUES ('tracking_hmac', lower(hex(randomblob(32))));
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  protocol TEXT NOT NULL UNIQUE,
  public_token_hash TEXT NOT NULL UNIQUE,
  token_expires_at INTEGER NOT NULL,
  token_revoked INTEGER NOT NULL DEFAULT 0 CHECK(token_revoked IN (0,1)),
  intent_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','QUOTE_PENDING','QUOTE_PROPOSED','QUOTE_ACCEPTED','ACCEPTED','PREPARING','READY','OUT_FOR_DELIVERY','COMPLETED','REJECTED','CANCELLED')),
  fulfillment TEXT NOT NULL CHECK(fulfillment IN ('PICKUP','FIXED','QUOTE')),
  subtotal INTEGER NOT NULL CHECK(subtotal > 0),
  delivery_fee INTEGER CHECK(delivery_fee >= 0),
  total INTEGER CHECK(total > 0),
  customer_name TEXT NOT NULL,
  customer_contact TEXT NOT NULL,
  address TEXT,
  neighborhood TEXT,
  postal_code TEXT,
  note TEXT NOT NULL,
  quote_version INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(store_id,intent_hash),
  UNIQUE(id,store_id),
  CHECK((total IS NULL AND delivery_fee IS NULL AND fulfillment='QUOTE') OR (total=subtotal+delivery_fee))
);
CREATE INDEX orders_store_created ON orders(store_id,created_at DESC);
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price > 0),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10),
  FOREIGN KEY(order_id,store_id) REFERENCES orders(id,store_id),
  FOREIGN KEY(product_id,store_id) REFERENCES products(id,store_id)
);
CREATE INDEX order_items_order ON order_items(order_id);
CREATE TABLE delivery_quotes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  fee INTEGER NOT NULL CHECK(fee BETWEEN 0 AND 100000),
  estimate TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  FOREIGN KEY(order_id,store_id) REFERENCES orders(id,store_id),
  UNIQUE(order_id,version)
);
CREATE TABLE payment_records (
  order_id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('PIX_SIMULATED','ON_FULFILLMENT_SIMULATED')),
  status TEXT NOT NULL DEFAULT 'SIMULATED_NOT_COLLECTED' CHECK(status IN ('SIMULATED_NOT_COLLECTED','SIMULATED_CUSTOMER_DECLARED','SIMULATED_SELLER_CONFIRMED','SIMULATED_LATE_DECLARATION')),
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(order_id,store_id) REFERENCES orders(id,store_id)
);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_store_entity ON audit_events(store_id,entity_id,created_at);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'audit is append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'audit is append-only'); END;
CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
