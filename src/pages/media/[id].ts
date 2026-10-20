import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { getSession } from "../../lib/auth";
export const GET = async ({
  params,
  request,
}: Pick<APIContext, "params" | "request">) => {
  if (!/^[a-f0-9-]{36}$/.test(params.id ?? ""))
    return new Response(null, { status: 404 });
  const session = await getSession(env.DB, request);
  const row = await env.DB.prepare(
    `SELECT m.data FROM media_assets m JOIN stores s ON s.id=m.store_id AND s.active=1
    WHERE m.id=? AND (EXISTS(SELECT 1 FROM products p WHERE p.image_id=m.id AND p.store_id=m.store_id) OR s.banner_id=m.id OR m.store_id=?)`,
  )
    .bind(params.id!, session?.store_id ?? "")
    .first<{ data: ArrayBuffer | number[] }>();
  if (!row) return new Response(null, { status: 404 });
  const bytes = Array.isArray(row.data) ? new Uint8Array(row.data) : row.data;
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
