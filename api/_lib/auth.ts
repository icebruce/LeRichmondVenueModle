/** Shared-password sessions (ACC-01, ARCHITECTURE §8): signed httpOnly cookie, 30 days. */

export const COOKIE = "rs_session";
export const SESSION_DAYS = 30;
/** Wrong passwords allowed per address before a 15-minute wait. */
export const LOGIN_TRIES = 8;
export const LOGIN_WINDOW_S = 15 * 60;

export type Config = { password: string; secret: string };

export function config(env: Record<string, string | undefined> = process.env): Config | null {
  const password = env.APP_PASSWORD;
  const secret = env.SESSION_SECRET;
  if (!password || !secret || secret.length < 32) return null;
  return { password, secret };
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

/** Compares two strings in time independent of where they differ (both hashed first). */
export async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const p = new Uint8Array(x);
  const q = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= (p[i] ?? 0) ^ (q[i] ?? 0);
  return diff === 0;
}

export async function sessionCookie(cfg: Config, now = Date.now(), secure = true): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_DAYS * 86400;
  const value = `${exp}.${await hmac(cfg.secret, `v1.${exp}`)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

export function clearCookie(secure = true): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export async function validSession(
  cfg: Config,
  cookieHeader: string | null,
  now = Date.now(),
): Promise<boolean> {
  const value = cookieHeader
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) * 1000 <= now) return false;
  return sameSecret(sig, await hmac(cfg.secret, `v1.${exp}`));
}
