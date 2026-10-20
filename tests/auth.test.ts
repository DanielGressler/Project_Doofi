import { it, expect } from "vitest";
import { env } from "cloudflare:workers";
import { login, getSession, logout, requireSession } from "../src/lib/auth";

it("S0-03 · autentica, isola A/B e revoga sessão no D1", async () => {
  const request = new Request("http://localhost/painel/entrar");
  const result = await login(env.DB, request, {
    email: "forno@demo.doofi.test",
    password: "demo-doofi-P1!",
  });
  expect(result.setCookie).toContain("HttpOnly");
  expect(result.setCookie).toContain("SameSite=Strict");
  const authed = new Request(request, {
    headers: {
      cookie: result.setCookie.split(";")[0],
      "x-csrf-token": result.csrfToken,
    },
  });
  const session = await requireSession(env.DB, authed, true);
  expect(session.store_id).toBe("store-a");
  expect(
    await env.DB.prepare(
      "SELECT id FROM products WHERE store_id=? AND id='b-bowl'",
    )
      .bind(session.store_id)
      .first(),
  ).toBeNull();
  await expect(
    requireSession(
      env.DB,
      new Request(request, { headers: { cookie: result.setCookie } }),
      true,
    ),
  ).rejects.toThrow("formulário");
  await logout(env.DB, authed, session);
  expect(await getSession(env.DB, authed)).toBeNull();
});
