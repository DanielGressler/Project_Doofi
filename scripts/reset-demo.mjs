import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  chmodSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  demoResetStatements,
  resetBaseline,
  resetCountsSql,
} from "./demo-reset-sql.mjs";
import { prepareRestoreSql } from "./restore-sql.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2),
  remote = args.includes("--remote"),
  plan = args.includes("--plan");
const configIndex = args.indexOf("--config");
const config =
  configIndex < 0
    ? path.join(root, "wrangler.jsonc")
    : path.resolve(root, args[configIndex + 1] ?? "");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--config") {
    if (!args[++i]) throw new Error("Informe o arquivo de configuração.");
  } else if (!["--remote", "--plan"].includes(args[i]))
    throw new Error(`Opção não reconhecida: ${args[i]}`);
}
if (remote) {
  const target = JSON.parse(readFileSync(config, "utf8"));
  const binding = target.d1_databases?.find((db) => db.binding === "DB");
  if (
    target.vars?.APP_MODE !== "staging-demo" ||
    binding?.database_name !== "doofi-demo" ||
    !process.env.DOOFI_D1_DATABASE_ID ||
    binding.database_id !== process.env.DOOFI_D1_DATABASE_ID ||
    /^00000000-/.test(binding.database_id)
  )
    throw new Error(
      "Reset remoto permitido somente para o D1 de demonstração identificado por DOOFI_D1_DATABASE_ID.",
    );
} else if (config !== path.join(root, "wrangler.jsonc"))
  throw new Error(
    "O reset local usa apenas o banco doofi-local deste projeto.",
  );
const database = remote ? "doofi-demo" : "doofi-local";
const target = path.join(
  root,
  ".local",
  "demo-resets",
  new Date().toISOString().replaceAll(":", "-"),
);
mkdirSync(target, { recursive: true });
const resetFile = path.join(target, "reset.sql");
writeFileSync(
  resetFile,
  demoResetStatements(
    readFileSync(path.join(root, "db", "seed.sql"), "utf8"),
  ).join(";\n") + ";\n",
);
if (plan) {
  console.log(
    `Plano de reset ${remote ? "remoto" : "local"}: ${resetFile}. Nenhum dado alterado.`,
  );
  process.exit(0);
}
function wrangler(command, extra = [], capture = false) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts", "run.mjs"),
      "wrangler",
      "d1",
      command,
      database,
      remote ? "--remote" : "--local",
      "--config",
      config,
      ...extra,
    ],
    { cwd: root, encoding: "utf8", stdio: capture ? "pipe" : "inherit" },
  );
  if (result.status !== 0)
    throw new Error(
      `Falha no Wrangler. Reset interrompido. ${result.stderr ?? ""}`,
    );
  return result.stdout;
}
const counts = () =>
  JSON.parse(
    wrangler("execute", ["--command", resetCountsSql, "--json"], true),
  )[0].results[0];
const before = counts();
const backup = path.join(target, "backup.sql");
wrangler("export", ["--output", backup]);
if (!statSync(backup).size)
  throw new Error("O backup está vazio; reset não executado.");
chmodSync(backup, 0o600);
const restore = path.join(target, "restore.sql");
writeFileSync(restore, prepareRestoreSql(readFileSync(backup, "utf8")), {
  mode: 0o600,
});
console.log(`Backup salvo. Restaurando os dados iniciais em ${database}…`);
wrangler("execute", ["--file", resetFile, "--json"], true);
const after = counts();
const foreignKeys = JSON.parse(
  wrangler(
    "execute",
    ["--command", "PRAGMA foreign_key_check", "--json"],
    true,
  ),
)[0].results;
writeFileSync(
  path.join(target, "verification.json"),
  JSON.stringify(
    {
      database,
      remote,
      before,
      after,
      foreignKeyErrors: foreignKeys.length,
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
if (
  Object.entries(resetBaseline).some(([key, value]) => after[key] !== value) ||
  foreignKeys.length
)
  throw new Error(
    `O resultado diverge da base inicial. Consulte ${target}; o backup está preservado.`,
  );
console.log(
  `Reset ${remote ? "remoto" : "local"} concluído: 2 lojas, 2 acessos e 6 produtos; sem pedidos, cadastros adicionais, uploads ou sessões. Backup: ${target}`,
);
