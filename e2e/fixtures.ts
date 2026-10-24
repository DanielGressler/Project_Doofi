import { createHash } from "node:crypto";
import { test as base } from "@playwright/test";
export * from "@playwright/test";

export const test = base.extend({
  context: async ({ context }, use, info) => {
    // Each local browser test represents a different network participant.
    // Keep the application's real limits; do not let unrelated scenarios share one localhost bucket.
    const bytes = createHash("sha256").update(info.testId).digest();
    await context.setExtraHTTPHeaders({
      "CF-Connecting-IP": `10.${bytes[0]}.${bytes[1]}.${bytes[2]}`,
    });
    await use(context);
  },
});
