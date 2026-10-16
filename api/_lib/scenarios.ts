import { scenarioSchema } from "../../src/domain/scenario/schema.js";
import type { Store } from "./store.js";

export type Stored = {
  revision: number;
  updatedAt: string;
  updatedBy?: string;
  scenario: Record<string, unknown>;
};
export type Version = { revision: number; updatedAt: string; updatedBy?: string };

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

/** Scenario id from /api/scenarios/<id>[/...]. */
export function idFrom(request: Request): string {
  return decodeURIComponent(new URL(request.url).pathname.split("/")[3] ?? "");
}

export async function list(store: Store): Promise<Record<string, unknown>[]> {
  const ids = await store.smembers(INDEX);
  const all = await Promise.all(ids.map((id) => store.get(key(id))));
  return all.filter((x): x is string => !!x).map((x) => JSON.parse(x) as Record<string, unknown>);
}

export async function read(store: Store, id: string): Promise<Record<string, unknown> | null> {
  const raw = await store.get(key(id));
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

export async function create(
  store: Store,
  scenario: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const id = String(scenario.id);
  if (await store.get(key(id))) return null;
  const saved = { ...scenario, revision: 1 };
  await store.set(key(id), JSON.stringify(saved));
  await store.sadd(INDEX, id);
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
  const current = await read(store, id);
  if (!current || current.revision !== ifMatch) return { ok: false, current };
  await store.lpushTrim(versionsKey(id), JSON.stringify(current), KEEP_VERSIONS);
  const saved = { ...scenario, id, revision: ifMatch + 1 };
  await store.set(key(id), JSON.stringify(saved));
  return { ok: true, saved };
}

export async function remove(store: Store, id: string): Promise<void> {
  await store.del(key(id));
  await store.srem(INDEX, id);
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
