import { get, set } from "idb-keyval";
import { parseScenario } from "../domain/scenario/scenario";
import type { Scenario } from "../domain/scenario/schema";
import type { Editor } from "../state/editor";

/** The network is unreachable: keep working locally and retry (SCN-09). */
export class Offline extends Error {}
/** Signed out (the session expired or the password changed). */
export class SignedOut extends Error {}

export type SessionStatus = "on" | "signin" | "off";
export type Version = { revision: number; updatedAt: string; updatedBy?: string; name?: string };

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
      return e instanceof SignedOut ? "signin" : "off";
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

  async list(): Promise<Scenario[]> {
    const res = await this.request("/api/scenarios");
    if (!res.ok) throw new Error(`List failed (${res.status})`);
    const body = (await res.json()) as { scenarios: unknown[] };
    return body.scenarios.map((s) => parseScenario(s));
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

  async remove(id: string): Promise<void> {
    await this.request(`/api/scenarios/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async versions(id: string): Promise<Version[]> {
    const res = await this.request(`/api/scenarios/${encodeURIComponent(id)}/versions`);
    return res.ok ? ((await res.json()) as { versions: Version[] }).versions : [];
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

/**
 * Keeps this device's scenarios and the shared copies in step (SCN-02, SCN-03, SCN-09). Edits apply
 * locally at once; changed scenarios are saved after a short pause with the revision they started
 * from. If the partner saved first: notes-only changes merge silently, anything else asks.
 */
export class CloudSync {
  /** Last server copy of each scenario: what "unchanged since sync" is measured against. */
  private bases = new Map<string, Scenario>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;
  private again = false;
  private stopped = false;
  private unsub: (() => void) | null = null;

  constructor(
    private editor: Editor,
    private api: CloudApi,
    private author: () => "A" | "B",
    private persist = true,
  ) {}

  async start(): Promise<void> {
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

  private onOnline = () => this.schedule(0);

  private schedule(ms: number) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  /** Runs one sync at a time; changes made meanwhile trigger another round. */
  private async run(task: () => Promise<void> = () => this.flush()) {
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    try {
      await task();
      if (this.editor.store.getState().saveState !== "error") this.editor.setSaveState("saved");
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
      this.busy = false;
      await this.saveBases();
      if (this.again) {
        this.again = false;
        this.schedule(DEBOUNCE_MS);
      }
    }
  }

  /** Bring in the partner's scenarios and reconcile them with this device's (on start and reconnect). */
  async pull(): Promise<void> {
    await this.run(async () => {
      const server = await this.api.list();
      const st = this.editor.store.getState();
      const seen = new Set<string>();
      for (const s of server) {
        seen.add(s.id);
        const local = st.scenarios[s.id];
        const base = this.bases.get(s.id);
        if (!local) {
          this.editor.addScenario(s, false);
          this.bases.set(s.id, s);
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
          this.editor.setConflict({ id: s.id, theirs: s });
        }
      }
      for (const id of Object.keys(st.scenarios)) {
        const base = this.bases.get(id);
        const local = st.scenarios[id];
        if (seen.has(id) || !base || !local) continue;
        // The partner deleted it. Unchanged here: drop it too; changed here: it gets saved again.
        if (sameContent(local, base)) this.editor.dropScenario(id);
        this.bases.delete(id);
      }
      await this.flush();
    });
  }

  /** Save every scenario that differs from its last shared copy; delete what was deleted here. */
  private async flush(): Promise<void> {
    const st = this.editor.store.getState();
    for (const id of st.order) {
      const local = st.scenarios[id];
      if (!local || st.conflict?.id === id) continue;
      const base = this.bases.get(id);
      if (base && sameContent(local, base)) continue;
      await this.push(local, base);
    }
    for (const id of [...this.bases.keys()]) {
      if (st.scenarios[id]) continue;
      await this.api.remove(id);
      this.bases.delete(id);
    }
  }

  private async push(local: Scenario, base: Scenario | undefined): Promise<void> {
    this.editor.setSaveState("saving");
    const payload = { ...local, updatedBy: this.author() };
    if (!base) {
      const created = await this.api.create(payload);
      if (created === "exists") return this.pull();
      this.accept(created);
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
    this.editor.setConflict({ id: local.id, theirs });
  }

  private accept(saved: Scenario) {
    this.bases.set(saved.id, saved);
    this.editor.setRevision(saved.id, saved.revision);
  }

  /** The couple's answer to a conflict (SCN-03). Nothing is overwritten without it. */
  async resolve(choice: "mine" | "theirs" | "copy", newId: () => string): Promise<void> {
    const conflict = this.editor.store.getState().conflict;
    if (!conflict) return;
    const { theirs } = conflict;
    const mine = this.editor.store.getState().scenarios[conflict.id];
    this.editor.setConflict(null);
    if (choice === "mine" && mine) {
      // Save over their revision; their version stays in the history (SCN-04).
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
