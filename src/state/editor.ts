import { createStore } from "zustand/vanilla";
import { type Patch, applyPatches, enablePatches, produceWithPatches } from "immer";
import type { Catalog } from "../domain/library/catalog";
import type { VenueModel } from "../domain/venue/model";
import type { Item, ItemOptions } from "../domain/layout/items";
import { checkPlacement, findFreeSpot, spotFor, toggledObstacles } from "../domain/layout/validate";
import { tableLabels } from "../domain/layout/counts";
import { normalizeAngle, snap } from "../domain/geometry";
import type { Scenario } from "../domain/scenario/schema";
import { newScenario, venueSampleScenario } from "../domain/scenario/scenario";

enablePatches();

export type CameraMode = "dollhouse" | "plan" | "walk";
export type Refusal = { itemId: string; reason: string; at: number };
export type Toast = { id: number; text: string; undo?: () => void };
export type SaveState = "saved" | "saving" | "error";

export type EditorState = {
  scenarios: Record<string, Scenario>;
  order: string[];
  activeId: string;
  selection: string[];
  camera: CameraMode;
  snapping: boolean;
  refusal: Refusal | null;
  toast: Toast | null;
  saveState: SaveState;
  /** Bumped on every scenario change; persistence listens to it. */
  version: number;
  canUndo: boolean;
  canRedo: boolean;
};

type Step = { label: string; redo: Patch[]; undo: Patch[] };

export type EditorDeps = { venue: VenueModel; catalog: Catalog; now: () => string; newId: () => string };

const HISTORY_LIMIT = 100;
export const GRID = 0.1;
export const ROTATE_STEP = Math.PI / 12;

