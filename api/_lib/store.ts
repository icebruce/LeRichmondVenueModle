/**
 * The few Redis commands the API uses, behind one interface: Upstash REST in production
 * (ARCHITECTURE §6, ADR-3) and an in-memory store for local runs and tests.
 */
/** Outcome of a compare-and-set: done, or refused with the value that is there now. */
export type Cas = { ok: true } | { ok: false; current: string | null };

export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  /** Increment a counter; the first increment starts its expiry (seconds). One atomic step. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  /** Set `key` only if it does not exist yet. */
  setNew(key: string, value: string): Promise<boolean>;
  /**
   * One atomic step (SCN-03): if the JSON at `key` has `revision === ifMatch`, push it to the front
   * of `history` (keeping `keep`) and store `value`; otherwise change nothing.
   */
  casSave(key: string, history: string, ifMatch: number, value: string, keep: number): Promise<Cas>;
  /** One atomic step: delete `key` and `history` if the JSON at `key` has `revision === ifMatch`. */
  casDelete(key: string, history: string, ifMatch: number): Promise<Cas>;
}

const revisionOf = (raw: string): unknown => (JSON.parse(raw) as { revision?: unknown }).revision;

/** Lua for Upstash (Redis EVAL): the same steps as MemoryStore, run atomically on the server. */
const LUA = {
  incr: `local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`,
  casSave: `local cur = redis.call('GET', KEYS[1])
if not cur then return {0, false} end
if cjson.decode(cur).revision ~= tonumber(ARGV[1]) then return {0, cur} end
redis.call('LPUSH', KEYS[2], cur)
redis.call('LTRIM', KEYS[2], 0, tonumber(ARGV[3]) - 1)
redis.call('SET', KEYS[1], ARGV[2])
return {1, false}`,
  casDelete: `local cur = redis.call('GET', KEYS[1])
if not cur then return {1, false} end
if cjson.decode(cur).revision ~= tonumber(ARGV[1]) then return {0, cur} end
redis.call('DEL', KEYS[1], KEYS[2])
return {1, false}`,
};

export class MemoryStore implements Store {
  private values = new Map<string, string>();
  private sets = new Map<string, Set<string>>();
  private lists = new Map<string, string[]>();
  private expiry = new Map<string, number>();

  private live(key: string) {
    const until = this.expiry.get(key);
    if (until !== undefined && until <= Date.now()) {
      this.values.delete(key);
      this.expiry.delete(key);
    }
  }
  async get(key: string) {
    this.live(key);
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.values.set(key, value);
  }
  async del(key: string) {
    this.values.delete(key);
    this.lists.delete(key);
    this.sets.delete(key);
  }
  async incr(key: string, ttlSeconds: number) {
    this.live(key);
    const n = Number(this.values.get(key) ?? 0) + 1;
    this.values.set(key, String(n));
    if (n === 1) this.expiry.set(key, Date.now() + ttlSeconds * 1000);
    return n;
  }
  async sadd(key: string, member: string) {
    const s = this.sets.get(key) ?? new Set<string>();
    s.add(member);
    this.sets.set(key, s);
  }
  async srem(key: string, member: string) {
    this.sets.get(key)?.delete(member);
  }
  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }
  async lrange(key: string, start: number, stop: number) {
    return (this.lists.get(key) ?? []).slice(start, stop + 1);
  }
  // Each body below runs without awaiting, so it is atomic like the Lua scripts.
  async setNew(key: string, value: string) {
    if (this.values.has(key)) return false;
    this.values.set(key, value);
    return true;
  }
  async casSave(key: string, history: string, ifMatch: number, value: string, keep: number): Promise<Cas> {
    const cur = this.values.get(key) ?? null;
    if (cur === null || revisionOf(cur) !== ifMatch) return { ok: false, current: cur };
    this.lists.set(history, [cur, ...(this.lists.get(history) ?? [])].slice(0, keep));
    this.values.set(key, value);
    return { ok: true };
  }
  async casDelete(key: string, history: string, ifMatch: number): Promise<Cas> {
    const cur = this.values.get(key) ?? null;
    if (cur === null) return { ok: true };
    if (revisionOf(cur) !== ifMatch) return { ok: false, current: cur };
    this.values.delete(key);
    this.lists.delete(history);
    return { ok: true };
  }
}

/** Upstash Redis over its REST API (no SDK): POST a command array, read `result`. */
export class UpstashStore implements Store {
  constructor(
    private url: string,
    private token: string,
  ) {}
  private async call(...command: (string | number)[]): Promise<unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (!res.ok || body.error) throw new Error(`Storage error: ${body.error ?? res.status}`);
    return body.result;
  }
  async get(key: string) {
    return ((await this.call("GET", key)) as string | null) ?? null;
  }
  async set(key: string, value: string) {
    await this.call("SET", key, value);
  }
  async del(key: string) {
    await this.call("DEL", key);
  }
  async incr(key: string, ttlSeconds: number) {
    return Number(await this.call("EVAL", LUA.incr, 1, key, ttlSeconds));
  }
  async sadd(key: string, member: string) {
    await this.call("SADD", key, member);
  }
  async srem(key: string, member: string) {
    await this.call("SREM", key, member);
  }
  async smembers(key: string) {
    return ((await this.call("SMEMBERS", key)) as string[] | null) ?? [];
  }
  async lrange(key: string, start: number, stop: number) {
    return ((await this.call("LRANGE", key, start, stop)) as string[] | null) ?? [];
  }
  async setNew(key: string, value: string) {
    return (await this.call("SET", key, value, "NX")) === "OK";
  }
  async casSave(key: string, history: string, ifMatch: number, value: string, keep: number) {
    return casReply(await this.call("EVAL", LUA.casSave, 2, key, history, ifMatch, value, keep));
  }
  async casDelete(key: string, history: string, ifMatch: number) {
    return casReply(await this.call("EVAL", LUA.casDelete, 2, key, history, ifMatch));
  }
}

/** The scripts reply [1, nil] when done, [0, current or nil] when refused. */
function casReply(reply: unknown): Cas {
  const [done, current] = reply as [number, string | null];
  return done === 1 ? { ok: true } : { ok: false, current: current ?? null };
}

let memory: MemoryStore | null = null;

/** Tests: start from an empty in-memory store. */
export function resetMemoryStore(): void {
  memory = null;
}

/** The configured store, or null when cloud saving is not set up (the app then stays local). */
export function getStore(env: Record<string, string | undefined> = process.env): Store | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (url && token) return new UpstashStore(url, token);
  if (env.RS_MEMORY_STORE === "1") return (memory ??= new MemoryStore());
  return null;
}
