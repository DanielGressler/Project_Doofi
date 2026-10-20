import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { getSession } from "./lib/auth";
import { localDemoAllowed } from "./lib/core";

export const onRequest = defineMiddleware(async (context, next) => {
  if (!localDemoAllowed(context.request, env.APP_MODE))
    return new Response(
      "P1 disponível somente em ambiente local. Configure homologação protegida antes de publicar.",
      { status: 403 },
    );
  if (context.url.pathname.startsWith("/painel")) {
    context.locals.session = await getSession(env.DB, context.request);
    if (!context.locals.session && context.url.pathname !== "/painel/entrar")
      return context.redirect("/painel/entrar");
    if (context.locals.session && context.url.pathname === "/painel/entrar")
      return context.redirect("/painel/pedidos");
  }
  const response = await next();
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  );
  return response;
});
