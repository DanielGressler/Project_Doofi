-- Each user has exactly one membership (UNIQUE(user_id)). Revoke sessions in
-- the same transaction as any change to that security scope, including role.
-- Legacy sessions have no historical tenant binding: require a fresh login once.
DELETE FROM sessions;
CREATE TRIGGER membership_insert_sessions AFTER INSERT ON store_memberships
BEGIN DELETE FROM sessions WHERE user_id=NEW.user_id; END;
CREATE TRIGGER membership_revoke_sessions AFTER UPDATE ON store_memberships
WHEN OLD.store_id<>NEW.store_id OR OLD.user_id<>NEW.user_id
  OR OLD.role<>NEW.role OR OLD.active<>NEW.active
BEGIN DELETE FROM sessions WHERE user_id=OLD.user_id; END;
CREATE TRIGGER membership_delete_sessions AFTER DELETE ON store_memberships
BEGIN DELETE FROM sessions WHERE user_id=OLD.user_id; END;
CREATE TRIGGER user_revoke_sessions AFTER UPDATE OF active,password_hash,salt ON users
WHEN OLD.active<>NEW.active OR OLD.password_hash<>NEW.password_hash OR OLD.salt<>NEW.salt
BEGIN DELETE FROM sessions WHERE user_id=OLD.id; END;
CREATE TRIGGER user_insert_sessions AFTER INSERT ON users
BEGIN DELETE FROM sessions WHERE user_id=NEW.id; END;
CREATE TRIGGER store_revoke_sessions AFTER UPDATE OF active ON stores
WHEN OLD.active<>NEW.active
BEGIN DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM store_memberships WHERE store_id=OLD.id); END;
CREATE TRIGGER store_insert_sessions AFTER INSERT ON stores
BEGIN DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM store_memberships WHERE store_id=NEW.id); END;

-- API validation is also enforced at the persistence boundary.
CREATE TRIGGER product_image_insert BEFORE INSERT ON products
WHEN NEW.image_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM media_assets WHERE id=NEW.image_id AND store_id=NEW.store_id AND kind='product'
)
BEGIN SELECT RAISE(ABORT,'product image must belong to the same store'); END;
CREATE TRIGGER product_image_update BEFORE UPDATE OF image_id,store_id ON products
WHEN NEW.image_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM media_assets WHERE id=NEW.image_id AND store_id=NEW.store_id AND kind='product'
)
BEGIN SELECT RAISE(ABORT,'product image must belong to the same store'); END;
CREATE TRIGGER store_banner_insert BEFORE INSERT ON stores
WHEN NEW.banner_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM media_assets WHERE id=NEW.banner_id AND store_id=NEW.id AND kind='banner'
)
BEGIN SELECT RAISE(ABORT,'banner must belong to the same store'); END;
CREATE TRIGGER store_banner_update BEFORE UPDATE OF banner_id ON stores
WHEN NEW.banner_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM media_assets WHERE id=NEW.banner_id AND store_id=NEW.id AND kind='banner'
)
BEGIN SELECT RAISE(ABORT,'banner must belong to the same store'); END;
CREATE TRIGGER media_scope_immutable BEFORE UPDATE OF store_id,kind ON media_assets
WHEN OLD.store_id<>NEW.store_id OR OLD.kind<>NEW.kind
BEGIN SELECT RAISE(ABORT,'media ownership and kind are immutable'); END;
CREATE TRIGGER media_scope_insert BEFORE INSERT ON media_assets
WHEN EXISTS(SELECT 1 FROM media_assets WHERE id=NEW.id AND (store_id<>NEW.store_id OR kind<>NEW.kind))
BEGIN SELECT RAISE(ABORT,'media ownership and kind are immutable'); END;
CREATE TRIGGER product_scope_immutable BEFORE UPDATE OF store_id ON products
WHEN OLD.store_id<>NEW.store_id
BEGIN SELECT RAISE(ABORT,'product ownership is immutable'); END;
CREATE TRIGGER product_scope_insert BEFORE INSERT ON products
WHEN EXISTS(SELECT 1 FROM products WHERE id=NEW.id AND store_id<>NEW.store_id)
BEGIN SELECT RAISE(ABORT,'product ownership is immutable'); END;
CREATE TRIGGER order_scope_immutable BEFORE UPDATE OF store_id ON orders
WHEN OLD.store_id<>NEW.store_id
BEGIN SELECT RAISE(ABORT,'order ownership is immutable'); END;
CREATE TRIGGER combo_only_products_update BEFORE UPDATE ON combo_items
WHEN NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.combo_id AND store_id=NEW.store_id AND is_combo=1)
  OR NOT EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND store_id=NEW.store_id AND is_combo=0)
BEGIN SELECT RAISE(ABORT,'combo requires ordinary products in the same store'); END;
CREATE INDEX sessions_user ON sessions(user_id);
