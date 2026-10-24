import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { getSession } from "./lib/auth";
import { demoAllowed } from "./lib/access";
import {
  clearLegacyCookies,
  cookieToken,
  needsCookieUpgrade,
  panelCookieName,
  sessionCookie,
} from "./lib/session-cookie";
import { now } from "./lib/core";

export const onRequest = defineMiddleware(async (context, next) => {
  const migration: {
    session: Awaited<ReturnType<typeof getSession>>;
    checked: boolean;
  } = {
    checked: false,
    session: null,
  };
  async function dispatch() {
    if (!(await demoAllowed(context.request, env.APP_MODE, env)))
      return new Response(
        "Demonstração indisponível neste endereço ou acesso não autorizado. Verifique a configuração do ambiente e do Cloudflare Access.",
        { status: 403 },
      );
    const panelPage =
      context.url.pathname.startsWith("/painel") &&
      !context.url.pathname.startsWith("/painel/api/v1/");
    if (panelPage || needsCookieUpgrade(context.request)) {
      const session = await getSession(env.DB, context.request);
      if (needsCookieUpgrade(context.request)) {
        migration.session = session;
        migration.checked = true;
      }
      if (panelPage) context.locals.session = session;
    }
    if (panelPage) {
      if (!context.locals.session && context.url.pathname !== "/painel/entrar")
        return context.redirect("/painel/entrar");
      if (context.locals.session && context.url.pathname === "/painel/entrar")
        return context.redirect(
          context.locals.session.role === "owner" &&
            !context.locals.session.store_setup_complete
            ? "/painel/loja?tutorial=1"
            : "/painel/pedidos",
        );
    }
    return next();
  }
  const response = await dispatch();
  const issuesSession = response.headers
    .get("Set-Cookie")
    ?.startsWith(`${panelCookieName(context.request)}=`);
  if (!issuesSession && migration.session && response.status < 400) {
    response.headers.append(
      "Set-Cookie",
      sessionCookie(
        cookieToken(context.request),
        context.request,
        Math.max(0, migration.session.session_expires_at - now()),
      ),
    );
  }
  if (
    issuesSession ||
    (migration.checked && (!migration.session || response.status < 400))
  )
    clearLegacyCookies(context.request, response.headers);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'${env.APP_MODE === "local-demo" ? " ws://localhost:* ws://127.0.0.1:*" : ""}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`,
  );
  return response;
});
