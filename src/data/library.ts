import { get, set } from "idb-keyval";
import {
  type CustomRequest,
  type Imported,
  customRequestSchema,
  importedSchema,
} from "../domain/library/schema";
import { libraryStore, mergeImports, mergeRequests } from "../state/library";

/** What is saved on this device, and what still has to reach the cloud. */
type Saved = {
  imports: unknown[];
  requests: unknown[];
  pending: { images: string[]; imports: string[]; archives: string[]; requests: string[] };
};

const empty = (): Saved["pending"] => ({ images: [], imports: [], archives: [], requests: [] });

const parseAll = <T>(
  raws: unknown[],
  schema: { safeParse: (x: unknown) => { success: boolean; data?: T } },
) =>
  raws.flatMap((r) => {
    const p = schema.safeParse(r);
    return p.success && p.data ? [p.data] : [];
  });

class Unreachable extends Error {}

/**
 * Whether a queued send is done. The server refusing it (a 4xx) will not change on a retry, so it
 * leaves the queue instead of blocking everything behind it; server errors are retried.
 */
function sent(res: Response, what: string): void {
  if (res.ok) return;
  if (res.status >= 400 && res.status < 500) {
    console.warn(`${what} was refused (${res.status}); not retrying`);
    return;
  }
  throw new Error(`${what} failed (${res.status})`);
}

/**
 * The couple's imported items, their photos and custom requests (IMP-06, REQ-01): saved on the
 * device at once and shared through the API when cloud saving is on. Imports are never edited
 * after saving (only removed), and each request keeps its latest change, so merging needs no
 * conflict questions. Anything not yet sent is retried on start and when the connection returns.
 */
export class LibrarySync {
  private pending = empty();
  private cloud = false;
  private chain: Promise<void> = Promise.resolve();
  private urls = new Map<string, Promise<string | null>>();

  /** `prefix` separates a `?fresh` session's saves from the real ones. */
  constructor(
    private prefix: string,
    private fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  private get key() {
    return `${this.prefix}/library/v1`;
  }
  private imageKey(id: string) {
    return `${this.prefix}/image/${id}`;
  }

  /** Loads what this device has; call `share()` once cloud saving is on. */
  async load(): Promise<void> {
    const saved = (await get(this.key).catch(() => undefined)) as Saved | undefined;
    if (!saved) return;
    this.pending = { ...empty(), ...saved.pending };
    libraryStore.setState({
      imports: mergeImports([], parseAll<Imported>(saved.imports ?? [], importedSchema)),
      requests: mergeRequests([], parseAll<CustomRequest>(saved.requests ?? [], customRequestSchema)),
    });
  }

  /** Cloud saving is on: send what waits, bring in the partner's, and again on reconnect. */
  share(): Promise<void> {
    if (!this.cloud && typeof window !== "undefined")
      window.addEventListener("online", () => void this.sync());
    this.cloud = true;
    return this.sync();
  }

  private save(): Promise<void> {
    const { imports, requests } = libraryStore.getState();
    return set(this.key, { imports, requests, pending: this.pending } satisfies Saved).catch(() => {});
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(path, { credentials: "same-origin", ...init });
    } catch {
      throw new Unreachable();
    }
    // Not signed in or not set up: keep it for later, like being offline.
    if (res.status === 401 || res.status === 503) throw new Unreachable();
    return res;
  }

  /** Brings in the partner's imports and requests now (when cloud saving is on). */
  refresh(): Promise<void> {
    return this.sync();
  }

  private sync(): Promise<void> {
    this.chain = this.chain.then(async () => {
      if (!this.cloud) return;
      try {
        await this.flush();
        await this.pull();
      } catch (e) {
        if (!(e instanceof Unreachable)) console.error(e);
      }
      await this.save();
    });
    return this.chain;
  }

