/// <reference types="astro/client" />
type D1Database = import("@cloudflare/workers-types/index.ts").D1Database;
declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    APP_MODE: string;
    TEST_MIGRATIONS: import("@cloudflare/vitest-plugin").D1Migration[];
  }
}
declare namespace App {
  interface Locals {
    session: import("./lib/types").Session | null;
  }
}