export function createEditor(deps: EditorDeps, initial: Scenario[]) {
  const { venue, catalog, now, newId } = deps;
  const seed = initial.length ? initial : [venueSampleScenario(newId(), now())];
  const first = seed[0] as Scenario;
  const history = new Map<string, { past: Step[]; future: Step[] }>();
  let toastSeq = 0;

  const store = createStore<EditorState>(() => ({
    scenarios: Object.fromEntries(seed.map((s) => [s.id, s])),
    order: seed.map((s) => s.id),
    activeId: first.id,
    selection: [],
    camera: "dollhouse",
    snapping: true,
    refusal: null,
    toast: null,
    saveState: "saved",
    version: 0,
    canUndo: false,
    canRedo: false,
  }));

  const get = store.getState;
  const set = store.setState;
  const active = (): Scenario => get().scenarios[get().activeId] as Scenario;
  const hist = (id: string) => {
    let h = history.get(id);
    if (!h) history.set(id, (h = { past: [], future: [] }));
    return h;
  };
  const syncHistoryFlags = () => {
    const h = hist(get().activeId);
    set({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
  };

  function commit(label: string, recipe: (draft: Scenario) => void, record = true): void {
    const id = get().activeId;
    const [next, redo, undo] = produceWithPatches(active(), (d) => {
      recipe(d);
      d.updatedAt = now();
    });
    if (!redo.some((p) => p.path[0] !== "updatedAt")) return; // nothing but the timestamp changed
    if (record) {
      const h = hist(id);
      h.past.push({ label, redo, undo });
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
      h.future = [];
    }
    set((s) => ({ scenarios: { ...s.scenarios, [id]: next }, version: s.version + 1 }));
    syncHistoryFlags();
  }

  function refuse(itemId: string, reason: string): false {
    set({ refusal: { itemId, reason, at: Date.now() } });
    return false;
  }

  function toast(text: string, undo?: () => void) {
    set({ toast: { id: ++toastSeq, text, ...(undo ? { undo } : {}) } });
  }

  const obstacles = () => toggledObstacles(venue, active().venueToggles);

  /** Validate a set of changed items against everything else in the scenario. */
  function validate(changed: Item[]): string | null {
    const items = active().items;
    const ids = new Set(changed.map((c) => c.id));
    const others = [...items.filter((i) => !ids.has(i.id)), ...changed];
    const labels = tableLabels(others, catalog);
    for (const c of changed) {
      const r = checkPlacement(c, others, venue, catalog, obstacles(), labels);
      if (!r.ok) return r.reason;
    }
    return null;
  }

  function withSpot(item: Item): Item {
    const s = spotFor(item, venue);
    return s ? { ...item, x: s.x, z: s.z, rotY: s.rotY } : item;
  }

  const api = {
    store,

    active,

    select(ids: string[]) {
      set({ selection: ids, refusal: null });
    },

    setCamera(camera: CameraMode) {
      set({ camera, ...(camera === "walk" ? { selection: [] } : {}) });
    },

    setSnapping(snapping: boolean) {
      set({ snapping });
    },

    clearRefusal() {
      set({ refusal: null });
    },

    dismissToast() {
      set({ toast: null });
    },

    setSaveState(saveState: SaveState) {
      set({ saveState });
    },

    notify(text: string) {
      toast(text);
    },

    /** Add a library item near `preferred`; refuses with a message when nothing fits (LAY-01). */
    addItem(libraryId: string, preferred: [number, number], options: ItemOptions = {}): string | null {
      const base: Item = { id: newId(), libraryId, x: preferred[0], z: preferred[1], rotY: 0, options };
      const spot = findFreeSpot(base, preferred, active().items, venue, catalog, obstacles());
      if (!spot) {
        toast("No free space for that here. Move or remove something first.");
        return null;
      }
      const item = { ...base, x: snap(spot.x, GRID), z: snap(spot.z, GRID), rotY: spot.rotY };
      const placed = validate([item]) ? { ...base, ...spot } : item;
      commit("Add", (d) => {
        d.items.push(placed);
      });
      set({ selection: [placed.id] });
      return placed.id;
    },

    /** Final position after a drag (one history step). Returns false and explains when refused. */
    moveItems(moves: { id: string; x: number; z: number }[]): boolean {
      const items = active().items;
      const changed = moves.map((m) => {
        const it = items.find((i) => i.id === m.id) as Item;
        const x = get().snapping ? snap(m.x, GRID) : m.x;
        const z = get().snapping ? snap(m.z, GRID) : m.z;
        return { ...it, x, z, options: spotFor(it, venue) ? { ...it.options, spot: "free" } : it.options };
      });
      const reason = validate(changed);
      if (reason) return refuse(changed[0]?.id ?? "", reason);
      commit("Move", (d) => {
        for (const c of changed) Object.assign(d.items.find((i) => i.id === c.id) as Item, c);
      });
      set({ refusal: null });
      return true;
    },

    rotateItems(ids: string[], delta: number): boolean {
      const items = active().items;
      const changed = ids
        .map((id) => items.find((i) => i.id === id) as Item)
        .filter((it) => !spotFor(it, venue))
        .map((it) => ({ ...it, rotY: normalizeAngle(it.rotY + delta) }));
      if (!changed.length) return false;
      const reason = validate(changed);
      if (reason) return refuse(changed[0]?.id ?? "", reason);
      commit("Rotate", (d) => {
        for (const c of changed) (d.items.find((i) => i.id === c.id) as Item).rotY = c.rotY;
      });
      return true;
    },

    setOption(id: string, key: string, value: number | string | boolean): boolean {
      const it = active().items.find((i) => i.id === id);
      if (!it) return false;
      const changed = withSpot({ ...it, options: { ...it.options, [key]: value } });
      const reason = validate([changed]);
      if (reason) return refuse(id, reason);
      commit("Change", (d) => {
        Object.assign(d.items.find((i) => i.id === id) as Item, changed);
      });
      return true;
    },

    setLabel(id: string, label: string) {
      commit("Rename table", (d) => {
        const it = d.items.find((i) => i.id === id);
        if (!it) return;
        if (label.trim()) it.label = label.trim().slice(0, 12);
        else delete it.label;
      });
    },

    duplicateSelection(): void {
      const items = active().items;
      const created: Item[] = [];
      for (const id of get().selection) {
        const src = items.find((i) => i.id === id);
        if (!src || spotFor(src, venue)) continue;
        const copy: Item = { ...src, id: newId(), options: { ...src.options } };
        delete copy.label;
        const spot = findFreeSpot(
          copy,
          [src.x + 0.6, src.z + 0.6],
          [...items, ...created],
          venue,
          catalog,
          obstacles(),
        );
        if (spot) created.push({ ...copy, ...spot });
      }
      if (!created.length) {
        toast("No free space for a copy. Move or remove something first.");
        return;
      }
      commit("Duplicate", (d) => {
        d.items.push(...created);
      });
      set({ selection: created.map((c) => c.id) });
    },

    deleteSelection(): void {
      const ids = new Set(get().selection);
      if (!ids.size) return;
      commit("Delete", (d) => {
        d.items = d.items.filter((i) => !ids.has(i.id));
      });
      set({ selection: [] });
      toast(ids.size === 1 ? "Deleted" : `Deleted ${ids.size} items`, () => api.undo());
    },

    setGuests(count: number) {
      commit("Guests", (d) => {
        d.guests.count = Math.max(0, Math.min(400, Math.round(count)));
      });
    },

    setStyle<K extends keyof Scenario["style"]>(key: K, value: Scenario["style"][K]) {
      // Lighting is a view choice: saved with the scenario but not an undo step.
      commit(
        "Style",
        (d) => {
          d.style[key] = value;
        },
        key !== "lighting",
      );
    },

    setVenueToggle(key: keyof Scenario["venueToggles"], value: boolean): boolean {
      if (value) {
        const toggles = { ...active().venueToggles, [key]: true };
        const blocked = active().items.find((it) => {
          const r = checkPlacement(it, active().items, venue, catalog, toggledObstacles(venue, toggles));
          return !r.ok;
        });
        if (blocked) return refuse(blocked.id, "Something is placed where that furniture stands");
      }
      commit("Venue furniture", (d) => {
        d.venueToggles[key] = value;
      });
      return true;
    },

    undo() {
      const h = hist(get().activeId);
      const step = h.past.pop();
      if (!step) return;
      h.future.push(step);
      const id = get().activeId;
      const restored = applyPatches(get().scenarios[id] as Scenario, step.undo);
      set((s) => ({
        scenarios: { ...s.scenarios, [id]: restored },
        version: s.version + 1,
        selection: s.selection.filter((sid) => restored.items.some((i) => i.id === sid)),
        refusal: null,
      }));
      syncHistoryFlags();
    },

    redo() {
      const h = hist(get().activeId);
      const step = h.future.pop();
      if (!step) return;
      h.past.push(step);
      const id = get().activeId;
      set((s) => ({
        scenarios: { ...s.scenarios, [id]: applyPatches(s.scenarios[id] as Scenario, step.redo) },
        version: s.version + 1,
        refusal: null,
      }));
      syncHistoryFlags();
    },

    // ---- scenarios (SCN-01) ----

    switchScenario(id: string) {
      if (!get().scenarios[id]) return;
      set({ activeId: id, selection: [], refusal: null });
      syncHistoryFlags();
    },

    createScenario(kind: "blank" | "sample"): string {
      const id = newId();
      const s = kind === "sample" ? venueSampleScenario(id, now()) : newScenario(id, "New scenario", now());
      api.addScenario(s);
      return id;
    },

    addScenario(s: Scenario) {
      set((st) => ({
        scenarios: { ...st.scenarios, [s.id]: s },
        order: [...st.order, s.id],
        version: st.version + 1,
      }));
      api.switchScenario(s.id);
    },

    duplicateScenario(id: string): string {
      const src = get().scenarios[id] as Scenario;
      const copy: Scenario = structuredClone({
        ...src,
        id: newId(),
        name: `${src.name} copy`.slice(0, 80),
        revision: 0,
        updatedAt: now(),
      });
      api.addScenario(copy);
      return copy.id;
    },

    renameScenario(id: string, name: string) {
      const trimmed = name.trim().slice(0, 80);
      if (!trimmed) return;
      set((st) => ({
        scenarios: {
          ...st.scenarios,
          [id]: { ...(st.scenarios[id] as Scenario), name: trimmed, updatedAt: now() },
        },
        version: st.version + 1,
      }));
    },

    deleteScenario(id: string) {
      const st = get();
      if (st.order.length <= 1) {
        toast("Keep at least one scenario.");
        return;
      }
      const removed = st.scenarios[id] as Scenario;
      const index = st.order.indexOf(id);
      const order = st.order.filter((o) => o !== id);
      const scenarios = Object.fromEntries(Object.entries(st.scenarios).filter(([k]) => k !== id));
      set({ scenarios, order, version: st.version + 1 });
      if (st.activeId === id) api.switchScenario(order[Math.max(0, index - 1)] as string);
      toast(`Deleted “${removed.name}”`, () => {
        set((s) => {
          const o = [...s.order];
          o.splice(index, 0, removed.id);
          return { scenarios: { ...s.scenarios, [removed.id]: removed }, order: o, version: s.version + 1 };
        });
        api.switchScenario(removed.id);
      });
    },
  };

  syncHistoryFlags();
  return api;
}

export type Editor = ReturnType<typeof createEditor>;
