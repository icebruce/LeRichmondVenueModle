import {
  customRequestSchema,
  imageIdSchema,
  importedSchema,
  type CustomRequest,
  type Imported,
} from "../../src/domain/library/schema.js";
import type { Store } from "./store.js";

/** The couple's imported items (IMP-06), their photos (§6.3) and custom requests (REQ-01). */
const IMPORTS = "rs:imports";
const importKey = (id: string) => `rs:import:${id}`;
const REQUESTS = "rs:requests";
const requestKey = (id: string) => `rs:request:${id}`;
const imageKey = (id: string) => `rs:image:${id}`;

/** Photos arrive shrunk to ≤ 500 KB (ARCHITECTURE §6.3); a little slack for the encoder. */
export const MAX_IMAGE_BYTES = 600_000;
const IMAGE_TYPES = ["image/jpeg", "image/webp", "image/png"];

async function all(store: Store, index: string, key: (id: string) => string): Promise<unknown[]> {
  const ids = await store.smembers(index);
  const raws = await Promise.all(ids.map((id) => store.get(key(id))));
  return raws.filter((r): r is string => !!r).map((r) => JSON.parse(r) as unknown);
}

export async function listImports(store: Store): Promise<Imported[]> {
  return (await all(store, IMPORTS, importKey)).flatMap((x) => {
    const r = importedSchema.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

/** Saves a new import; one that already exists (a retried send) is left as it is. */
export async function createImport(store: Store, body: unknown): Promise<Imported | string> {
  const r = importedSchema.safeParse((body as { item?: unknown })?.item);
  if (!r.success) return "That is not a valid imported item";
  await store.sadd(IMPORTS, r.data.id);
  await store.setNew(importKey(r.data.id), JSON.stringify(r.data));
  return r.data;
}

/**
 * Removes an import from the library lists, or puts it back (Undo); scenarios that use it keep
 * showing it either way. A change older than the stored one is ignored.
 */
export async function setArchived(
  store: Store,
  id: string,
  archived: boolean,
  updatedAt: string,
): Promise<Imported | null> {
  const raw = await store.get(importKey(id));
  if (!raw) return null;
  const current = JSON.parse(raw) as Imported;
  if ((current.updatedAt ?? current.createdAt) >= updatedAt) return current;
  const item = { ...current, archived, updatedAt };
  await store.set(importKey(id), JSON.stringify(item));
  return item;
}

/** Stores a photo once under its id (ids are random, so a second write is a retry). */
export async function putImage(
  store: Store,
  id: string,
  type: string,
  bytes: ArrayBuffer,
): Promise<string | null> {
  if (!imageIdSchema.safeParse(id).success) return "That is not a valid image id";
  if (!IMAGE_TYPES.includes(type)) return "Photos must be JPEG, WebP or PNG";
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return "That photo is too large";
  await store.setNew(imageKey(id), `${type};base64,${Buffer.from(bytes).toString("base64")}`);
  return null;
}

export async function getImage(store: Store, id: string): Promise<{ type: string; bytes: Buffer } | null> {
  if (!imageIdSchema.safeParse(id).success) return null;
  const raw = await store.get(imageKey(id));
  if (!raw) return null;
  const [type, data] = raw.split(";base64,");
  return type && data ? { type, bytes: Buffer.from(data, "base64") } : null;
}

export async function listRequests(store: Store): Promise<CustomRequest[]> {
  return (await all(store, REQUESTS, requestKey)).flatMap((x) => {
    const r = customRequestSchema.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

/**
 * Saves a request, new or changed: the later `updatedAt` wins, so a partner's newer change is
 * never replaced by an older one sent late.
 */
export async function saveRequest(store: Store, body: unknown): Promise<CustomRequest | string> {
  const r = customRequestSchema.safeParse((body as { request?: unknown })?.request);
  if (!r.success) return "That is not a valid request";
  const raw = await store.get(requestKey(r.data.id));
  const current = raw ? customRequestSchema.safeParse(JSON.parse(raw)) : null;
  if (current?.success && current.data.updatedAt >= r.data.updatedAt) return current.data;
  await store.sadd(REQUESTS, r.data.id);
  await store.set(requestKey(r.data.id), JSON.stringify(r.data));
  return r.data;
}
