import { createStore } from "zustand/vanilla";
import { type Patch, applyPatches, enablePatches, produceWithPatches } from "immer";
import type { Catalog } from "../domain/library/catalog";
import type { VenueModel } from "../domain/venue/model";
import type { Item, ItemOptions } from "../domain/layout/items";
import {
  type Placement,
  checkPlacement,
  findFreeSpot,
  itemTitle,
  spotFor,
  toggledObstacles,
} from "../domain/layout/validate";
import { tableLabels } from "../domain/layout/counts";
import { stylePatch } from "../domain/layout/decor";
import { normalizeAngle, snap } from "../domain/geometry";
import type { Scenario, TableStyle } from "../domain/scenario/schema";
import { newScenario, venueSampleScenario } from "../domain/scenario/scenario";

enablePatches();

export type CameraMode = "dollhouse" | "plan" | "walk";
export type Toast = {
  id: number;
  text: string;
  undo?: () => void;
  /** Another action than Undo (e.g. Share on a saved image). */
  action?: { label: string; run: () => void };
};
export type SaveState = "saved" | "saving" | "error" | "offline";
/** The partner saved a newer version while this device was editing (SCN-03). */
export type Conflict = { id: string; theirs: Scenario };

export type EditorState = {
  scenarios: Record<string, Scenario>;
  order: string[];
  activeId: string;
  selection: string[];
  camera: CameraMode;
  snapping: boolean;
  toast: Toast | null;
  saveState: SaveState;
  /** Bumped on every scenario change; persistence listens to it. */
  version: number;
  /** Cloud saving shared between both partners is on (SCN-02); off = this device only. */
  cloud: boolean;
  conflict: Conflict | null;
  canUndo: boolean;
  canRedo: boolean;
};

type Step = { label: string; redo: Patch[]; undo: Patch[]; at?: number };

export type EditorDeps = { venue: VenueModel; catalog: Catalog; now: () => string; newId: () => string };

const HISTORY_LIMIT = 100;
/** Steps with these labels made within MERGE_MS of each other undo together. */
const MERGED = new Set(["Guests", "Check settings", "First vase moved", "Second vase moved"]);
const MERGE_MS = 800;
export const GRID = 0.1;
/** One rotate step. Positive rotY turns counter-clockwise seen from above, so "+15°" (clockwise) is −ROTATE_STEP. */
export const ROTATE_STEP = Math.PI / 12;

