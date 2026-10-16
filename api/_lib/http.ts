import { type Config, config, sameSecret, validSession } from "./auth.js";
import { type Store, getStore } from "./store.js";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

/** Secure cookies everywhere except plain-http local runs. */
export function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

export type Ctx = { store: Store; cfg: Config };

/** Cloud set up (password, secret, storage)? Otherwise 503 tells the app to stay local. */
export function context(): Ctx | Response {
  const cfg = config();
  const store = getStore();
  if (!cfg || !store) return json({ configured: false, message: "Cloud saving is not set up yet" }, 503);
  return { cfg, store };
}

/** Runs `handler` for a signed-in request; 401 otherwise. */
export async function signedIn(
  request: Request,
  handler: (ctx: Ctx) => Promise<Response>,
): Promise<Response> {
  const ctx = context();
  if (ctx instanceof Response) return ctx;
  if (!(await validSession(ctx.cfg, request.headers.get("cookie"))))
    return json({ message: "Please sign in" }, 401);
  try {
    return await handler(ctx);
  } catch (e) {
    console.error(e);
    return json({ message: "Something went wrong saving. Your changes are kept on this device." }, 500);
  }
}

/**
 * Runs `handler` for a signed-in request, or for Claude's read-only token (REQ-03,
 * `LIBRARY_REQUESTS_TOKEN`, at least 24 characters, never in Git): reads of requests and their photos.
 */
export async function signedInOrToken(
  request: Request,
  handler: (ctx: Ctx) => Promise<Response>,
): Promise<Response> {
  const token = process.env.LIBRARY_REQUESTS_TOKEN;
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (token && token.length >= 24 && bearer && (await sameSecret(bearer, token))) {
    const store = getStore();
    if (!store) return json({ configured: false, message: "Cloud saving is not set up yet" }, 503);
    try {
      return await handler({ store, cfg: config() ?? { password: "", secret: "" } });
    } catch (e) {
      console.error(e);
      return json({ message: "Something went wrong" }, 500);
    }
  }
  return signedIn(request, handler);
}

/** The id at the end of /api/<collection>/<id> (or the `id` query Vercel may add for [id] routes). */
export function idFrom(request: Request): string {
  const url = new URL(request.url);
  return url.searchParams.get("id") ?? decodeURIComponent(url.pathname.split("/")[3] ?? "");
}
