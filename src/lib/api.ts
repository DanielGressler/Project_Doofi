import { AppError, body, originCheck, rateLimit } from "./core";
import { getSession, login, logout, register, requireSession } from "./auth";
import { getProducts, getStore, saveProduct, saveStore } from "./catalog";
import {
  confirmSimulatedPayment,
  createOrder,
  customerAction,
  issueIntent,
  orderDetails,
  ownedOrder,
  proposeQuote,
  publicStatus,
  transition,
} from "./orders";
import type { Store } from "./types";
import {
  getDashboard,
  getOrderSummary,
  recentOrdersStatement,
} from "./dashboard";
import { demoAllowed, type DemoAccessConfig } from "./access";
import { publicProduct, publicStore } from "./public-data";
import { apiResource } from "./api-path";
import { panelOrder, panelProduct, panelStore } from "./panel-data";

const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
export async function handleApi(
  request: Request,
  db: D1Database,
  mode: string,
  access: DemoAccessConfig = {},
) {
  try {
    if (!(await demoAllowed(request, mode, access)))
      throw new AppError(
        403,
        "Endereço ou acesso não autorizado para esta demonstração.",
      );
    const path = apiResource(new URL(request.url).pathname);
    const method = request.method;
    const mutates = !["GET", "HEAD"].includes(method);
    if (mutates) originCheck(request);
    if (path === "health" && method === "GET") {
      await db.prepare("SELECT 1").first();
      return json({
        ok: true,
        mode: "synthetic-only",
        database: mode === "local-demo" ? "D1 local" : "D1 homologação",
      });
    }
    if (path === "session" && method === "GET") {
      const session = await getSession(db, request);
      return json(
        session
          ? {
              authenticated: true,
              csrfToken: session.csrf_token,
              email: session.email,
              storeId: session.store_id,
            }
          : { authenticated: false },
      );
    }
    if (path === "login" && method === "POST") {
      await rateLimit(db, request, "login", 10);
      const result = await login(db, request, await body(request));
      return json(
        { authenticated: true, csrfToken: result.csrfToken, next: result.next },
        200,
        {
          "Set-Cookie": result.setCookie,
        },
      );
    }
    if (path === "register" && method === "POST") {
      await rateLimit(db, request, "register", 5);
      const result = await register(db, request, await body(request));
      return json({ authenticated: true, next: result.next }, 201, {
        "Set-Cookie": result.setCookie,
      });
    }
    if (path === "logout" && method === "POST") {
      const session = await requireSession(db, request, true);
      return json({ authenticated: false }, 200, {
        "Set-Cookie": await logout(db, request, session),
      });
    }
    let match = path.match(/^lojas\/([a-z0-9-]+)(?:\/(intent|pedidos))?$/);
    if (match) {
      const [, slug, resource] = match;
      if (!resource && method === "GET") {
        const store = await getStore(db, slug);
        return json({
          store: publicStore(store),
          products: (await getProducts(db, store.id)).map(publicProduct),
        });
      }
      if (resource === "intent" && method === "POST") {
        await body(request);
        await rateLimit(db, request, "intent");
        return json(await issueIntent(db, slug), 201);
      }
      if (resource === "pedidos" && method === "POST") {
        await rateLimit(db, request, "checkout");
        return json(await createOrder(db, slug, await body(request)), 201);
      }
    }
    match = path.match(
      /^pedidos\/([a-f0-9]{64})(?:\/(accept-quote|reject-quote|declare-payment))?$/,
    );
    if (match) {
      await rateLimit(db, request, "tracking", 240);
      if (!match[2] && method === "GET")
        return json(await publicStatus(db, match[1]));
      if (match[2] && method === "POST")
        return json(
          await customerAction(db, match[1], match[2], await body(request)),
        );
    }
    if (path.startsWith("painel/")) {
      const session = await requireSession(db, request, mutates);
      if (mutates)
        await rateLimit(db, request, `panel:${session.store_id}`, 100);
      if (path === "painel/imagens" && method === "POST") {
        await rateLimit(db, request, `upload:${session.store_id}`, 10);
        const { uploadImage } = await import("./media");
        return json(
          await uploadImage(
            db,
            session,
            request,
            new URL(request.url).searchParams.get("kind") ?? "",
          ),
          201,
        );
      }
      if (path === "painel/loja") {
        if (method === "GET")
          return json(
            panelStore(
              (await db
                .prepare("SELECT * FROM stores WHERE id=?")
                .bind(session.store_id)
                .first<Store>())!,
            ),
          );
        if (method === "PATCH")
          return json(await saveStore(db, session, await body(request)));
      }
      if (path === "painel/catalogo" && method === "GET")
        return json(
          (await getProducts(db, session.store_id)).map(panelProduct),
        );
      if (path === "painel/produtos" && method === "POST")
        return json(await saveProduct(db, session, await body(request)), 201);
      match = path.match(/^painel\/produtos\/([^/]+)$/);
      if (match && method === "PATCH")
        return json(
          await saveProduct(db, session, await body(request), match[1]),
        );
      if (path === "painel/visao-geral" && method === "GET")
        return json(await getDashboard(db, session.store_id));
      if (path === "painel/resumo" && method === "GET")
        return json(await getOrderSummary(db, session.store_id));
      if (path === "painel/pedidos" && method === "GET")
        return json(
          (await recentOrdersStatement(db, session.store_id).all()).results,
        );
      match = path.match(
        /^painel\/pedidos\/([^/]+)(?:\/(transicoes|cotacao|simular-conferencia|auditoria))?$/,
      );
      if (match) {
        const [, id, action] = match;
        if (!action && method === "GET") {
          const order = await ownedOrder(db, session, id);
          return json({
            ...panelOrder(order),
            ...(await orderDetails(db, order)),
          });
        }
        if (action === "auditoria" && method === "GET") {
          await ownedOrder(db, session, id);
          return json(
            (
              await db
                .prepare(
                  "SELECT action,actor_id,metadata,created_at,correlation_id FROM audit_events WHERE store_id=? AND entity_id=? ORDER BY created_at,rowid",
                )
                .bind(session.store_id, id)
                .all()
            ).results,
          );
        }
        if (action === "transicoes" && method === "POST")
          return json(await transition(db, session, id, await body(request)));
        if (action === "cotacao" && method === "POST")
          return json(await proposeQuote(db, session, id, await body(request)));
        if (action === "simular-conferencia" && method === "POST")
          return json(
            await confirmSimulatedPayment(db, session, id, await body(request)),
          );
      }
    }
    throw new AppError(404, "Recurso não encontrado.");
  } catch (error) {
    if (error instanceof AppError)
      return json(
        { error: error.message, code: error.code },
        error.status,
        error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {},
      );
    const correlationId = crypto.randomUUID();
    console.error(
      JSON.stringify({
        event: "REQUEST_FAILED",
        correlationId,
        errorType: error instanceof Error ? error.name : "Unknown",
      }),
    );
    return json(
      {
        error: "Não foi possível concluir a operação. Tente novamente.",
        code: "INTERNAL",
        correlationId,
      },
      500,
    );
  }
}