export function createEditor(deps: EditorDeps, initial: Scenario[]) {
  // The catalogue is read through `deps` each time: imported items join it while the app runs (IMP-06).
  const { venue, now, newId } = deps;
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
    toast: null,
    saveState: "saved",
    version: 0,
    cloud: false,
    conflict: null,
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
      const last = h.past.at(-1);
      // Holding or scrubbing a control (guests, check settings) is one undo step, not dozens.
      if (MERGED.has(label) && last?.label === label && Date.now() - (last.at ?? 0) < MERGE_MS) {
        h.past[h.past.length - 1] = {
          label,
          redo: [...last.redo, ...redo],
          undo: [...undo, ...last.undo],
          at: Date.now(),
        };
      } else h.past.push({ label, redo, undo, at: Date.now() });
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
      h.future = [];
    }
    // A newer change makes an older "Undo" offer misleading, so it goes.
    set((s) => ({
      scenarios: { ...s.scenarios, [id]: next },
      version: s.version + 1,
      ...(s.toast?.undo ? { toast: null } : {}),
    }));
    syncHistoryFlags();
  }

  /** Undo exactly the step just recorded, if it is still the latest one; never a later change. */
  function undoLast(): () => void {
    const id = get().activeId;
    const step = hist(id).past.at(-1);
    return () => {
      if (step && get().activeId === id && hist(id).past.at(-1) === step) api.undo();
    };
  }

  /**
   * A refused change leaves everything as it was and says why, wherever the couple is; a showing
   * Undo offer is never pushed aside by it (DESIGN_GUIDE §4 Toast).
   */
  function refuse(reason: string): false {
    if (!get().toast?.undo) toast(`${reason}. Nothing was changed.`);
    return false;
  }

  function toast(text: string, undo?: () => void, action?: Toast["action"]) {
    set({ toast: { id: ++toastSeq, text, ...(undo ? { undo } : {}), ...(action ? { action } : {}) } });
  }

  const obstacles = () => toggledObstacles(venue, active().venueToggles);

  /** Validate a set of changed items against everything else in the scenario. */
  function validate(changed: Item[]): string | null {
    const items = active().items;
    const ids = new Set(changed.map((c) => c.id));
    const others = [...items.filter((i) => !ids.has(i.id)), ...changed];
    const labels = tableLabels(others, deps.catalog);
    for (const c of changed) {
      const r = checkPlacement(c, others, venue, deps.catalog, obstacles(), labels);
      if (!r.ok) return r.reason;
    }
    return null;
  }

  /** A new item at `at`, snapped to the grid, and whether it may stand there. */
  function dropPlacement(libraryId: string, at: [number, number]): { item: Item; placed: Placement } {
    const item: Item = {
      id: newId(),
      libraryId,
      x: snap(at[0], GRID),
      z: snap(at[1], GRID),
      rotY: 0,
      options: {},
    };
    const others = [...active().items, item];
    const placed = checkPlacement(
      item,
      others,
      venue,
      deps.catalog,
      obstacles(),
      tableLabels(others, deps.catalog),
    );
    return { item, placed };
  }

  function withSpot(item: Item): Item {
    const s = spotFor(item, venue);
    return s ? { ...item, x: s.x, z: s.z, rotY: s.rotY } : item;
  }

  const api = {
    store,

    active,

    select(ids: string[]) {
      set({ selection: ids });
    },

    setCamera(camera: CameraMode) {
      set({ camera, ...(camera === "walk" ? { selection: [] } : {}) });
    },

    setSnapping(snapping: boolean) {
      set({ snapping });
    },

    dismissToast() {
      set({ toast: null });
    },

    setSaveState(saveState: SaveState) {
      set({ saveState });
    },

    /** A message, with Undo when `undo` is given (e.g. putting back a removed import), or another action. */
    notify(text: string, undo?: () => void, action?: Toast["action"]) {
      toast(text, undo, action);
    },

    /** Where a piece dragged from the library would land and whether it may (LIB-13); the drop agrees. */
    dropPlacement,

    /** Add a piece exactly where it was dropped (LIB-13); a refused drop changes nothing and says why. */
    addItemAt(libraryId: string, at: [number, number]): string | null {
      const { item, placed } = dropPlacement(libraryId, at);
      if (!placed.ok) return (refuse(placed.reason), null);
      commit("Add", (d) => {
        d.items.push(item);
      });
      set({ selection: [item.id] });
      return item.id;
    },

    /** Add a library item near `preferred`; refuses with a message when nothing fits (LAY-01). */
    addItem(libraryId: string, preferred: [number, number], options: ItemOptions = {}): string | null {
      const base: Item = { id: newId(), libraryId, x: preferred[0], z: preferred[1], rotY: 0, options };
      const spot = findFreeSpot(base, preferred, active().items, venue, deps.catalog, obstacles());
      if (!spot) {
        toast(
          `No room for the ${(deps.catalog.get(libraryId)?.name ?? "piece").toLowerCase()} anywhere on the floor. Move or remove something first.`,
        );
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
    /** Move (and optionally turn) items as one undo step; a drag with a two-finger twist uses rotY. */
    moveItems(moves: { id: string; x: number; z: number; rotY?: number }[]): boolean {
      const items = active().items;
      const changed = moves.map((m) => {
        const it = items.find((i) => i.id === m.id) as Item;
        const x = get().snapping ? snap(m.x, GRID) : m.x;
        const z = get().snapping ? snap(m.z, GRID) : m.z;
        const rotY = m.rotY === undefined ? it.rotY : normalizeAngle(m.rotY);
        return {
          ...it,
          x,
          z,
          rotY,
          options: spotFor(it, venue) ? { ...it.options, spot: "free" } : it.options,
        };
      });
      const reason = validate(changed);
      if (reason) return refuse(reason);
      commit("Move", (d) => {
        for (const c of changed) Object.assign(d.items.find((i) => i.id === c.id) as Item, c);
      });
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
      if (reason) return refuse(reason);
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
      if (reason) return refuse(reason);
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
          deps.catalog,
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
      const items = active().items;
      const one = items.find((i) => ids.has(i.id));
      const what =
        one && ids.size === 1 ? itemTitle(one, tableLabels(items, deps.catalog), deps.catalog) : "";
      commit("Delete", (d) => {
        d.items = d.items.filter((i) => !ids.has(i.id));
      });
      set({ selection: [] });
      toast(what ? `${what} deleted` : `${ids.size} items deleted`, undoLast());
    },

    /** Evening moment (SCN-07): changes where standing guests go (PPL-01). */
    setPhase(phase: "dinner" | "party") {
      commit("Moment", (d) => {
        d.phase = phase;
      });
    },

    /** New standing positions for the same count (PPL-02 keeps them until shuffled again). */
    shuffleGuests() {
      commit("Shuffle guests", (d) => {
        d.guests.seed += 1;
      });
    },

    /** Advisory thresholds (LAY-08): aisle, clearance, m² per dancer, share dancing. */
    setThreshold(key: keyof Scenario["thresholds"], value: number) {
      commit("Check settings", (d) => {
        d.thresholds[key] = value;
      });
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

    setVenueToggle(key: "barStools", value: boolean): boolean {
      if (value) {
        const toggles = { ...active().venueToggles, [key]: true };
        const blocked = active().items.find((it) => {
          const r = checkPlacement(it, active().items, venue, deps.catalog, toggledObstacles(venue, toggles));
          return !r.ok;
        });
        if (blocked) {
          const name = itemTitle(blocked, tableLabels(active().items, deps.catalog), deps.catalog);
          return refuse(`${name} is where the bar stools go`);
        }
      }
      commit("Venue furniture", (d) => {
        d.venueToggles[key] = value;
      });
      return true;
    },

    /** Show or hide the bar flowers, or slide one along the bar top (VEN-06). */
    setBarFlowers(patch: { shown?: boolean; at?: [number, number] }) {
      const [a] = active().venueToggles.barFlowers.at;
      const label = !patch.at ? "Bar flowers" : patch.at[0] !== a ? "First vase moved" : "Second vase moved";
      commit(label, (d) => {
        Object.assign(d.venueToggles.barFlowers, patch);
      });
    },

    /** Show the current artwork (null), hide it ("hidden") or swap it for another (VEN-05). */
    setPainting(id: string, choice: string | null) {
      commit("Painting", (d) => {
        const rest = Object.entries(d.venueToggles.paintings).filter(([k]) => k !== id);
        d.venueToggles.paintings = Object.fromEntries(choice === null ? rest : [...rest, [id, choice]]);
      });
    },

    /**
     * Décor (DEC-01..05). `"all"` sets the scenario style and clears those keys from every table's
     * override, so all tables match; a list of ids sets an override on just those tables.
     */
    applyStyle(target: "all" | string[], patch: Partial<TableStyle>) {
      const keys = Object.keys(patch);
      // An override equal to the scenario style is no override; an empty one is removed.
      const settle = (it: Item, own: Partial<TableStyle>, base: TableStyle) => {
        const kept = Object.fromEntries(
          // Compared by value: a candle mix is a list (DEC-02).
          Object.entries(own).filter(
            ([k, v]) => JSON.stringify(v) !== JSON.stringify(base[k as keyof TableStyle]),
          ),
        );
        if (Object.keys(kept).length) it.style = kept;
        else delete it.style;
      };
      commit("Décor", (d) => {
        if (target === "all") Object.assign(d.style, patch);
        for (const it of d.items) {
          if (target === "all") {
            if (it.style)
              settle(
                it,
                Object.fromEntries(Object.entries(it.style).filter(([k]) => !keys.includes(k))),
                d.style,
              );
          } else if (target.includes(it.id)) settle(it, { ...it.style, ...patch }, d.style);
        }
      });
    },

    /**
     * A library item where it belongs: table dressing on every table (DEC-01), anything else placed
     * near `focus` (LAY-01). Says which, or null when nothing fits.
     */
    placeOrUse(libraryId: string, focus: [number, number]): "used" | "placed" | null {
      const e = deps.catalog.get(libraryId);
      const patch = e ? stylePatch(e) : null;
      if (patch && e) {
        api.applyStyle("all", patch);
        toast(`${e.name} on every table`, undoLast());
        return "used";
      }
      return api.addItem(libraryId, focus) ? "placed" : null;
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
      }));
      syncHistoryFlags();
    },

    // ---- scenarios (SCN-01) ----

    switchScenario(id: string) {
      if (!get().scenarios[id]) return;
      set({ activeId: id, selection: [] });
      syncHistoryFlags();
    },

    createScenario(kind: "blank" | "sample"): string {
      const id = newId();
      const s = kind === "sample" ? venueSampleScenario(id, now()) : newScenario(id, "New scenario", now());
      api.addScenario(s);
      return id;
    },

    addScenario(s: Scenario, activate = true) {
      set((st) => ({
        scenarios: { ...st.scenarios, [s.id]: s },
        order: st.order.includes(s.id) ? st.order : [...st.order, s.id],
        version: st.version + 1,
      }));
      if (activate) api.switchScenario(s.id);
    },

    // ---- cloud (SCN-02..05): server copies replace local ones without an undo step ----

    setCloud(cloud: boolean) {
      set({ cloud });
    },

    setConflict(conflict: Conflict | null) {
      set({ conflict });
    },

    /** Take the server's copy of a scenario (partner's newer version, a restored version). */
    replaceScenario(s: Scenario) {
      if (!get().scenarios[s.id]) return api.addScenario(s, false);
      history.delete(s.id);
      set((st) => ({
        scenarios: { ...st.scenarios, [s.id]: s },
        version: st.version + 1,
        selection: st.activeId === s.id ? [] : st.selection,
      }));
      syncHistoryFlags();
    },

    /** The partner deleted a scenario this device had not changed. */
    dropScenario(id: string) {
      const st = get();
      if (!st.scenarios[id] || st.order.length <= 1) return;
      const order = st.order.filter((o) => o !== id);
      set({
        scenarios: Object.fromEntries(Object.entries(st.scenarios).filter(([k]) => k !== id)),
        order,
        version: st.version + 1,
      });
      if (st.activeId === id) api.switchScenario(order[0] as string);
    },

    /** Bring in notes merged with the partner's (not an undo step). */
    setNotes(id: string, notes: Scenario["notes"]) {
      const s = get().scenarios[id];
      if (!s) return;
      set((st) => ({ scenarios: { ...st.scenarios, [id]: { ...s, notes } }, version: st.version + 1 }));
    },

    /** Record the revision the server gave this scenario (not a user change). */
    setRevision(id: string, revision: number) {
      const s = get().scenarios[id];
      if (!s || s.revision === revision) return;
      set((st) => ({ scenarios: { ...st.scenarios, [id]: { ...s, revision } }, version: st.version + 1 }));
    },

    /** A note for the partner on the active scenario (SCN-05); not part of undo. */
    addNote(text: string, author: "A" | "B") {
      const trimmed = text.trim().slice(0, 2000);
      if (!trimmed) return;
      commit(
        "Note",
        (d) => {
          d.notes.push({ id: newId(), author, text: trimmed, at: now() });
        },
        false,
      );
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

    /** Renames the active scenario as an undoable step (ARCHITECTURE §4.3). */
    renameScenario(name: string) {
      const trimmed = name.trim().slice(0, 80);
      if (!trimmed) return;
      commit("Rename", (d) => {
        d.name = trimmed;
      });
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
