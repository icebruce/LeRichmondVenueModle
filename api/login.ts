import { LOGIN_TRIES, LOGIN_WINDOW_S, sameSecret, sessionCookie } from "./_lib/auth.js";
import { context, isSecure, json } from "./_lib/http.js";

/** Shared password → 30-day session cookie; wrong passwords are rate-limited per address (ACC-01). */
export async function POST(request: Request): Promise<Response> {
  const ctx = context();
  if (ctx instanceof Response) return ctx;
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0]?.trim() || "local";
  const limitKey = `rs:login:${ip}`;
  // Count the try before checking it, so parallel guesses cannot slip past the limit.
  const tries = await ctx.store.incr(limitKey, LOGIN_WINDOW_S);
  if (tries > LOGIN_TRIES)
    return json({ message: "Too many tries. Wait 15 minutes, then try again." }, 429, {
      "Retry-After": String(LOGIN_WINDOW_S),
    });
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (!body) return json({ message: "Enter the password" }, 400);
  const password = String(body.password ?? "");
  if (!(await sameSecret(password, ctx.cfg.password)))
    return json({ message: "That password isn't right" }, 401);
  await ctx.store.del(limitKey);
  return json({ ok: true }, 200, {
    "Set-Cookie": await sessionCookie(ctx.cfg, Date.now(), isSecure(request)),
  });
}
