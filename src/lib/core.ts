export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "VALIDATION",
  ) {
    super(message);
  }
}
export const now = () => Math.floor(Date.now() / 1000);
export const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(new Uint8Array(bytes as ArrayBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export const unhex = (value: string) =>
  Uint8Array.from(value.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));
export const randomToken = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)));
export const hash = async (text: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
export async function hmac(key: string, value: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    unhex(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(value)),
  );
}
export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: unhex(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
}
export function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function textField(value: unknown, name: string, min = 1, max = 160) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw new AppError(
      422,
      `${name}: informe entre ${min} e ${max} caracteres.`,
    );
  return value.trim();
}
export function integer(value: unknown, name: string, min = 0, max = 100000) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new AppError(
      422,
      `${name}: informe um inteiro entre ${min} e ${max}.`,
    );
  return value;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(422, "Dados inválidos.");
  return value as Record<string, unknown>;
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "Envie os dados em JSON.");
  if (Number(request.headers.get("content-length") ?? 0) > 16384)
    throw new AppError(413, "Os dados enviados excedem o limite.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(422, "Dados ausentes.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 16384) {
      await reader.cancel();
      throw new AppError(413, "Os dados enviados excedem o limite.");
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return object(JSON.parse(new TextDecoder().decode(buffer)));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(422, "JSON inválido.");
  }
}
export function originCheck(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new AppError(403, "Origem da solicitação não autorizada.");
}
export function localDemoAllowed(request: Request, mode: string) {
  return (
    mode === "local-demo" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)
  );
}
export function audit(
  db: D1Database,
  storeId: string,
  actor: string,
  action: string,
  entity: string,
  metadata: object = {},
  correlation = crypto.randomUUID(),
) {
  return db
    .prepare(
      "INSERT INTO audit_events (id,store_id,actor_id,action,entity_id,metadata,correlation_id,created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      storeId,
      actor,
      action,
      entity,
      JSON.stringify(metadata),
      correlation,
      now(),
    );
}
export async function rateLimit(
  db: D1Database,
  request: Request,
  scope: string,
  limit = 120,
) {
  const window = Math.floor(now() / 60);
  const bucket = await hash(
    `${scope}:${request.headers.get("cf-connecting-ip") ?? "local"}:${window}`,
  );
  const result = await db
    .prepare(
      "INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(bucket, (window + 1) * 60)
    .first<{ count: number }>();
  if ((result?.count ?? 0) > limit)
    throw new AppError(
      429,
      "Muitas tentativas. Aguarde um minuto e tente novamente.",
      "RATE_LIMIT",
    );
}
