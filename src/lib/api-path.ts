const authentication = new Set(["login", "register", "logout", "session"]);
export function apiUrl(resource: string) {
  if (resource.startsWith("painel/"))
    return `/painel/api/v1/${resource.slice(7)}`;
  return authentication.has(resource)
    ? `/painel/api/v1/${resource}`
    : `/api/v1/${resource}`;
}
export function apiResource(pathname: string) {
  const panel = pathname.startsWith("/painel/api/v1/");
  const resource = pathname
    .replace(/^\/(?:painel\/)?api\/v1\//, "")
    .replace(/\/$/, "");
  return panel && !authentication.has(resource)
    ? `painel/${resource}`
    : resource;
}
