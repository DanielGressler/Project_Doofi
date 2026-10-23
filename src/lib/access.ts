import { createRemoteJWKSet, jwtVerify } from "jose";
import { localDemoAllowed } from "./core";

export interface DemoAccessConfig {
  DOOFI_DEMO_HOST?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const requestChecks = new WeakMap<
  Request,
  { signature: string; result: Promise<boolean> }
>();

export function demoAllowed(
  request: Request,
  mode: string,
  config: DemoAccessConfig = {},
) {
  // Middleware and API share only the verification of this exact request/config/token.
  const signature = JSON.stringify([
    mode,
    config.DOOFI_DEMO_HOST,
    config.CF_ACCESS_TEAM_DOMAIN,
    config.CF_ACCESS_AUD,
    request.headers.get("cf-access-jwt-assertion"),
  ]);
  const previous = requestChecks.get(request);
  if (previous?.signature === signature) return previous.result;
  const result = verifyDemoAccess(request, mode, config);
  requestChecks.set(request, { signature, result });
  return result;
}

async function verifyDemoAccess(
  request: Request,
  mode: string,
  config: DemoAccessConfig,
) {
  if (mode === "local-demo") return localDemoAllowed(request, mode);
  if (mode !== "staging-demo") return false;
  const url = new URL(request.url),
    host = config.DOOFI_DEMO_HOST?.toLowerCase().trim();
  const team = config.CF_ACCESS_TEAM_DOMAIN?.toLowerCase().trim(),
    audience = config.CF_ACCESS_AUD?.trim();
  // Reject unknown hosts, alternate preview URLs and missing Access configuration.
  if (
    url.protocol !== "https:" ||
    !host ||
    url.hostname !== host ||
    url.port ||
    !team ||
    !audience ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(team)
  )
    return false;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || token.length > 16384) return false;
  const issuer = `https://${team}`;
  try {
    let keys = keySets.get(issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
        timeoutDuration: 5000,
      });
      keySets.set(issuer, keys);
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience,
      algorithms: ["RS256"],
      clockTolerance: 5,
    });
    // Only interactive, identified participants are supported in this demonstration.
    return (
      typeof payload.email === "string" &&
      payload.email.length > 0 &&
      typeof payload.exp === "number"
    );
  } catch {
    return false;
  }
}
