import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { getSession } from "./lib/auth";
import { demoAllowed } from "./lib/access";

export const onRequest = defineMiddleware(async (context, next) => {
  async function dispatch() {
    if (!(await demoAllowed(context.request, env.APP_MODE, env)))
      return new Response(
        "Demonstração indisponível neste endereço ou acesso não autorizado. Verifique a configuração do ambiente e do Cloudflare Access.",
        { status: 403 },
      );
    if (context.url.pathname.startsWith("/painel")) {
      context.locals.session = await getSession(env.DB, context.request);
      if (!context.locals.session && context.url.pathname !== "/painel/entrar")
        return context.redirect("/painel/entrar");
      if (context.locals.session && context.url.pathname === "/painel/entrar")
        return context.redirect("/painel/pedidos");
    }
    return next();
  }
  const response = await dispatch();
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
