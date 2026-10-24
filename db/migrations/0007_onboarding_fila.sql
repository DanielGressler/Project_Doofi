-- Existing stores keep their current access. Only newly registered stores start the guide.
ALTER TABLE stores ADD COLUMN setup_complete INTEGER NOT NULL DEFAULT 1 CHECK(setup_complete IN (0,1));
CREATE INDEX orders_pending_queue ON orders(store_id,created_at)
WHERE status IN ('PENDING','QUOTE_PENDING','QUOTE_ACCEPTED');
