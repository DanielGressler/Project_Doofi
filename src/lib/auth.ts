import {
  AppError,
  audit,
  conditionalAudit,
  hash,
  now,
  passwordHash,
  randomToken,
  same,
  textField,
} from "./core";
import type { AuthenticatedSession, Session } from "./types";
import { cookieToken, sessionCookie } from "./session-cookie";
import { syntheticError } from "./synthetic-data";
export { cookieToken } from "./session-cookie";
export async function getSession(
  db: D1Database,
  request: Request,
): Promise<AuthenticatedSession | null> {
  const token = cookieToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return db
    .prepare(
      `SELECT s.token_hash,s.csrf_token,s.expires_at AS session_expires_at,s.user_id,m.store_id,m.role,u.email,t.title AS store_title,t.slug AS store_slug,t.setup_complete AS store_setup_complete FROM sessions s
    JOIN users u ON u.id=s.user_id AND u.active=1
    JOIN store_memberships m ON m.user_id=u.id AND m.active=1
    JOIN stores t ON t.id=m.store_id AND t.active=1
    WHERE s.token_hash=? AND s.expires_at>?`,
    )
    .bind(await hash(token), now())
    .first<AuthenticatedSession>();
}
export async function requireSession(
  db: D1Database,
  request: Request,
  mutate = false,
) {
  const session = await getSession(db, request);
  if (!session)
    throw new AppError(401, "Entre no painel para continuar.", "AUTH_REQUIRED");
  if (
    mutate &&
    !same(request.headers.get("x-csrf-token") ?? "", session.csrf_token)
  )
    throw new AppError(
      403,
      "Sessão de formulário inválida. Atualize a página.",
      "CSRF",
    );
  return session;
}
export async function login(
  db: D1Database,
  request: Request,
  input: Record<string, unknown>,
) {
  const email = textField(input.email, "E-mail", 3, 120).toLowerCase();
  const emailError = syntheticError("email", email);
  if (emailError)
    throw new AppError(422, emailError, "SYNTHETIC_DATA_REQUIRED");
  const password = textField(input.password, "Senha", 1, 128);
  const user = await db
    .prepare(
      "SELECT u.id,u.salt,u.password_hash,m.store_id,m.role,t.setup_complete,t.version AS store_version FROM users u JOIN store_memberships m ON m.user_id=u.id AND m.active=1 JOIN stores t ON t.id=m.store_id AND t.active=1 WHERE u.email=? AND u.active=1",
    )
    .bind(email)
    .first<{
      id: string;
      store_id: string;
      salt: string;
      password_hash: string;
      role: Session["role"];
      setup_complete: number;
      store_version: number;
    }>();
  const derived = await passwordHash(
    password,
    user?.salt ?? "646f6f66692d70312d64656d6f2d73616c74",
  );
  if (!user || !same(derived, user.password_hash)) {
    if (user)
      await audit(
        db,
        user.store_id,
        "anonymous",
        "LOGIN_DENIED",
        user.id,
      ).run();
    throw new AppError(401, "E-mail ou senha incorretos.");
  }
  const token = randomToken();
  const csrf = randomToken();
  const writes = await db.batch([
    db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(cookieToken(request))),
    db
      .prepare(
        `INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at)
        SELECT ?,?,?,? WHERE EXISTS(
          SELECT 1 FROM users u JOIN store_memberships m ON m.user_id=u.id
          JOIN stores t ON t.id=m.store_id WHERE u.id=? AND u.active=1
          AND u.password_hash=? AND u.salt=? AND m.store_id=? AND m.role=?
          AND m.active=1 AND t.active=1
        )`,
      )
      .bind(
        await hash(token),
        user.id,
        csrf,
        now() + 28800,
        user.id,
        user.password_hash,
        user.salt,
        user.store_id,
        user.role,
      ),
    conditionalAudit(
      db,
      { store_id: user.store_id, user_id: user.id },
      "LOGIN",
      user.id,
    ),
  ]);
  if (!writes[1].meta.changes)
    throw new AppError(
      409,
      "O acesso foi alterado durante a entrada. Entre novamente.",
      "AUTH_CHANGED",
    );
  return {
    csrfToken: csrf,
    setCookie: sessionCookie(token, request, 28800),
    next: user.setup_complete
      ? "/painel/pedidos"
      : user.store_version > 0
        ? "/painel/catalogo?tutorial=1"
        : "/painel/loja?tutorial=1",
  };
}
export async function register(
  db: D1Database,
  request: Request,
  input: Record<string, unknown>,
) {
  const title = textField(input.title, "Nome da loja", 2, 80);
  const email = textField(input.email, "E-mail", 3, 120).toLowerCase();
  const fakeError = syntheticError("email", email);
  if (fakeError) throw new AppError(422, fakeError, "SYNTHETIC_DATA_REQUIRED");
  const contact = textField(
    input.contact ?? "(00) 00000-0000",
    "Telefone fictício",
    3,
    40,
  );
  const phoneError = syntheticError("phone", contact);
  if (phoneError)
    throw new AppError(422, phoneError, "SYNTHETIC_DATA_REQUIRED");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AppError(
      422,
      "Informe um e-mail fictício no formato nome@exemplo.invalid.",
    );
  const password = textField(input.password, "Senha de demonstração", 8, 128);
  if (input.syntheticData !== true)
    throw new AppError(422, "Confirme o uso de dados fictícios.");
  const userId = crypto.randomUUID(),
    storeId = crypto.randomUUID();
  const slug = `loja-${storeId}`;
  const salt = randomToken(),
    token = randomToken(),
    csrf = randomToken();
  const derived = await passwordHash(password, salt);
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO users (id,email,password_hash,salt) VALUES (?,?,?,?)",
        )
        .bind(userId, email, derived, salt),
      db
        .prepare(
          `INSERT INTO stores (id,slug,title,description,contact,pickup_address,hours,is_open,delivery_fee,neighborhoods,theme,has_own_delivery,setup_complete)
        VALUES (?,?,?,'Produtos da nossa loja fictícia.',?,'Rua de Exemplo, 10','Segunda a sábado, 9h às 18h',0,0,'Centro','bakery',0,0)`,
        )
        .bind(storeId, slug, title, contact),
      db
        .prepare(
          "INSERT INTO store_memberships (store_id,user_id,role) VALUES (?,?,'owner')",
        )
        .bind(storeId, userId),
      db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await hash(cookieToken(request))),
      db
        .prepare(
          "INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at) VALUES (?,?,?,?)",
        )
        .bind(await hash(token), userId, csrf, now() + 28800),
      audit(db, storeId, userId, "STORE_REGISTERED", storeId),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: users.email"))
      throw new AppError(
        409,
        "Este e-mail já possui uma loja. Entre com a sua senha.",
        "EMAIL_IN_USE",
      );
    throw error;
  }
  return {
    csrfToken: csrf,
    setCookie: sessionCookie(token, request, 28800),
    next: "/painel/loja?tutorial=1",
  };
}
export async function logout(
  db: D1Database,
  request: Request,
  session: Session,
) {
  await db.batch([
    db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(session.token_hash),
    audit(db, session.store_id, session.user_id, "LOGOUT", session.user_id),
  ]);
  return sessionCookie("", request, 0);
}
