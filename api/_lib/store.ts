/**
 * The few Redis commands the API uses, behind one interface: Upstash REST in production
 * (ARCHITECTURE §6, ADR-3) and an in-memory store for local runs and tests.
 */
export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  /** Increment a counter; the first increment starts its expiry (seconds). */
  incr(key: string, ttlSeconds: number): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  /** Push to the front of a list and keep at most `keep` entries. */
  lpushTrim(key: string, value: string, keep: number): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

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
  async lpushTrim(key: string, value: string, keep: number) {
    const l = [value, ...(this.lists.get(key) ?? [])].slice(0, keep);
    this.lists.set(key, l);
  }
  async lrange(key: string, start: number, stop: number) {
    return (this.lists.get(key) ?? []).slice(start, stop + 1);
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
    const n = Number(await this.call("INCR", key));
    if (n === 1) await this.call("EXPIRE", key, ttlSeconds);
    return n;
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
  async lpushTrim(key: string, value: string, keep: number) {
    await this.call("LPUSH", key, value);
    await this.call("LTRIM", key, 0, keep - 1);
  }
  async lrange(key: string, start: number, stop: number) {
    return ((await this.call("LRANGE", key, start, stop)) as string[] | null) ?? [];
  }
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
