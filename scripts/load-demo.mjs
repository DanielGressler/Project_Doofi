import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const base = new URL(process.argv[2] ?? "http://localhost:4321");
if (
  base.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
)
  throw new Error(
    "Este teste usa apenas o protótipo local em HTTP. Informe http://localhost:PORTA.",
  );
const endpoint = new URL("/api/v1/lojas/casa-do-forno", base);
const samples = 100;
const report = {
  checkedAt: new Date().toISOString(),
  node: process.version,
  localOnly: true,
  readOnly: true,
  endpoint: endpoint.pathname,
  samplesPerLevel: samples,
  results: [],
};

async function readCatalog() {
  const started = performance.now();
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.store || !Array.isArray(data.products))
    throw new Error("Resposta de catálogo inválida.");
  return performance.now() - started;
}

for (let index = 0; index < 5; index++) await readCatalog();
for (const concurrency of [1, 10, 30, 50]) {
  let next = 0;
  const durations = [];
  const errors = [];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < samples) {
        next++;
        try {
          durations.push(await readCatalog());
        } catch (error) {
          errors.push(
            error instanceof Error ? error.message : "Falha desconhecida",
          );
        }
      }
    }),
  );
  const elapsedMs = performance.now() - started;
  durations.sort((a, b) => a - b);
  const percentile = (value) =>
    durations.length
      ? Math.round(durations[Math.ceil(durations.length * value) - 1] * 100) /
        100
      : null;
  const result = {
    concurrency,
    requests: samples,
    succeeded: durations.length,
    failed: errors.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    elapsedMs: Math.round(elapsedMs),
    errors: [...new Set(errors)],
  };
  report.results.push(result);
  console.log(JSON.stringify(result));
}
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = path.join(root, ".local", "load-tests");
mkdirSync(directory, { recursive: true });
const output = path.join(directory, "latest.json");
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(`Relatório local: ${path.relative(root, output)}`);
if (report.results.some((result) => result.failed)) process.exitCode = 1;
