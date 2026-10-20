import { describe, it, expect } from "vitest";
import { env } from "cloudflare:workers";

describe("S0-01 · Workers + D1", () => {
  it("consulta duas lojas e limita produtos ao tenant", async () => {
    const stores = await env.DB.prepare("SELECT id FROM stores").all();
    expect(stores.results).toHaveLength(2);
    const products = await env.DB.prepare(
      "SELECT id FROM products WHERE store_id=?",
    )
      .bind("store-a")
      .all();
    expect(products.results).toHaveLength(3);
    const foreign = await env.DB.prepare(
      "SELECT id FROM products WHERE store_id=? AND id=?",
    )
      .bind("store-a", "b-bowl")
      .first();
    expect(foreign).toBeNull();
  });
  it("D1.batch reverte a gravação anterior se o evento falhar", async () => {
    await expect(
      env.DB.batch([
        env.DB.prepare(
          "INSERT INTO app_keys VALUES ('rollback_probe','temporary')",
        ),
        env.DB.prepare(
          "INSERT INTO audit_events (id,store_id,actor_id,action,entity_id,correlation_id,created_at) VALUES ('bad','nonexistent','test','probe','probe','test',1)",
        ),
      ]),
    ).rejects.toThrow();
    expect(
      await env.DB.prepare(
        "SELECT * FROM app_keys WHERE name='rollback_probe'",
      ).first(),
    ).toBeNull();
  });
});
