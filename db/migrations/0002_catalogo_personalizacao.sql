ALTER TABLE stores ADD COLUMN has_own_delivery INTEGER NOT NULL DEFAULT 0 CHECK(has_own_delivery IN (0,1));
ALTER TABLE stores ADD COLUMN palette TEXT NOT NULL DEFAULT 'terracotta' CHECK(palette IN ('terracotta','forest','ocean','plum'));
ALTER TABLE stores ADD COLUMN font TEXT NOT NULL DEFAULT 'editorial' CHECK(font IN ('editorial','simple','classic'));
ALTER TABLE stores ADD COLUMN banner_id TEXT;
UPDATE stores SET palette='forest' WHERE theme='green';
ALTER TABLE products ADD COLUMN image_id TEXT;
ALTER TABLE products ADD COLUMN is_combo INTEGER NOT NULL DEFAULT 0 CHECK(is_combo IN (0,1));
CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  kind TEXT NOT NULL CHECK(kind IN ('product','banner')),
  data BLOB NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(id,store_id)
);
CREATE INDEX media_store ON media_assets(store_id);
CREATE TABLE combo_items (
  combo_id TEXT NOT NULL,
  store_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  PRIMARY KEY(combo_id,product_id),
  FOREIGN KEY(combo_id,store_id) REFERENCES products(id,store_id),
  FOREIGN KEY(product_id,store_id) REFERENCES products(id,store_id),
  CHECK(combo_id<>product_id)
);
CREATE TRIGGER combo_only_products BEFORE INSERT ON combo_items
WHEN NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.combo_id AND store_id=NEW.store_id AND is_combo=1)
  OR NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND store_id=NEW.store_id AND is_combo=0)
BEGIN SELECT RAISE(ABORT,'combo requires ordinary products in the same store'); END;
