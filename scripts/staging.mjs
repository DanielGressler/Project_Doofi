import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const [command, ...extra] = process.argv.slice(2);
const id = process.env.DOOFI_D1_DATABASE_ID?.trim();
if (
  !id ||
  !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) ||
  /^00000000-0000-0000-0000-/.test(id)
) {
  console.error(
    "Configure DOOFI_D1_DATABASE_ID com o Database ID real do banco D1. O identificador do banco local não pode ser publicado. Consulte docs/HOSPEDAGEM_CLOUDFLARE.md.",
  );
  process.exit(1);
}
const name = process.env.DOOFI_WORKER_NAME?.trim() || "project-doofi";
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name))
  throw new Error("DOOFI_WORKER_NAME inválido.");
const folder = path.join(root, ".local", "cloudflare");
mkdirSync(folder, { recursive: true });
const configPath = path.join(folder, "wrangler.json");
// Astro resolves this option as a URL; Windows drive paths become a "d:" URL.
const adapterConfigPath = path
  .relative(root, configPath)
  .split(path.sep)
  .join("/");
const vars = { APP_MODE: "staging-demo" };
for (const key of [
  "DOOFI_DEMO_HOST",
  "CF_ACCESS_TEAM_DOMAIN",
  "CF_ACCESS_AUD",
]) {
  if (process.env[key]?.trim()) vars[key] = process.env[key].trim();
}
writeFileSync(
  configPath,
  JSON.stringify(
    {
      name,
      main: "@astrojs/cloudflare/entrypoints/server",
      compatibility_date: "2026-10-19",
      compatibility_flags: ["nodejs_compat"],
      workers_dev: true,
      preview_urls: false,
      keep_vars: true,
      assets: { directory: path.join(root, "dist"), binding: "ASSETS" },
      d1_databases: [
        {
          binding: "DB",
          database_name: "doofi-demo",
          database_id: id,
          migrations_dir: path.join(root, "db", "migrations"),
        },
      ],
      vars,
      observability: { enabled: true },
    },
    null,
    2,
  ) + "\n",
);

let args;
let runner = path.join(root, "scripts", "run.mjs");
switch (command) {
  case "reset":
    runner = path.join(root, "scripts", "reset-demo.mjs");
    args = ["--remote", "--config", configPath, ...extra];
    break;
  case "build":
    args = ["astro", "build", ...extra];
    break;
  case "migrate":
    args = [
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "doofi-demo",
      "--remote",
      "--config",
      configPath,
      ...extra,
    ];
    break;
  case "seed":
    args = [
      "wrangler",
      "d1",
      "execute",
      "doofi-demo",
      "--remote",
      "--config",
      configPath,
      "--file",
      path.join(root, "db", "seed.sql"),
      ...extra,
    ];
    break;
  case "deploy": {
    const compiled = path.join(root, "dist", "server", "wrangler.json");
    let config;
    try {
      config = JSON.parse(readFileSync(compiled, "utf8"));
    } catch {
      throw new Error("Execute npm run build:staging antes de publicar.");
    }
    if (
      config.vars?.APP_MODE !== "staging-demo" ||
      config.name !== name ||
      !config.d1_databases?.some(
        (db) => db.binding === "DB" && db.database_id === id,
      )
    )
      throw new Error(
        "O build não corresponde à homologação. Execute npm run build:staging novamente.",
      );
    args = ["wrangler", "deploy", "--config", compiled, ...extra];
    break;
  }
  default:
    throw new Error("Use build, migrate, seed, reset ou deploy.");
}
const child = spawn(process.execPath, [runner, ...args], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, DOOFI_WRANGLER_CONFIG: adapterConfigPath },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
