import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const stamp = new Date().toISOString().replaceAll(":", "-");
const target = path.join(root, ".local", "restore-checks", stamp);
mkdirSync(target, { recursive: true });
const backup = path.join(target, "backup.sql");
function wrangler(args, capture = false) {
  const r = spawnSync(
    process.execPath,
    ["scripts/run.mjs", "wrangler", ...args],
    { cwd: root, encoding: "utf8", stdio: capture ? "pipe" : "inherit" },
  );
  if (r.status !== 0) {
    if (capture) {
      console.error(r.stderr);
      try {
        console.error(
          JSON.parse(r.stdout).error?.text ?? "Falha no comando Wrangler.",
        );
      } catch {
        console.error("Falha no comando Wrangler.");
      }
    }
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}
wrangler(["d1", "export", "doofi-local", "--local", "--output", backup]);
const config = path.join(target, "restore.json");
writeFileSync(
  config,
  JSON.stringify({
    name: "doofi-restore-check",
    compatibility_date: "2026-10-19",
    d1_databases: [
      {
        binding: "DB",
        database_name: "doofi-restore",
        database_id: "00000000-0000-0000-0000-000000000002",
      },
    ],
  }),
);
const restoreState = path.join(target, "state");
wrangler(
  [
    "d1",
    "execute",
    "doofi-restore",
    "--config",
    config,
    "--local",
    "--persist-to",
    restoreState,
    "--file",
    backup,
    "--json",
  ],
  true,
);
const query =
  "SELECT (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM order_items) AS items, (SELECT COUNT(*) FROM audit_events) AS audit, (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM combo_items) AS combo_links, (SELECT COUNT(*) FROM media_assets) AS media_assets, (SELECT COALESCE(SUM(LENGTH(data)),0) FROM media_assets) AS media_bytes, (SELECT COUNT(*) FROM orders o WHERE NOT EXISTS (SELECT 1 FROM audit_events a WHERE a.entity_id=o.id AND a.action='ORDER_CREATED')) AS orphan_orders, (SELECT COUNT(*) FROM orders WHERE total IS NOT NULL AND total<>subtotal+delivery_fee) AS bad_totals";
function counts(database, args = []) {
  const output = wrangler(
    [
      "d1",
      "execute",
      database,
      "--local",
      ...args,
      "--command",
      query,
      "--json",
    ],
    true,
  );
  return JSON.parse(output)[0].results[0];
}
const original = counts("doofi-local");
const restored = counts("doofi-restore", [
  "--config",
  config,
  "--persist-to",
  restoreState,
]);
if (
  JSON.stringify(original) !== JSON.stringify(restored) ||
  original.orphan_orders !== 0 ||
  original.bad_totals !== 0
)
  throw new Error(
    "A restauração diverge do banco original ou há inconsistências.",
  );
writeFileSync(
  path.join(target, "verification.json"),
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      original,
      restored,
      localOnly: true,
    },
    null,
    2,
  ),
);
console.log(
  "Exportação e restauração locais verificadas:",
  JSON.stringify(restored),
);
console.log("Evidências locais em", path.relative(root, target));
