import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleApi } from "../../../../lib/api";

export const ALL: APIRoute = ({ request }) =>
  handleApi(request, env.DB, env.APP_MODE, env);
