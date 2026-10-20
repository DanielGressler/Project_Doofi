import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = path.join(root, ".local", "config");
mkdirSync(config, { recursive: true });
const [command, ...args] = process.argv.slice(2);
const child = spawn(
  process.execPath,
  [path.join(root, "node_modules", ".bin", command), ...args],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      XDG_CONFIG_HOME: config,
      ASTRO_TELEMETRY_DISABLED: "1",
      WRANGLER_SEND_METRICS: "false",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
