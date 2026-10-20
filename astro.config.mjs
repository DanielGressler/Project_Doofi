import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough",
    configPath: process.env.DOOFI_WRANGLER_CONFIG ?? "wrangler.jsonc",
  }),
  session: false,
  devToolbar: { enabled: false },
});
