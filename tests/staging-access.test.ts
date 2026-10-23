import { afterEach, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { demoAllowed, type DemoAccessConfig } from "../src/lib/access";
import { handleApi } from "../src/lib/api";

let sequence = 0;
afterEach(() => vi.restoreAllMocks());
it("middleware e API reutilizam a verificação da mesma requisição sem autorizar outro token ou aplicação", async () => {
  const fixture = await accessFixture();
  const token = await fixture.sign();
  const request = fixture.request(token);
  const verify = vi.spyOn(crypto.subtle, "verify");
  expect(
    await Promise.all(
      Array.from({ length: 8 }, () =>
        demoAllowed(request, "staging-demo", fixture.config),
      ),
    ),
  ).toEqual(Array(8).fill(true));
  expect(verify).toHaveBeenCalledTimes(1);
  expect(
    await demoAllowed(fixture.request(token), "staging-demo", fixture.config),
  ).toBe(true);
  expect(verify).toHaveBeenCalledTimes(2);
  request.headers.set("cf-access-jwt-assertion", "forged-token");
  expect(await demoAllowed(request, "staging-demo", fixture.config)).toBe(
    false,
  );
  request.headers.set("cf-access-jwt-assertion", token);
  expect(
    await demoAllowed(request, "staging-demo", {
      ...fixture.config,
      CF_ACCESS_AUD: "different-app",
    }),
  ).toBe(false);
});
async function accessFixture() {
  const pair = await generateKeyPair("RS256", { modulusLength: 2048 });
  const jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: "demo-key",
    alg: "RS256",
    use: "sig",
  };
  const config: DemoAccessConfig = {
    DOOFI_DEMO_HOST: "project-doofi.example.workers.dev",
    CF_ACCESS_TEAM_DOMAIN: `doofi-test-${++sequence}.cloudflareaccess.com`,
    CF_ACCESS_AUD: "test-application",
  };
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => {
      expect(String(input)).toBe(
        `https://${config.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`,
      );
      return Response.json({ keys: [jwk] });
    });
  const sign = (
    overrides: Record<string, unknown> = {},
    key = pair.privateKey,
  ) =>
    new SignJWT({
      email: "convidado@exemplo.invalid",
      iss: `https://${config.CF_ACCESS_TEAM_DOMAIN}`,
      aud: config.CF_ACCESS_AUD,
      exp: Math.floor(Date.now() / 1000) + 600,
      ...overrides,
    })
      .setProtectedHeader({ alg: "RS256", kid: "demo-key" })
      .sign(key);
  const request = (
    token?: string,
    url = `https://${config.DOOFI_DEMO_HOST}/api/v1/health`,
  ) =>
    new Request(url, {
      headers: token ? { "cf-access-jwt-assertion": token } : {},
    });
  return { config, fetch, sign, request };
}
it("homologação exige JWT assinado com emissor e audiência da aplicação", async () => {
  const f = await accessFixture();
  const token = await f.sign();
  expect(await demoAllowed(f.request(token), "staging-demo", f.config)).toBe(
    true,
  );
  const health = await handleApi(
    f.request(token),
    env.DB,
    "staging-demo",
    f.config,
  );
  expect(health.status).toBe(200);
  expect(await health.json()).toMatchObject({
    database: "D1 homologação",
    mode: "synthetic-only",
  });
  expect(f.fetch).toHaveBeenCalledTimes(1);
});
it("não libera acesso por presença de cabeçalho, assinatura falsa, audiência ou emissor incorretos", async () => {
  const f = await accessFixture(),
    other = await generateKeyPair("RS256", { modulusLength: 2048 });
  const tokens = [
    "not-a-jwt",
    await f.sign({}, other.privateKey),
    await f.sign({ aud: "another-app" }),
    await f.sign({ iss: "https://another-team.cloudflareaccess.com" }),
  ];
  for (const token of tokens)
    expect(await demoAllowed(f.request(token), "staging-demo", f.config)).toBe(
      false,
    );
  expect(
    (await handleApi(f.request(), env.DB, "staging-demo", f.config)).status,
  ).toBe(403);
});
it("não aceita token expirado, sem vencimento ou sem identidade de participante", async () => {
  const f = await accessFixture();
  for (const claims of [
    { exp: 1 },
    { exp: undefined },
    { email: undefined },
    { email: "" },
  ])
    expect(
      await demoAllowed(
        f.request(await f.sign(claims)),
        "staging-demo",
        f.config,
      ),
    ).toBe(false);
});
it("bloqueia host alternativo, HTTP, porta não padrão e configuração incompleta sem buscar chaves", async () => {
  const f = await accessFixture(),
    token = await f.sign();
  for (const url of [
    "https://preview.example.workers.dev/",
    "http://project-doofi.example.workers.dev/",
    "https://project-doofi.example.workers.dev:8443/",
  ])
    expect(
      await demoAllowed(f.request(token, url), "staging-demo", f.config),
    ).toBe(false);
  for (const config of [
    {},
    { ...f.config, CF_ACCESS_AUD: "" },
    { ...f.config, CF_ACCESS_TEAM_DOMAIN: "untrusted.invalid" },
    { ...f.config, DOOFI_DEMO_HOST: "" },
  ])
    expect(await demoAllowed(f.request(token), "staging-demo", config)).toBe(
      false,
    );
  expect(f.fetch).not.toHaveBeenCalled();
});
it("falha ao obter as chaves mantém o acesso bloqueado", async () => {
  const f = await accessFixture();
  f.fetch.mockRejectedValue(new Error("unavailable"));
  expect(
    await demoAllowed(f.request(await f.sign()), "staging-demo", f.config),
  ).toBe(false);
});
it("origem e CSRF continuam exigidos na homologação e cookie de sessão é Secure", async () => {
  const f = await accessFixture(),
    token = await f.sign(),
    origin = `https://${f.config.DOOFI_DEMO_HOST}`;
  const login = await handleApi(
    new Request(`${origin}/api/v1/login`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "cf-access-jwt-assertion": token,
      },
      body: JSON.stringify({
        email: "forno@demo.doofi.test",
        password: "demo-doofi-P1!",
      }),
    }),
    env.DB,
    "staging-demo",
    f.config,
  );
  expect(login.status).toBe(200);
  expect(login.headers.get("set-cookie")).toContain("; Secure");
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const logout = await handleApi(
    new Request(`${origin}/api/v1/logout`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "cf-access-jwt-assertion": token,
        cookie,
      },
      body: "{}",
    }),
    env.DB,
    "staging-demo",
    f.config,
  );
  expect(logout.status).toBe(403);
  const foreign = await handleApi(
    new Request(`${origin}/api/v1/login`, {
      method: "POST",
      headers: {
        origin: "https://untrusted.invalid",
        "content-type": "application/json",
        "cf-access-jwt-assertion": token,
      },
      body: "{}",
    }),
    env.DB,
    "staging-demo",
    f.config,
  );
  expect(foreign.status).toBe(403);
});
it("modo local continua limitado ao loopback e modos desconhecidos ficam bloqueados", async () => {
  expect(
    await demoAllowed(new Request("http://localhost/"), "local-demo"),
  ).toBe(true);
  expect(
    await demoAllowed(new Request("https://public.example/"), "local-demo"),
  ).toBe(false);
  expect(
    await demoAllowed(new Request("http://localhost/"), "production"),
  ).toBe(false);
});
