import type { Store } from "./types";
type DirectoryStore = Pick<
  Store,
  | "slug"
  | "title"
  | "description"
  | "theme"
  | "banner_id"
  | "is_open"
  | "has_own_delivery"
  | "delivery_fee"
>;
// Public, paginated projection. No owners, customer data or per-store N+1 reads.
export async function registeredStores(db: D1Database, page = 1) {
  const offset = (Math.min(10000, Math.max(1, Math.floor(page) || 1)) - 1) * 24;
  return (
    await db
      .prepare(
        "SELECT slug,title,description,theme,banner_id,is_open,has_own_delivery,delivery_fee FROM stores WHERE active=1 AND setup_complete=1 ORDER BY title,id LIMIT 25 OFFSET ?",
      )
      .bind(offset)
      .all<DirectoryStore>()
  ).results;
}
