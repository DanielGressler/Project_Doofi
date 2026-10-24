// Application authentication is limited to the merchant URL namespace.
// Cloudflare Access keeps its independent cookie and continues protecting all routes.
export const panelCookieName = (request: Request) =>
  new URL(request.url).protocol === "https:"
    ? "__Secure-doofi_panel"
    : "doofi_panel";
const legacyName = "doofi_session";
function values(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
}
export function cookieToken(request: Request) {
  const current = values(request, panelCookieName(request));
  // Never choose between two identically named cookies, or downgrade an invalid new cookie.
  const selected = current.length ? current : values(request, legacyName);
  return selected.length === 1 && /^[a-f0-9]{64}$/.test(selected[0])
    ? selected[0]
    : "";
}
export const needsCookieUpgrade = (request: Request) =>
  values(request, panelCookieName(request)).length === 0 &&
  values(request, legacyName).length > 0;
export const hasApplicationCookie = (request: Request) =>
  [panelCookieName(request), legacyName, "doofi_panel"].some(
    (name) => values(request, name).length > 0,
  );
export function clearApplicationCookies(request: Request, headers: Headers) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  for (const name of new Set([
    panelCookieName(request),
    "doofi_panel",
    legacyName,
  ]))
    for (const path of ["/", "/painel"])
      headers.append(
        "Set-Cookie",
        `${name}=; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
      );
}
export function sessionCookie(value: string, request: Request, maxAge: number) {
  return `${panelCookieName(request)}=${value}; Path=/painel; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function clearLegacyCookies(request: Request, headers: Headers) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  for (const path of ["/", "/painel"])
    headers.append(
      "Set-Cookie",
      `${legacyName}=; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
    );
}
