CREATE INDEX checkout_intents_expiry ON checkout_intents(expires_at);
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
CREATE INDEX combo_items_store_combo ON combo_items(store_id,combo_id);
CREATE INDEX order_items_store_product ON order_items(store_id,product_id,order_id);
CREATE INDEX products_store_image ON products(store_id,image_id) WHERE image_id IS NOT NULL;
CREATE INDEX products_store_catalog ON products(store_id,category,title);
DROP INDEX products_store;

-- Scanning this ascending index backwards also orders the implicit rowid DESC.
DROP INDEX orders_store_created;
CREATE INDEX orders_store_created ON orders(store_id,created_at);
