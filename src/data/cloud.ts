import { get, set } from "idb-keyval";
import { parseScenario, venueSampleScenario } from "../domain/scenario/scenario";
import type { Scenario, VersionInfo } from "../domain/scenario/schema";
import type { Editor } from "../state/editor";

/** The network is unreachable: keep working locally and retry (SCN-09). */
export class Offline extends Error {}
/** Signed out (the session expired or the password changed). */
export class SignedOut extends Error {}

export type SessionStatus = "on" | "signin" | "off";

/** Thin client for the API in `api/` (ARCHITECTURE §6.1). `fetchFn` is replaceable for tests. */
export class CloudApi {
  constructor(private fetchFn: typeof fetch = (...a) => fetch(...a)) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(path, {
        ...init,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...init.headers },
      });
    } catch {
      throw new Offline("Offline");
    }
    if (res.status === 401) throw new SignedOut("Please sign in");
    return res;
  }

  /** "off" when the API is absent or not set up: the app saves on this device only. */
  async session(): Promise<SessionStatus> {
    try {
      const res = await this.request("/api/session");
      // A static host answers unknown paths with the app's HTML: only a real API reply counts.
      const body = res.ok ? ((await res.json().catch(() => null)) as { ok?: boolean } | null) : null;
      return body?.ok === true ? "on" : "off";
    } catch (e) {
      // Offline at start: work locally and share once the connection is back (SCN-09).
      return e instanceof SignedOut ? "signin" : "on";
    }
  }

  /** null when signed in, else the message to show. */
  async login(password: string): Promise<string | null> {
    try {
      const res = await this.request("/api/login", { method: "POST", body: JSON.stringify({ password }) });
      if (res.ok) return null;
      return ((await res.json().catch(() => ({}))) as { message?: string }).message ?? "Couldn't sign in";
    } catch (e) {
      return e instanceof SignedOut
        ? "That password isn't right"
        : "Can't reach the studio. Check the connection.";
    }
  }

  /** The shared scenarios, and the ids of any this version of the app cannot read. */
  async list(): Promise<{ scenarios: Scenario[]; unreadable: string[] }> {
    const res = await this.request("/api/scenarios");
    if (!res.ok) throw new Error(`List failed (${res.status})`);
    const body = (await res.json()) as { scenarios: unknown[] };
    const scenarios: Scenario[] = [];
    const unreadable: string[] = [];
    // One unreadable scenario (say, from a newer version of the app) must not stop the others.
    for (const raw of body.scenarios) {
      try {
        scenarios.push(parseScenario(raw));
      } catch (e) {
        console.error(e);
        unreadable.push(String((raw as { id?: unknown })?.id ?? ""));
      }
    }
    return { scenarios, unreadable };
  }

  async get(id: string): Promise<Scenario | null> {
    const res = await this.request(`/api/scenarios/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Read failed (${res.status})`);
    return parseScenario(((await res.json()) as { scenario: unknown }).scenario);
  }

  async create(s: Scenario): Promise<Scenario | "exists"> {
    const res = await this.request("/api/scenarios", {
      method: "POST",
      body: JSON.stringify({ scenario: s }),
    });
    if (res.status === 409) return "exists";
    if (!res.ok) throw new Error(`Create failed (${res.status})`);
    return parseScenario(((await res.json()) as { scenario: unknown }).scenario);
  }

  async save(
    s: Scenario,
    ifMatch: number,
  ): Promise<{ ok: true; saved: Scenario } | { ok: false; current: Scenario | null }> {
    const res = await this.request(`/api/scenarios/${encodeURIComponent(s.id)}`, {
      method: "PUT",
      headers: { "If-Match": String(ifMatch) },
      body: JSON.stringify({ scenario: s }),
    });
    if (res.status === 404) return { ok: false, current: null };
    const body = (await res.json()) as { scenario: unknown };
    if (res.status === 409) return { ok: false, current: parseScenario(body.scenario) };
    if (!res.ok) throw new Error(`Save failed (${res.status})`);
    return { ok: true, saved: parseScenario(body.scenario) };
  }

  /** Deletes revision `ifMatch`; refused with the newer copy if the partner saved since. */
  async remove(id: string, ifMatch: number): Promise<{ ok: true } | { ok: false; current: Scenario | null }> {
    const res = await this.request(`/api/scenarios/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "If-Match": String(ifMatch) },
    });
    if (res.status === 409)
      return { ok: false, current: parseScenario(((await res.json()) as { scenario: unknown }).scenario) };
    if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    return { ok: true };
  }

  async versions(id: string): Promise<VersionInfo[]> {
    const res = await this.request(`/api/scenarios/${encodeURIComponent(id)}/versions`);
    return res.ok ? ((await res.json()) as { versions: VersionInfo[] }).versions : [];
  }

  async restore(id: string, revision: number): Promise<Scenario | null> {
    const res = await this.request(`/api/scenarios/${encodeURIComponent(id)}/versions`, {
      method: "POST",
      body: JSON.stringify({ revision }),
    });
    return res.ok ? parseScenario(((await res.json()) as { scenario: unknown }).scenario) : null;
  }
}

/** JSON with sorted keys, so equal scenarios compare equal whatever order their keys were added in. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

/** Same content, ignoring bookkeeping (revision, times, author) and optionally notes. */
export function sameContent(a: Scenario, b: Scenario, ignoreNotes = false): boolean {
  const skip = new Set(["revision", "updatedAt", "updatedBy", ...(ignoreNotes ? ["notes"] : [])]);
  const strip = (s: Scenario) => Object.fromEntries(Object.entries(s).filter(([k]) => !skip.has(k)));
  return stable(strip(a)) === stable(strip(b));
}

function mergeNotes(a: Scenario["notes"], b: Scenario["notes"]): Scenario["notes"] {
  const byId = new Map([...a, ...b].map((n) => [n.id, n]));
  return [...byId.values()].sort((x, y) => x.at.localeCompare(y.at));
}

const BASES_KEY = "richmond-studio/sync/v1";
const DEBOUNCE_MS = 1500;
const RETRY_MS = 10_000;

type Conflict = { id: string; theirs: Scenario };

/**
 * Keeps this device's scenarios and the shared copies in step (SCN-02, SCN-03, SCN-09). Edits apply
 * locally at once; changed scenarios are saved after a short pause with the revision they started
 * from. If the partner saved first: notes-only changes merge silently, anything else asks.
 */
export class CloudSync {
  /** Last server copy of each scenario: what "unchanged since sync" is measured against. */
  private bases = new Map<string, Scenario>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Sync tasks run one after another, in order. */
  private chain: Promise<void> = Promise.resolve();
  private pulled = false;
  private started = false;
  private stopped = false;
  private unsub: (() => void) | null = null;
  /** Shared scenarios this version of the app cannot read (left alone). */
  private unreadable = new Set<string>();
  /** Every create sent but not confirmed, per scenario (a lost reply, then edits and retries). */
  private sent = new Map<string, Scenario[]>();
  /** Conflicts after the one on screen, asked one at a time. */
  private waiting = new Map<string, Conflict>();

  constructor(
    private editor: Editor,
    private api: CloudApi,
    private author: () => "A" | "B" | null,
    private persist = true,
  ) {}

  /** Idempotent: a second call (React StrictMode) neither subscribes nor pulls twice. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    if (this.persist) {
      const saved = ((await get(BASES_KEY).catch(() => undefined)) as unknown[] | undefined) ?? [];
      for (const raw of saved) {
        try {
          const s = parseScenario(raw);
          this.bases.set(s.id, s);
        } catch {
          // An unreadable base only means that scenario is treated as changed; it gets saved again.
        }
      }
    }
    this.editor.setCloud(true);
    this.unsub = this.editor.store.subscribe((s, prev) => {
      if (s.version !== prev.version || s.order !== prev.order) this.schedule(DEBOUNCE_MS);
    });
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
    await this.pull();
  }

  stop() {
    this.stopped = true;
    this.unsub?.();
    clearTimeout(this.timer);
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
  }

  /** Back online: bring in what the partner did meanwhile, then save. */
  private onOnline = () => void this.pull();

  private schedule(ms: number) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  /** Queue a task after the running ones; the default saves (or first pulls, if that never worked). */
  private run(task?: () => Promise<void>): Promise<void> {
    const next = this.chain.then(() =>
      this.exec(task ?? (() => (this.pulled ? this.flush() : this.reconcileAll()))),
    );
    this.chain = next;
    return next;
  }

  private async exec(task: () => Promise<void>): Promise<void> {
    try {
      await task();
      this.editor.setSaveState("saved");
    } catch (e) {
      if (e instanceof Offline) {
        this.editor.setSaveState("offline");
        this.schedule(RETRY_MS);
      } else if (e instanceof SignedOut) {
        this.editor.setSaveState("error");
        this.editor.notify("Signed out — sign in again to share changes. They are kept on this device.");
      } else {
        console.error(e);
        this.editor.setSaveState("error");
        this.schedule(RETRY_MS);
      }
    } finally {
      await this.saveBases();
    }
  }

  /** Bring in the partner's scenarios and reconcile them with this device's (on start and reconnect). */
  pull(): Promise<void> {
    return this.run(() => this.reconcileAll());
  }

  private async reconcileAll(): Promise<void> {
    const { scenarios: server, unreadable } = await this.api.list();
    this.pulled = true;
    // Shared copies this version cannot read are neither deleted here nor overwritten.
    this.unreadable = new Set(unreadable);
    this.dropUntouchedSeed(server);
    const seen = new Set([...server.map((s) => s.id), ...unreadable]);
    for (const s of server) this.reconcile(s);
    const st = this.editor.store.getState();
    for (const id of Object.keys(st.scenarios)) {
      const base = this.bases.get(id);
      const local = st.scenarios[id];
      if (seen.has(id) || !base || !local) continue;
      // The partner deleted it. Unchanged here: drop it too; changed here: it gets saved again.
      if (sameContent(local, base)) {
        this.editor.dropScenario(id);
        this.editor.notify(`“${local.name}” was deleted on the other device`);
      }
      this.bases.delete(id);
    }
    await this.flush();
  }

  /**
   * A new device starts on the venue sample. If the couple already share scenarios and this device
   * has never shared anything, an untouched venue sample goes rather than becoming another "venue
   * sample" in the shared list (recognised by content, so a reload before the first sync is fine).
   */
  private dropUntouchedSeed(server: Scenario[]) {
    if (!server.length || this.bases.size) return;
    const st = this.editor.store.getState();
    const untouched = Object.values(st.scenarios).filter(
      (s) =>
        !server.some((x) => x.id === s.id) &&
        sameContent({ ...s, id: "-" }, venueSampleScenario("-", s.updatedAt)),
    );
    if (!untouched.length) return;
    for (const s of server)
      if (!this.editor.store.getState().scenarios[s.id]) this.editor.addScenario(s, false);
    for (const s of untouched) this.editor.dropScenario(s.id);
  }

  /** One server copy against this device's copy and the last shared one. */
  private reconcile(s: Scenario) {
    const local = this.editor.store.getState().scenarios[s.id];
    // A create from here whose reply was lost: that server copy is this device's own.
    const sent = this.sent.get(s.id) ?? [];
    this.sent.delete(s.id);
    if (!this.bases.has(s.id) && sent.some((x) => sameContent(x, s))) this.bases.set(s.id, s);
    const base = this.bases.get(s.id);
    if (!local && base && base.revision === s.revision) {
      // Deleted here and not changed there since: the next flush deletes it on the server.
    } else if (!local) {
      this.editor.addScenario(s, false);
      this.bases.set(s.id, s);
      // Deleted here, but the partner saved it since: their work comes back rather than vanishing.
      if (base) this.editor.notify(`“${s.name}” was changed on the other device, so it was kept`);
    } else if (sameContent(local, s)) {
      this.bases.set(s.id, s);
      this.editor.setRevision(s.id, s.revision);
    } else if (base && base.revision === s.revision) {
      // Only this device changed it: the next flush saves it.
    } else if (base && sameContent(local, base)) {
      this.editor.replaceScenario(s);
      this.bases.set(s.id, s);
    } else if (base && sameContent(s, base, true)) {
      // The partner only added notes: keep this device's edits, bring their notes in.
      this.editor.setNotes(s.id, mergeNotes(local.notes, s.notes));
      this.bases.set(s.id, s);
    } else if (base && sameContent(local, base, true)) {
      // Only notes were added here: take the partner's version with both sets of notes.
      this.editor.replaceScenario({ ...s, notes: mergeNotes(local.notes, s.notes) });
      this.bases.set(s.id, s);
    } else {
      this.raise({ id: s.id, theirs: s });
    }
  }

  private raise(c: Conflict) {
    const shown = this.editor.store.getState().conflict;
    if (shown && shown.id !== c.id) this.waiting.set(c.id, c);
    else this.editor.setConflict(c);
  }

  private undecided(id: string) {
    return this.editor.store.getState().conflict?.id === id || this.waiting.has(id);
  }

  /** Save every scenario that differs from its last shared copy; delete what was deleted here. */
  private async flush(): Promise<void> {
    const st = this.editor.store.getState();
    for (const id of st.order) {
      const local = st.scenarios[id];
      if (!local || this.undecided(id) || this.unreadable.has(id)) continue;
      const base = this.bases.get(id);
      if (base && sameContent(local, base)) continue;
      await this.push(local, base);
    }
    for (const [id, base] of [...this.bases]) {
      if (st.scenarios[id]) continue;
      const r = await this.api.remove(id, base.revision);
      this.bases.delete(id);
      if (!r.ok && r.current) {
        // The partner saved it after this device last synced: their work comes back, not lost.
        this.editor.addScenario(r.current, false);
        this.bases.set(id, r.current);
        this.editor.notify(`“${r.current.name}” was changed on the other device, so it was kept`);
      }
    }
  }

  private async push(local: Scenario, base: Scenario | undefined): Promise<void> {
    this.editor.setSaveState("saving");
    const by = this.author();
    const payload = { ...local, ...(by ? { updatedBy: by } : {}) };
    if (!base) {
      this.sent.set(local.id, [...(this.sent.get(local.id) ?? []), payload]);
      const created = await this.api.create(payload);
      if (created !== "exists") return this.accept(created);
      // Already there (an earlier create whose reply was lost, or the partner's): reconcile with it.
      const current = await this.api.get(local.id);
      if (current) this.reconcile(current);
      return;
    }
    const r = await this.api.save(payload, base.revision);
    if (r.ok) return this.accept(r.saved);
    if (!r.current) {
      // Deleted by the partner while edited here: keep this device's version as a new one.
      this.bases.delete(local.id);
      const created = await this.api.create(payload);
      if (created !== "exists") this.accept(created);
      return;
    }
    const theirs = r.current;
    if (sameContent(theirs, base, true)) {
      // The partner only added notes: merge them and save again.
      const merged = { ...payload, notes: mergeNotes(local.notes, theirs.notes) };
      const again = await this.api.save(merged, theirs.revision);
      if (again.ok) {
        this.editor.setNotes(local.id, merged.notes);
        return this.accept(again.saved);
      }
    }
    this.raise({ id: local.id, theirs });
  }

  private accept(saved: Scenario) {
    this.sent.delete(saved.id);
    this.bases.set(saved.id, saved);
    this.editor.setRevision(saved.id, saved.revision);
  }

  /** The couple's answer to a conflict (SCN-03). Nothing is overwritten without it. */
  async resolve(choice: "mine" | "theirs" | "copy", newId: () => string): Promise<void> {
    const conflict = this.editor.store.getState().conflict;
    if (!conflict) return;
    const { theirs } = conflict;
    const mine = this.editor.store.getState().scenarios[conflict.id];
    const next = this.waiting.values().next();
    if (!next.done) this.waiting.delete(next.value.id);
    this.editor.setConflict(next.done ? null : next.value);
    if (choice === "mine" && mine) {
      // Save over their revision, keeping their notes too; their version stays in the history (SCN-04).
      this.editor.setNotes(mine.id, mergeNotes(mine.notes, theirs.notes));
      this.bases.set(theirs.id, theirs);
    } else {
      if (choice === "copy" && mine)
        this.editor.addScenario(
          { ...mine, id: newId(), name: `${mine.name} (mine)`.slice(0, 80), revision: 0 },
          false,
        );
      this.editor.replaceScenario(theirs);
      this.bases.set(theirs.id, theirs);
    }
    await this.run();
  }

  async restore(id: string, revision: number): Promise<boolean> {
    let ok = false;
    await this.run(async () => {
      const s = await this.api.restore(id, revision);
      if (!s) return;
      this.editor.replaceScenario(s);
      this.bases.set(s.id, s);
      ok = true;
    });
    return ok;
  }

  private async saveBases() {
    if (this.persist) await set(BASES_KEY, [...this.bases.values()]).catch(() => undefined);
  }
}

const PARTNER_KEY = "richmond-studio/partner";

/** Who this device belongs to, chosen once per device (notes are signed with it, SCN-05). */
export function getPartner(): "A" | "B" | null {
  try {
    const v = localStorage.getItem(PARTNER_KEY);
    return v === "A" || v === "B" ? v : null;
  } catch {
    return null;
  }
}

export function setPartner(p: "A" | "B"): void {
  try {
    localStorage.setItem(PARTNER_KEY, p);
  } catch {
    // Private browsing: the choice lasts for this visit only.
  }
}
