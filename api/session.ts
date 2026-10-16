import { validSession } from "./_lib/auth.js";
import { context, json } from "./_lib/http.js";

/** 200 signed in · 401 sign in needed · 503 cloud not set up (the app stays local). */
export async function GET(request: Request): Promise<Response> {
  const ctx = context();
  if (ctx instanceof Response) return ctx;
  const ok = await validSession(ctx.cfg, request.headers.get("cookie"));
  return ok ? json({ ok: true }) : json({ message: "Please sign in" }, 401);
}
