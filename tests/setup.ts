import { beforeEach } from "vitest";
import { env } from "cloudflare:workers";
import { applyD1Migrations, reset } from "cloudflare:test";
import seed from "../db/seed.sql?raw";

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch(
    seed
      .split(";\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => env.DB.prepare(s.replace(/;$/, ""))),
  );
});
