import { clearCookie } from "./_lib/auth.js";
import { isSecure, json } from "./_lib/http.js";

export async function POST(request: Request): Promise<Response> {
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie(isSecure(request)) });
}
