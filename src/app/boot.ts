import venueJson from "../../data/venue_geometry.json";
import tables from "../../data/library/tables.json";
import chairs from "../../data/library/chairs.json";
import linens from "../../data/library/linens.json";
import eventPieces from "../../data/library/event-pieces.json";
import { buildCatalog } from "../domain/library/catalog";
import { buildVenue, parseVenue } from "../domain/venue/model";
import { createEditor } from "../state/editor";
import { loadLocal, persistLocal } from "../data/local";
import type { Studio } from "../scene/context";

export async function boot(): Promise<Studio> {
  const venue = buildVenue(parseVenue(venueJson));
  const catalog = buildCatalog([tables, chairs, linens, eventPieces]);
  const fresh = new URLSearchParams(window.location.search).has("fresh");
  const local = fresh ? { scenarios: [] } : await loadLocal();
  const editor = createEditor(
    { venue, catalog, now: () => new Date().toISOString(), newId: () => crypto.randomUUID().slice(0, 8) },
    local.scenarios,
  );
  if ("activeId" in local && local.activeId) editor.switchScenario(local.activeId);
  persistLocal(editor);
  const studio = { venue, catalog, editor };
  // Test hook for Playwright (read-only use in tests).
  (window as unknown as { __studio?: Studio }).__studio = studio;
  return studio;
}
