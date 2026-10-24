import type { Order } from "./types";
import type { D1Result } from "@cloudflare/workers-types";

export interface OrderSummary {
  total_orders: number;
  completed: number;
  cancelled: number;
  pending: number;
  order_value: number;
  average_order: number | null;
  topItem: { title: string; units: number } | null;
}

function summaryStatements(db: D1Database, storeId: string) {
  return [
    db
      .prepare(
        `SELECT COUNT(*) AS total_orders,
      COALESCE(SUM(status='COMPLETED'),0) AS completed,
      COALESCE(SUM(status IN ('CANCELLED','REJECTED')),0) AS cancelled,
      COALESCE(SUM(status IN ('PENDING','QUOTE_PENDING','QUOTE_PROPOSED','QUOTE_ACCEPTED')),0) AS pending,
      COALESCE(SUM(CASE WHEN status NOT IN ('CANCELLED','REJECTED') THEN total ELSE 0 END),0) AS order_value,
      ROUND(AVG(CASE WHEN status NOT IN ('CANCELLED','REJECTED') THEN total END)) AS average_order
      FROM orders WHERE store_id=?`,
      )
      .bind(storeId),
    db
      .prepare(
        `SELECT p.title,SUM(i.quantity) AS units FROM order_items i
      JOIN orders o ON o.id=i.order_id AND o.store_id=i.store_id
      JOIN products p ON p.id=i.product_id AND p.store_id=i.store_id
      WHERE i.store_id=? AND o.status NOT IN ('REJECTED','CANCELLED') GROUP BY i.product_id
      ORDER BY units DESC,p.title LIMIT 1`,
      )
      .bind(storeId),
  ];
}

export function recentOrdersStatement(db: D1Database, storeId: string) {
  return db
    .prepare(
      `SELECT id,protocol,status,fulfillment,subtotal,delivery_fee,total,customer_name,created_at,version
    FROM orders WHERE store_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100`,
    )
    .bind(storeId);
}

function readSummary(results: D1Result[]) {
  const summary = results[0].results[0] as Omit<OrderSummary, "topItem">;
  const topItem = (results[1].results[0] as OrderSummary["topItem"]) ?? null;
  return {
    ...summary,
    topItem,
  };
}

export async function getOrderSummary(db: D1Database, storeId: string) {
  return readSummary(await db.batch(summaryStatements(db, storeId)));
}

export async function getDashboard(db: D1Database, storeId: string) {
  const results = await db.batch([
    ...summaryStatements(db, storeId),
    recentOrdersStatement(db, storeId),
    db
      .prepare(
        `SELECT id,protocol,status,version,created_at FROM orders WHERE store_id=?
      AND status IN ('PENDING','QUOTE_PENDING','QUOTE_ACCEPTED') ORDER BY created_at,rowid LIMIT 50`,
      )
      .bind(storeId),
  ]);
  return {
    summary: readSummary(results),
    orders: results[2].results,
    queue: results[3].results as Pick<
      Order,
      "id" | "protocol" | "status" | "version" | "created_at"
    >[],
  };
}