  /** Photos first, so an item never arrives at the partner's before its photo. */
  private async flush(): Promise<void> {
    const { imports, requests } = libraryStore.getState();
    for (const id of [...this.pending.images]) {
      const blob = (await get(this.imageKey(id)).catch(() => undefined)) as Blob | undefined;
      if (blob) {
        const res = await this.call(`/api/uploads/${id}`, {
          method: "PUT",
          headers: { "Content-Type": blob.type },
          body: blob,
        });
        sent(res, "Photo upload");
      }
      this.pending.images = this.pending.images.filter((x) => x !== id);
    }
    for (const id of [...this.pending.imports]) {
      const item = imports.find((i) => i.id === id);
      if (item) {
        const res = await this.call("/api/catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item }),
        });
        sent(res, "Saving an import");
      }
      this.pending.imports = this.pending.imports.filter((x) => x !== id);
    }
    for (const id of [...this.pending.archives]) {
      const item = imports.find((i) => i.id === id);
      const res = await this.call(`/api/catalog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archived: item?.archived ?? true,
          updatedAt: item?.updatedAt ?? new Date().toISOString(),
        }),
      });
      sent(res, "Removing an import");
      this.pending.archives = this.pending.archives.filter((x) => x !== id);
    }
    for (const id of [...this.pending.requests]) {
      const request = requests.find((r) => r.id === id);
      if (request) {
        const res = await this.call("/api/library-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request }),
        });
        sent(res, "Saving a request");
      }
      this.pending.requests = this.pending.requests.filter((x) => x !== id);
    }
  }

  private async pull(): Promise<void> {
    const [a, b] = await Promise.all([
      this.call("/api/catalog", { method: "GET" }),
      this.call("/api/library-requests", { method: "GET" }),
    ]);
    if (!a.ok || !b.ok) throw new Error("Loading the shared library failed");
    const items = parseAll<Imported>(((await a.json()) as { items?: unknown[] }).items ?? [], importedSchema);
    const reqs = parseAll<CustomRequest>(
      ((await b.json()) as { requests?: unknown[] }).requests ?? [],
      customRequestSchema,
    );
    const s = libraryStore.getState();
    libraryStore.setState({
      imports: mergeImports(s.imports, items),
      requests: mergeRequests(s.requests, reqs),
    });
  }

  private change(pending: Partial<Saved["pending"]>): Promise<void> {
    for (const [k, ids] of Object.entries(pending) as [keyof Saved["pending"], string[]][])
      this.pending[k] = [...new Set([...this.pending[k], ...ids])];
    void this.save();
    return this.sync();
  }

  /** Keeps a photo on this device and queues it for the cloud. */
  async addImage(id: string, blob: Blob): Promise<void> {
    await set(this.imageKey(id), blob);
    await this.change({ images: [id] });
  }

  /** IMP-06: the item joins the library at once; the partner sees it after their next sync. */
  async addImport(item: Imported, image: Blob): Promise<void> {
    await set(this.imageKey(item.imageId), image);
    libraryStore.setState((s) => ({ imports: mergeImports(s.imports, [item]) }));
    await this.change({ images: [item.imageId], imports: [item.id] });
  }

  /** Removes an import from the lists, or puts it back (`archived: false`, Undo). */
  async archiveImport(id: string, archived = true): Promise<void> {
    const updatedAt = new Date().toISOString();
    libraryStore.setState((s) => ({
      imports: s.imports.map((i) => (i.id === id ? { ...i, archived, updatedAt } : i)),
    }));
    await this.change({ archives: [id] });
  }

  async saveRequest(request: CustomRequest): Promise<void> {
    libraryStore.setState((s) => ({ requests: mergeRequests(s.requests, [request]) }));
    await this.change({ requests: [request.id] });
  }

  /** A stored photo as a URL the scene and lists can show: from this device, else the cloud. */
  imageUrl(id: string): Promise<string | null> {
    let url = this.urls.get(id);
    if (!url) {
      url = (async () => {
        const local = (await get(this.imageKey(id)).catch(() => undefined)) as Blob | undefined;
        if (local) return URL.createObjectURL(local);
        try {
          const res = await this.call(`/api/uploads/${id}`, { method: "GET" });
          if (!res.ok) {
            // Not uploaded yet (the partner's device may still be sending it): ask again later.
            this.urls.delete(id);
            return null;
          }
          const blob = await res.blob();
          await set(this.imageKey(id), blob).catch(() => {});
          return URL.createObjectURL(blob);
        } catch {
          // Offline or not shared yet: try again next time it is asked for.
          this.urls.delete(id);
          return null;
        }
      })();
      this.urls.set(id, url);
    }
    return url;
  }
}
