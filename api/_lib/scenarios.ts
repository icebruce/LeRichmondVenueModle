import { scenarioSchema } from "../../src/domain/scenario/schema.js";
import type { Store } from "./store.js";

const INDEX = "rs:index";
const key = (id: string) => `rs:scenario:${id}`;
const versionsKey = (id: string) => `rs:versions:${id}`;
/** Versions kept per scenario (ARCHITECTURE §6.1). */
export const KEEP_VERSIONS = 50;

/** Validates a scenario body (ARCHITECTURE §6.1: shared zod schemas at the API boundary). */
export function parseBody(body: unknown): Record<string, unknown> | string {
  const s = (body as { scenario?: unknown })?.scenario;
  const r = scenarioSchema.safeParse(s);
  return r.success ? (r.data as Record<string, unknown>) : "That is not a valid scenario";
}

/** Scenario id from /api/scenarios/<id>[/...] (or the `id` query Vercel may add for [id] routes). */
export function idFrom(request: Request): string {
  const url = new URL(request.url);
  return url.searchParams.get("id") ?? decodeURIComponent(url.pathname.split("/")[3] ?? "");
}

const parse = (raw: string | null) => (raw ? (JSON.parse(raw) as Record<string, unknown>) : null);

export async function list(store: Store): Promise<Record<string, unknown>[]> {
  const ids = await store.smembers(INDEX);
  const all = await Promise.all(ids.map((id) => store.get(key(id))));
  return all.map(parse).filter((x): x is Record<string, unknown> => !!x);
}

export async function read(store: Store, id: string): Promise<Record<string, unknown> | null> {
  return parse(await store.get(key(id)));
}

export async function create(
  store: Store,
  scenario: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const id = String(scenario.id);
  const saved = { ...scenario, revision: 1 };
  // Index first: a list skips ids without a scenario, so a failed write never hides one that exists.
  await store.sadd(INDEX, id);
  if (!(await store.setNew(key(id), JSON.stringify(saved)))) return null;
  return saved;
}

/**
 * Saves a new revision if `ifMatch` is the current one (SCN-03); otherwise returns the server copy
 * so the app can offer keep mine / take theirs / save mine as a copy. The replaced revision goes to
 * the history (SCN-04).
 */
export async function update(
  store: Store,
  id: string,
  ifMatch: number,
  scenario: Record<string, unknown>,
): Promise<
  { ok: true; saved: Record<string, unknown> } | { ok: false; current: Record<string, unknown> | null }
> {
  const saved = { ...scenario, id, revision: ifMatch + 1 };
  const r = await store.casSave(key(id), versionsKey(id), ifMatch, JSON.stringify(saved), KEEP_VERSIONS);
  return r.ok ? { ok: true, saved } : { ok: false, current: parse(r.current) };
}

/**
 * Deletes the scenario and its history if `ifMatch` is the current revision; otherwise returns the
 * newer server copy, so a partner's later work is never removed unseen.
 */
export async function remove(
  store: Store,
  id: string,
  ifMatch: number,
): Promise<{ ok: true } | { ok: false; current: Record<string, unknown> | null }> {
  const r = await store.casDelete(key(id), versionsKey(id), ifMatch);
  if (!r.ok) return { ok: false, current: parse(r.current) };
  await store.srem(INDEX, id);
  return { ok: true };
}

export async function versions(store: Store, id: string): Promise<Record<string, unknown>[]> {
  return (await store.lrange(versionsKey(id), 0, KEEP_VERSIONS - 1)).map(
    (v) => JSON.parse(v) as Record<string, unknown>,
  );
}

/** Makes an earlier revision current again, as a new revision (the replaced one is kept). */
export async function restore(
  store: Store,
  id: string,
  revision: number,
): Promise<Record<string, unknown> | null> {
  const old = (await versions(store, id)).find((v) => v.revision === revision);
  const current = await read(store, id);
  if (!old || !current) return null;
  const r = await update(store, id, current.revision as number, {
    ...old,
    updatedAt: new Date().toISOString(),
  });
  return r.ok ? r.saved : null;
}
