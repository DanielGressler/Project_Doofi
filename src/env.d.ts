/// <reference types="astro/client" />
type D1Database = import("@cloudflare/workers-types/index.ts").D1Database;
declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    APP_MODE: string;
    DOOFI_DEMO_HOST?: string;
    CF_ACCESS_TEAM_DOMAIN?: string;
    CF_ACCESS_AUD?: string;
    TEST_MIGRATIONS: import("@cloudflare/vitest-plugin").D1Migration[];
  }
}
declare namespace App {
  interface Locals {
    browserEpoch?: string;
    session: import("./lib/types").AuthenticatedSession | null;
  }
}
