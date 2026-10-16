import venueJson from "../../data/venue_geometry.json";
import tables from "../../data/library/tables.json";
import chairs from "../../data/library/chairs.json";
import linens from "../../data/library/linens.json";
import eventPieces from "../../data/library/event-pieces.json";
import candles from "../../data/library/candles.json";
import florals from "../../data/library/florals.json";
import tableware from "../../data/library/tableware.json";
import { buildCatalog } from "../domain/library/catalog";
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

export type Cloud = { status: SessionStatus; api: CloudApi; start: () => Promise<CloudSync> };

export async function boot(): Promise<{ studio: Studio; cloud: Cloud }> {
  const venue = buildVenue(parseVenue(venueJson));
  const catalog = buildCatalog([tables, chairs, linens, eventPieces, candles, florals, tableware]);
  const fresh = new URLSearchParams(window.location.search).has("fresh");
  const key = fresh ? FRESH_KEY : LOCAL_KEY;
  const local = fresh ? { scenarios: [], unreadable: [], readable: true } : await loadLocal(key);
  const editor = createEditor(
    { venue, catalog, now: () => new Date().toISOString(), newId },
    local.scenarios,
  );
  if ("activeId" in local && local.activeId) editor.switchScenario(local.activeId);
  // If saved work could not be read, never overwrite it; the top bar says nothing is being saved.
  if (local.readable) persistLocal(editor, { key, unreadable: local.unreadable });
  else editor.setSaveState("error");
  const studio = { venue, catalog, editor };
  // Test hook for Playwright (read-only use in tests).
  (window as unknown as { __studio?: Studio }).__studio = studio;
  // Shared cloud saving (SCN-02) when the API is set up; ?fresh sessions stay on this device.
  const api = new CloudApi();
  const status: SessionStatus = fresh ? "off" : await api.session();
  let sync: CloudSync | null = null;
  const start = async () => {
    sync ??= new CloudSync(editor, api, getPartner);
    await sync.start();
    return sync;
  };
  return { studio, cloud: { status, api, start } };
}
