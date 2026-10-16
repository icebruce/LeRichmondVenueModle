import venueJson from "../../data/venue_geometry.json";
import tables from "../../data/library/tables.json";
import chairs from "../../data/library/chairs.json";
import linens from "../../data/library/linens.json";
import eventPieces from "../../data/library/event-pieces.json";
import candles from "../../data/library/candles.json";
import florals from "../../data/library/florals.json";
import tableware from "../../data/library/tableware.json";
import plants from "../../data/library/plants.json";
import lights from "../../data/library/lights.json";
import signs from "../../data/library/signs.json";
import photos from "../../data/library/photos.json";
import { type Catalog, buildCatalog } from "../domain/library/catalog";
import { withImported } from "../domain/library/imported";
import { LibrarySync } from "../data/library";
import { libraryStore } from "../state/library";
import { buildVenue, parseVenue } from "../domain/venue/model";
import { createEditor } from "../state/editor";
import { FRESH_KEY, LOCAL_KEY, loadLocal, persistLocal } from "../data/local";
import type { Studio } from "../scene/context";
import { CloudApi, CloudSync, type SessionStatus, getPartner } from "../data/cloud";

/** Short random id. `crypto.randomUUID` exists only on https and localhost, not a phone on LAN http. */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().slice(0, 8);
  const b = crypto.getRandomValues(new Uint8Array(4));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export type Cloud = {
  status: SessionStatus;
  api: CloudApi;
  start: () => Promise<CloudSync>;
  /** Imported items, photos and custom requests (IMP-06, REQ-01). */
  library: LibrarySync;
  /** The catalogue as it is now: a new object whenever imported items change (IMP-06). */
  catalog: () => Catalog;
};

export async function boot(): Promise<{ studio: Studio; cloud: Cloud }> {
  const venue = buildVenue(parseVenue(venueJson));
  const builtIn = buildCatalog([
    tables,
    chairs,
    linens,
    eventPieces,
    candles,
    florals,
    tableware,
    plants,
    lights,
    signs,
    photos,
  ]);
  const fresh = new URLSearchParams(window.location.search).has("fresh");
  // The couple's imports join the catalogue: a new catalogue whenever they change, so the room,
  // counts and lists all recompute (the editor reads it through `deps`).
  const library = new LibrarySync(fresh ? "richmond-studio/fresh" : "richmond-studio");
  await library.load();
  let catalog: Catalog = withImported(builtIn, libraryStore.getState().imports);
  const deps = { venue, catalog, now: () => new Date().toISOString(), newId };
  libraryStore.subscribe((s, prev) => {
    if (s.imports === prev.imports) return;
    catalog = withImported(builtIn, s.imports);
    deps.catalog = catalog;
  });
  const key = fresh ? FRESH_KEY : LOCAL_KEY;
  const local = fresh ? { scenarios: [], unreadable: [], readable: true } : await loadLocal(key);
  const editor = createEditor(deps, local.scenarios);
  // A partner's room may use an import this device has not loaded yet: fetch the library then.
  let asked = 0;
  editor.store.subscribe((s, prev) => {
    if (s.scenarios === prev.scenarios || Date.now() - asked < 15_000) return;
    const missing = Object.values(s.scenarios).some((sc) =>
      sc.items.some((i) => i.libraryId.startsWith("imp-") && !catalog.has(i.libraryId)),
    );
    if (missing) {
      asked = Date.now();
      void library.refresh();
    }
  });
  if ("activeId" in local && local.activeId) editor.switchScenario(local.activeId);
  // If saved work could not be read, never overwrite it; the top bar says nothing is being saved.
  if (local.readable) persistLocal(editor, { key, unreadable: local.unreadable });
  else editor.setSaveState("error");
  const studio = { venue, catalog, editor, imageUrl: (id: string) => library.imageUrl(id) };
  // Test hook for Playwright (read-only use in tests).
  (window as unknown as { __studio?: Studio }).__studio = studio;
  // Shared cloud saving (SCN-02) when the API is set up; ?fresh sessions stay on this device.
  const api = new CloudApi();
  const status: SessionStatus = fresh ? "off" : await api.session();
  let sync: CloudSync | null = null;
  const start = async () => {
    sync ??= new CloudSync(editor, api, getPartner);
    // Both start together; photo uploads never hold up scenario saving.
    await Promise.all([library.share(), sync.start()]);
    return sync;
  };
  return { studio, cloud: { status, api, start, library, catalog: () => catalog } };
}
