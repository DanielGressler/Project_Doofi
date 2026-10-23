-- Delivery details are order data, not authentication identities.
CREATE TABLE customer_details (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  neighborhood TEXT,
  postal_code TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(id,store_id)
);
CREATE INDEX customer_details_store ON customer_details(store_id,created_at);
ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES customer_details(id);

-- Preserve historical orders without inventing a missing phone/email.
INSERT INTO customer_details (id,store_id,name,phone,email,address,neighborhood,postal_code,created_at)
SELECT 'legacy-'||id,store_id,customer_name,
  CASE WHEN instr(customer_contact,'@')=0 THEN customer_contact END,
  CASE WHEN instr(customer_contact,'@')>0 THEN customer_contact END,
  address,neighborhood,postal_code,created_at FROM orders;
UPDATE orders SET customer_id='legacy-'||id;
CREATE UNIQUE INDEX orders_customer ON orders(customer_id) WHERE customer_id IS NOT NULL;

-- The foreign key resolves the record, and these guards enforce its tenant.
CREATE TRIGGER order_customer_insert BEFORE INSERT ON orders
WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM customer_details WHERE id=NEW.customer_id AND store_id=NEW.store_id
)
BEGIN SELECT RAISE(ABORT,'customer details must belong to the order store'); END;
-- Allow the previous application version during migration/deployment. Each
-- legacy insert still receives its own tenant-scoped FK before it commits.
CREATE TRIGGER order_customer_legacy AFTER INSERT ON orders
WHEN NEW.customer_id IS NULL
BEGIN
  INSERT INTO customer_details (id,store_id,name,phone,email,address,neighborhood,postal_code,created_at)
  VALUES ('legacy-'||NEW.id,NEW.store_id,NEW.customer_name,
    CASE WHEN instr(NEW.customer_contact,'@')=0 THEN NEW.customer_contact END,
    CASE WHEN instr(NEW.customer_contact,'@')>0 THEN NEW.customer_contact END,
    NEW.address,NEW.neighborhood,NEW.postal_code,NEW.created_at);
  UPDATE orders SET customer_id='legacy-'||NEW.id WHERE id=NEW.id;
END;
CREATE TRIGGER order_customer_update BEFORE UPDATE OF customer_id,store_id ON orders
WHEN NEW.customer_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM customer_details WHERE id=NEW.customer_id AND store_id=NEW.store_id
)
BEGIN SELECT RAISE(ABORT,'customer details must belong to the order store'); END;
CREATE TRIGGER customer_details_scope_immutable BEFORE UPDATE OF store_id ON customer_details
WHEN OLD.store_id<>NEW.store_id
BEGIN SELECT RAISE(ABORT,'customer details ownership is immutable'); END;
CREATE TRIGGER customer_details_scope_insert BEFORE INSERT ON customer_details
WHEN EXISTS(SELECT 1 FROM customer_details WHERE id=NEW.id AND store_id<>NEW.store_id)
BEGIN SELECT RAISE(ABORT,'customer details ownership is immutable'); END;
