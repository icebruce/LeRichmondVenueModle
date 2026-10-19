import { type CSSProperties, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useProgress } from "@react-three/drei";
import { countLayout, tableLabels } from "../domain/layout/counts";
import { shapeOf } from "../domain/layout/items";
import { itemTitle, spotFor } from "../domain/layout/validate";
import type { Scenario } from "../domain/scenario/schema";
import { useStore } from "zustand";
import { PerfOverlay } from "./Perf";
import type { StoreApi } from "zustand/vanilla";
import { type EditorState, ROTATE_STEP } from "../state/editor";
import { adviseScenario } from "../domain/layout/advisories";
import { useEditor, useStudio, useView } from "../scene/context";
import { viewStore, walkInput } from "../state/view";
import { Icon, type IconName } from "./icons";
import {
  AddPanel,
  ChecksList,
  StylePanel,
  type StylePage,
  parentPage,
  Inspector,
  LayoutRules,
  GraphicsPage,
  PaintingsPage,
  BarFlowersPage,
  PeoplePanel,
  RoomPanel,
  type Section,
  SelectionActions,
  showYours,
} from "./Panels";
import { PlansPanel, SaveState } from "./Plans";
import { Actions, CameraSwitch, PhoneControls } from "./TopBar";
import { ConflictDialog, LeaveDialog, OfflineBanner, PartnerChooser } from "./Dialogs";
import { backStore, useBackLayer } from "./back";
import { InspirationPanel } from "./Inspiration";

/** The five sections (DESIGN_GUIDE §3): a rail on desktop, a tab bar on phones, same order. */
const SECTIONS: { id: Section; label: string; icon: IconName }[] = [
  { id: "room", label: "Room", icon: "venue" },
  { id: "add", label: "Add", icon: "add" },
  { id: "style", label: "Style", icon: "decor" },
  { id: "guests", label: "Guests", icon: "people" },
  { id: "plans", label: "Plans", icon: "plans" },
];

/** Desktop rail width (mirrors the `--rail-w` token) and the panel's width range (DESIGN_GUIDE §3.1). */
const RAIL = 76;
/** The hidden performance overlay (`?perf`, V0). */
const PERF = new URLSearchParams(window.location.search).has("perf");
/** Desktop: the toolbar row over the room (12 + 44 + 8 px); the overview frames the room below it. */
const TOOLBAR_INSET = 64;
/** Phone: the control column on the right (44 pt and its margins); the overview keeps clear of it. */
const PHONE_COLUMN = 64;
/** A sheet swipe: at least this far (px); faster than this (px/ms) is a flick that skips a step. */
const SWIPE_MIN = 48;
/** The selection toolbar's half width and its rise above its anchor (px), to keep it in the free area. */
const BAR_HALF = 260;
const BAR_RISE = 68;
const FLICK = 0.9;
const PANEL = { min: 360, max: 520, initial: 400 };
const WIDTH_KEY = "rs-panel-width";

const clampWidth = (w: number) => Math.round(Math.min(PANEL.max, Math.max(PANEL.min, w)));

function storedWidth(): number {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY));
    return w ? clampWidth(w) : PANEL.initial;
  } catch {
    return PANEL.initial;
  }
}

function saveWidth(w: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(w));
  } catch {
    // A remembered width is a convenience only.
  }
}

function useSummary(id?: string) {
  const { catalog, venue } = useStudio();
  const scenario = useEditor((s) => s.scenarios[id ?? s.activeId] as Scenario);
  return useMemo(
    () => ({
      name: scenario.name,
      ...countLayout(scenario.items, scenario.guests.count, catalog),
      advisories: adviseScenario(scenario, venue, catalog).length,
    }),
    [scenario, catalog, venue],
  );
}

/**
 * Desktop: floating counts strip, bottom-right (LAY-07). Side by side (SCN-06) each half shows its
 * own, named, strip; `onAdvisories` opens the list of checks.
 */
export function Counts({ id, onAdvisories }: { id?: string; onAdvisories?: () => void }) {
  const c = useSummary(id);
  const advisories = (
    <>
      <b data-testid={id ? undefined : "count-advisories"}>{c.advisories}</b>
      <span>{c.advisories === 1 ? "check" : "checks"}</span>
    </>
  );
  return (
    <div
      className={`counts glass ${id ? "pane-counts" : ""}`}
      aria-label={id ? `Counts for ${c.name}` : "Counts"}
      data-testid={id ? "pane-counts" : "counts"}
    >
      {id && <b className="pane-name">{c.name}</b>}
      <div className="count">
        <b data-testid={id ? undefined : "count-tables"}>{c.tables}</b>
        <span>{c.tables === 1 ? "table" : "tables"}</span>
      </div>
      <div className="count">
        <b data-testid={id ? undefined : "count-seats"}>{c.seats}</b>
        <span>{c.seats === 1 ? "seat" : "seats"}</span>
      </div>
      <div className="count">
        <b data-testid={id ? undefined : "count-guests"}>{c.guests}</b>
        <span>{c.guests === 1 ? "guest" : "guests"}</span>
      </div>
      <div className={`count ${c.withoutSeat ? "warn" : ""}`}>
        <b data-testid={id ? undefined : "count-without"}>{c.withoutSeat}</b>
        <span>without a seat</span>
      </div>
      <div className="count">
        <b>≈ {Math.round(c.danceFloorM2)} m²</b>
        <span>dance area</span>
      </div>
      {onAdvisories && c.advisories > 0 ? (
        <button
          type="button"
          className="count warn count-btn"
          onClick={onAdvisories}
          aria-haspopup="dialog"
          data-testid="open-checks"
        >
          {advisories}
        </button>
      ) : (
        <div className={`count ${c.advisories ? "warn" : ""}`}>{advisories}</div>
      )}
    </div>
  );
}

/** Phone: the same counts as one line at the top of the sheet, so the room keeps the screen. */
function CountsLine({ onAdvisories }: { onAdvisories: () => void }) {
  const c = useSummary();
  return (
    <p className="counts-line" aria-label="Counts">
      <span>
        {c.tables} {c.tables === 1 ? "table" : "tables"}
      </span>{" "}
      ·{" "}
      <span>
        {c.seats} {c.seats === 1 ? "seat" : "seats"}
      </span>
      {c.withoutSeat > 0 && (
        <>
          {" "}
          · <span className="warn">{c.withoutSeat} without a seat</span>
        </>
      )}
      {c.advisories > 0 && (
        <>
          {" "}
          ·{" "}
          <button type="button" className="warn link-btn" onClick={onAdvisories} data-testid="open-checks">
            {c.advisories} {c.advisories === 1 ? "check" : "checks"}
          </button>
        </>
      )}
    </p>
  );
}

const PHONE = "(max-width: 767px)";

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
  );
}

function Toast() {
  const { editor } = useStudio();
  const toast = useEditor((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => editor.dismissToast(), toast.undo ? 10000 : 4000);
    return () => window.clearTimeout(t);
  }, [toast, editor]);
  if (!toast) return null;
  return (
    <div className="toast" role="status" data-testid="toast">
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          type="button"
          className="plain-btn on-dark"
          onClick={() => {
            toast.undo?.();
            editor.dismissToast();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}

/** Touch joystick for walk mode on phones (CAM-03). */
function Joystick() {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const end = () => {
    setKnob([0, 0]);
    walkInput.setState({ move: [0, 0] });
  };
  const move = (e: React.PointerEvent) => {
    const r = pad.current?.getBoundingClientRect();
    if (!r || e.buttons === 0) return;
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const m = Math.min(1, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    setKnob([Math.cos(a) * m * 34, Math.sin(a) * m * 34]);
    walkInput.setState({ move: [Math.cos(a) * m, -Math.sin(a) * m] });
  };
  return (
    <div
      ref={pad}
      className="joystick"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Move"
      role="application"
    >
      <span className="knob" style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} />
    </div>
  );
}

function Loading() {
  const { active, progress } = useProgress();
  const [shown, setShown] = useState(true);
  useEffect(() => {
    if (!active && progress >= 100) {
      const t = window.setTimeout(() => setShown(false), 400);
      return () => window.clearTimeout(t);
    }
  }, [active, progress]);
  if (!shown) return null;
  return (
    <div className={`loading ${!active && progress >= 100 ? "done" : ""}`} aria-live="polite">
      <span className="wordmark">Richmond Studio</span>
      <span className="loading-text">Setting up the room…</span>
      <span className="loading-bar">
        <span style={{ width: `${Math.max(8, progress)}%` }} />
      </span>
    </div>
  );
}

function useShortcuts() {
  const { editor } = useStudio();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      const st = editor.store.getState();
      const sel = st.selection;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        editor.redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        editor.duplicateSelection();
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel.length) {
        e.preventDefault();
        editor.deleteSelection();
      } else if (e.key === "Escape") {
        viewStore.setState({ pickSeat: null });
        if (st.camera === "walk") editor.setCamera("dollhouse");
        else editor.select([]);
      } else if (st.camera !== "walk" && (e.key === "r" || e.key === "R") && sel.length) {
        // R turns clockwise like the "+15°" button; Shift+R the other way.
        editor.rotateItems(sel, e.shiftKey ? ROTATE_STEP : -ROTATE_STEP);
      } else if (st.camera !== "walk" && e.key.startsWith("Arrow") && sel.length) {
        e.preventDefault();
        const d = e.shiftKey ? 1 : 0.1;
        const nudge: Record<string, [number, number]> = {
          ArrowLeft: [-d, 0],
          ArrowRight: [d, 0],
          ArrowUp: [0, -d],
          ArrowDown: [0, d],
        };
        const [dx, dz] = nudge[e.key] ?? [0, 0];
        const items = editor.active().items.filter((i) => sel.includes(i.id));
        editor.moveItems(items.map((i) => ({ id: i.id, x: i.x + dx, z: i.z + dz })));
      } else if (!mod && ["1", "2", "3"].includes(e.key)) {
        editor.setCamera((["dollhouse", "plan", "walk"] as const)[Number(e.key) - 1] ?? "dollhouse");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);
}

type Detent = "peek" | "half" | "full";
type Sheet = Detent | "closed";
/** The sheet's heights, low to high: a swipe steps one along, a flick two. */
const SHEET_ORDER: Sheet[] = ["closed", "peek", "half", "full"];

/**
 * Keeps the browser's history in step with the open layers (a sheet, a page, the checks, a menu):
 * opening one adds an entry, so the system back gesture closes the top layer; closing one in the app
 * takes its entry away again. With `guard` (phones) one more entry sits under the layers, and back
 * with nothing open calls `onExit` instead of leaving (DESIGN_GUIDE §3.2). Entries are only added
 * after a tap: browsers skip history entries a page adds on its own, so an untapped guard would not
 * hold. Returns `leave`, which goes back past the app's own entries to the page before it.
 */
function useBackLayers(depth: number, closeTop: () => void, guard: boolean, onExit: () => void) {
  const synced = useRef(0);
  const skip = useRef(0);
  const guarded = useRef(false);
  const close = useRef(closeTop);
  const exit = useRef(onExit);
  const want = useRef(depth);
  useEffect(() => {
    close.current = closeTop;
    exit.current = onExit;
    want.current = depth;
  });
  // The guard, then the layers already open, go in on a tap (again after back reached the bottom).
  useEffect(() => {
    if (!guard) return;
    const arm = () => {
      if (guarded.current) return;
      guarded.current = true;
      for (let i = 0; i <= want.current; i++) history.pushState(entry(i), "");
      synced.current = want.current;
    };
    window.addEventListener("pointerdown", arm, true);
    return () => window.removeEventListener("pointerdown", arm, true);
  }, [guard]);
  useEffect(() => {
    // Each entry knows its place, so a back the browser takes in one jump still lands right.
    const onPop = (e: PopStateEvent) => {
      const at = placeOf(e.state);
      if (skip.current) {
        skip.current--;
        synced.current = Math.max(0, at);
        return;
      }
      if (!guarded.current) return;
      if (at < 0) {
        // Below the guard: nothing left to close.
        guarded.current = false;
        synced.current = 0;
        exit.current();
      } else if (at < synced.current) {
        synced.current = at;
        close.current();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!guarded.current) return;
    if (depth > synced.current) {
      for (let i = synced.current + 1; i <= depth; i++) history.pushState(entry(i), "");
    } else if (depth < synced.current) {
      skip.current++;
      history.go(depth - synced.current);
    }
    synced.current = depth;
  }, [depth]);
  // Back past the layers and the guard (when they are in), then one more to the page before.
  return () => history.go(-(guarded.current ? synced.current + 2 : 1));
}

/** This page load's history entries: the guard (0) and a layer each (1, 2…); others are outside. */
const LOAD = Math.random().toString(36).slice(2);
const entry = (place: number) => ({ rs: LOAD, place });
function placeOf(state: unknown): number {
  const s = state as { rs?: unknown; place?: unknown } | null;
  return s?.rs === LOAD && typeof s.place === "number" ? s.place : -1;
}

/** Desktop: the selection's toolbar, just above it in the room (DESIGN_GUIDE §3.1, §4). */
function SelectionBar({ onDetails }: { onDetails: () => void }) {
  const { catalog, venue } = useStudio();
  const anchor = useView((s) => s.anchor);
  const insetLeft = useView((s) => s.insetLeft);
  const insetTop = useView((s) => s.insetTop);
  const selection = useEditor((s) => s.selection);
  const items = useEditor((s) => s.scenarios[s.activeId]?.items ?? []);
  const chosen = items.filter((i) => selection.includes(i.id));
  const first = chosen[0];
  if (!anchor || !first) return null;
  const labels = tableLabels(items, catalog);
  const shape = shapeOf(first, catalog);
  const single = chosen.length === 1;
  const seats = single && "seats" in shape ? shape.seats : 0;
  const title = single ? itemTitle(first, labels, catalog) : `${chosen.length} items`;
  return (
    <div
      className="selection-bar glass"
      // Kept in the free area: right of the panel, below the toolbar row.
      style={{
        left: Math.max(anchor[0], insetLeft + BAR_HALF),
        top: Math.max(anchor[1], insetTop + BAR_RISE),
      }}
      role="toolbar"
      aria-label={title}
      data-testid="selection-bar"
    >
      <span className="selection-title">
        {title}
        {seats > 0 && <span>{seats} seats</span>}
      </span>
      <SelectionActions
        ids={chosen.map((i) => i.id)}
        locked={single && !!spotFor(first, venue)}
        sitHere={seats > 0 ? first.id : null}
        onDetails={onDetails}
      />
    </div>
  );
}

export function StudioUI() {
  const { editor, catalog } = useStudio();
  const selection = useEditor((s) => s.selection);
  const camera = useEditor((s) => s.camera);
  const [section, setSection] = useState<Section>("room");
  const [page, setPage] = useState<"rules" | "paintings" | "flowers" | "graphics" | StylePage | null>(null);
  const stylePage =
    page === "rules" || page === "paintings" || page === "flowers" || page === "graphics" ? null : page;
  const [details, setDetails] = useState(false);
  const [checks, setChecks] = useState(false);
  const [sheet, setSheet] = useState<Sheet>("peek");
  const [selView, setSelView] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [width, setWidth] = useState(storedWidth);
  const [libraryKey, setLibraryKey] = useState(0);
  useShortcuts();

  const phone = useMedia(PHONE);
  const hasSelection = selection.length > 0;
  const planName = useEditor((s) => s.scenarios[s.activeId]?.name ?? "");
  // Sit here (CAM-04): leaving walk ends the seat; a selection change ends picking one.
  const seat = useView((s) => s.seat);
  const activeItems = useEditor((s) => s.scenarios[s.activeId]?.items ?? []);
  const activeLabels = tableLabels(activeItems, catalog);
  const seated = seat ? `table ${activeLabels.get(seat.table) ?? ""}`.trim() : "";
  const pickSeat = useView((s) => s.pickSeat);
  const picking = pickSeat ? `table ${activeLabels.get(pickSeat) ?? ""}`.trim() : "";
  useEffect(() => {
    if (camera !== "walk") viewStore.setState({ seat: null });
    // Changing camera also ends choosing a seat.
    viewStore.setState({ pickSeat: null });
  }, [camera]);
  useEffect(() => {
    if (hasSelection) viewStore.setState({ pickSeat: null });
  }, [hasSelection]);

  // A new selection shows itself: on phones as the sheet at its peek (actions first); on desktop
  // through the toolbar beside it, with details one tap away. Nothing selected, nothing to detail.
  useEffect(
    () =>
      (editor.store as StoreApi<EditorState>).subscribe((s, prev) => {
        if (s.selection.join(",") === prev.selection.join(",")) return;
        if (!s.selection.length) {
          setDetails(false);
          return;
        }
        setSelView(true);
        if (phone) setSheet("peek");
      }),
    [editor, phone],
  );

  // "Request a custom model" opens its form in Add › Yours (REQ-01).
  useEffect(
    () =>
      viewStore.subscribe((s, prev) => {
        if (!s.requestFor || s.requestFor === prev.requestFor) return;
        showYours();
        setLibraryKey((k) => k + 1);
        setSection("add");
        setPage(null);
        setPanelOpen(true);
        setSheet((d) => (d === "closed" || d === "peek" ? "half" : d));
      }),
    [],
  );

  const compare = useView((s) => s.compare);
  // Phone side by side needs the screen: the half-height sheet stays at its peek (full still opens).
  const detent: Sheet = phone && compare && sheet === "half" ? "peek" : sheet;
  const panelShown = camera !== "walk" && (phone ? detent !== "closed" : panelOpen);

  // The layers the back gesture closes, top first (DESIGN_GUIDE §3).
  // Phones only: on desktop the browser's Back keeps its usual meaning.
  const phoneSelection = phone && hasSelection && selView;
  // Menus, dialogs and steps opened on top (latest first), compare and walking; then the checks, the
  // selection, a page (a level for each page above Style's), and the sheet a height at a time.
  const layers = useStore(backStore, (s) => s.layers);
  const [leaving, setLeaving] = useState(false);
  useBackLayer(phone && !!compare, () => viewStore.setState({ compare: null }));
  useBackLayer(phone && camera === "walk", () =>
    editor.setCamera(seat && seat.from !== "walk" ? seat.from : "dollhouse"),
  );
  useBackLayer(phone && !!pickSeat, () => viewStore.setState({ pickSeat: null }));
  const depth = phone
    ? layers.length +
      (checks ? 1 : 0) +
      (phoneSelection ? 1 : 0) +
      (page && panelShown ? (stylePage && parentPage(stylePage) ? 2 : 1) : 0) +
      (panelShown ? SHEET_ORDER.indexOf(detent) : 0)
    : 0;
  const leave = useBackLayers(
    depth,
    () => {
      const top = layers[layers.length - 1];
      if (top) top.close();
      else if (checks) setChecks(false);
      else if (phoneSelection) editor.select([]);
      else if (page && panelShown) setPage(stylePage && parentPage(stylePage));
      else if (panelShown) setSheet(SHEET_ORDER[SHEET_ORDER.indexOf(detent) - 1] ?? "closed");
    },
    phone,
    () => setLeaving(true),
  );

  // Desktop: the camera frames the room beside the rail and the panel (DESIGN_GUIDE §3.1).
  const insetLeft = phone ? 0 : RAIL + (panelShown ? width : 0);
  const insetRight = phone ? PHONE_COLUMN : 0;
  // The width the couple set is remembered on this device.
  useEffect(() => saveWidth(width), [width]);
  const insetTop = phone ? 0 : TOOLBAR_INSET;
  useEffect(() => {
    viewStore.setState({ insetLeft, insetRight, insetTop });
  }, [insetLeft, insetRight, insetTop]);

  // Phone: the camera centres the room above the sheet and the tab bar, measured again once the
  // sheet's height transition ends.
  const ui = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ui.current;
    if (!phone || camera === "walk" || !root) {
      viewStore.setState({ insetBottom: 0, insetColumn: 0 });
      return;
    }
    const measure = () => {
      const h = root.clientHeight;
      const top = root.getBoundingClientRect().top;
      const covers = [...root.querySelectorAll(".panel, .tabbar")].map(
        (el) => el.getBoundingClientRect().top,
      );
      const column = root.querySelector(".phone-controls")?.getBoundingClientRect().bottom ?? top;
      viewStore.setState({
        insetBottom: Math.round(h - Math.min(h, ...covers)),
        insetColumn: Math.round(column - top),
      });
    };
    measure();
    root.addEventListener("transitionend", measure);
    window.addEventListener("resize", measure);
    return () => {
      root.removeEventListener("transitionend", measure);
      window.removeEventListener("resize", measure);
    };
  }, [phone, camera, panelShown, detent, phoneSelection]);

  // Shows a section, whatever was open.
  const show = (id: Section) => {
    setChecks(false);
    setPage(null);
    setDetails(false);
    setSelView(false);
    setSection(id);
    setPanelOpen(true);
    if (phone) setSheet((d) => (d === "closed" || d === "peek" ? "half" : d));
  };
  // A rail or tab button: on desktop the open section's button folds the panel away, and brings it back.
  const go = (id: Section) => {
    if (!phone && id === section && panelOpen && !details && !page) setPanelOpen(false);
    else show(id);
  };
  // Escape closes the checks before anything else reads it (deselecting, leaving walk).
  useEffect(() => {
    if (!checks) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setChecks(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [checks]);
  const openChecks = () => {
    setChecks((c) => !c || phone);
    if (phone) setSheet((d) => (d === "closed" || d === "peek" ? "half" : d));
  };
  const adjustRules = () => {
    setChecks(false);
    setDetails(false);
    setSelView(false);
    setSection("room");
    setPage("rules");
    setPanelOpen(true);
    if (phone) setSheet("full");
  };
  const styleSelection = () => {
    setSection("style");
    setSelView(false);
    setDetails(false);
    setPanelOpen(true);
    if (phone) setSheet("half");
  };

  const sectionContent =
    section === "room" ? (
      page === "rules" ? (
        <LayoutRules onBack={() => setPage(null)} />
      ) : page === "paintings" ? (
        <PaintingsPage onBack={() => setPage(null)} />
      ) : page === "flowers" ? (
        <BarFlowersPage onBack={() => setPage(null)} />
      ) : page === "graphics" ? (
        <GraphicsPage onBack={() => setPage(null)} />
      ) : (
        <RoomPanel
          open={(p) => {
            setPage(p);
            // On a phone the room stays in view while a graphics choice applies (mock-up).
            if (p === "graphics" && phone) setSheet("half");
          }}
        />
      )
    ) : section === "add" ? (
      <AddPanel
        key={libraryKey}
        // Added and selected: phones drop the sheet to its peek to show it; desktop keeps the list.
        onAdded={() => phone && setSheet("peek")}
        yours={(head) => <InspirationPanel head={head} onAdded={() => phone && setSheet("peek")} />}
      />
    ) : section === "style" ? (
      <StylePanel key={selection.join(",")} page={stylePage} open={setPage} />
    ) : section === "guests" ? (
      <PeoplePanel />
    ) : (
      <PlansPanel />
    );
  const label = SECTIONS.find((s) => s.id === section)?.label ?? "";
  const content =
    phone && checks ? (
      <ChecksList onAdjust={adjustRules} onClose={() => setChecks(false)} phone />
    ) : phoneSelection ? (
      <Inspector phone onStyle={styleSelection} />
    ) : !phone && details && hasSelection ? (
      <Inspector phone={false} back={{ label, onBack: () => setDetails(false) }} onStyle={styleSelection} />
    ) : (
      sectionContent
    );

  // Phone sheet: drag its head, or its content once scrolled to the top, to step it down to closed;
  // the head steps it up to full, its content only from peek to half; a quick flick skips a step
  // (DESIGN_GUIDE §3.2).
  const panel = useRef<HTMLDivElement>(null);
  // Each new page starts at its top (the scroll area is shared by every section and page).
  const scrollKey = `${section}:${page}:${details}:${phoneSelection}:${checks}`;
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [scrollKey]);
  const swipe = useRef<{ x: number; y: number; t: number; grip: boolean; top: boolean } | null>(null);
  const startSwipe = (t: { clientX: number; clientY: number } | undefined, from: EventTarget) => {
    // Sliders and scrubbed figures keep their own drags.
    if (!t || (from instanceof Element && from.closest("input[type=range], .scrub"))) return;
    // The whole head (grabber, counts line) is the handle: the grabber alone is too thin for a finger.
    const grip = from instanceof Element && from.closest(".sheet-head") !== null;
    swipe.current = {
      x: t.clientX,
      y: t.clientY,
      t: performance.now(),
      grip,
      top: grip || (panel.current?.scrollTop ?? 0) <= 0,
    };
  };
  const endSwipe = (t: { clientX: number; clientY: number } | undefined) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || !t) return;
    const dy = t.clientY - s.y;
    // A short or sideways drag is not a swipe; content pulls the sheet down only from its very top.
    if (Math.abs(dy) < SWIPE_MIN || Math.abs(dy) < Math.abs(t.clientX - s.x)) return;
    if (dy > 0 && !s.top) return;
    // Content raises the sheet only from its peek, to half; from half it scrolls, and only the
    // grabber opens it full (owner, 2026-10-17).
    if (dy < 0 && !s.grip && detent !== "peek") return;
    const by = Math.abs(dy) / Math.max(1, performance.now() - s.t) > FLICK && (dy > 0 || s.grip) ? 2 : 1;
    const i = SHEET_ORDER.indexOf(detent) + (dy > 0 ? -by : by);
    setSheet(SHEET_ORDER[Math.max(0, Math.min(SHEET_ORDER.length - 1, i))] ?? detent);
  };

  const showCounts = !phone && !compare;
  return (
    <div
      className={`ui cam-${camera}`}
      data-sheet={phone && panelShown ? detent : "none"}
      ref={ui}
      style={{ "--inset-left": `${insetLeft}px` } as CSSProperties}
    >
      {PERF && <PerfOverlay />}
      {!phone && (
        <>
          <nav className="rail" aria-label="Sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={section === s.id && panelOpen ? "on" : ""}
                aria-pressed={section === s.id && panelOpen}
                onClick={() => go(s.id)}
                data-testid={`section-${s.id}`}
              >
                <Icon name={s.icon} />
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
          <header className="topbar">
            <div className="plan-name glass">
              <button
                type="button"
                className="plan-name-btn"
                onClick={() => show("plans")}
                title="Plans"
                data-testid="plan-name"
              >
                <span className="plan-name-text">{planName}</span>
                <Icon name="chevron" size={16} />
              </button>
              <SaveState short />
            </div>
            <CameraSwitch />
            <Actions />
          </header>
        </>
      )}
      {phone && <PhoneControls />}

      {panelShown && (
        <aside
          className={`panel detent-${detent}`}
          aria-label={label}
          style={phone ? undefined : { width }}
          onTouchStart={phone ? (e) => startSwipe(e.touches[0], e.target) : undefined}
          onTouchEnd={phone ? (e) => endSwipe(e.changedTouches[0]) : undefined}
        >
          {phone && (
            <div className="sheet-head">
              <button
                type="button"
                className="grabber"
                aria-label="Resize sheet"
                onClick={() => setSheet((d) => (d === "peek" ? "half" : d === "half" ? "full" : "peek"))}
                onPointerDown={(e) => e.pointerType === "mouse" && startSwipe(e, e.target)}
                onPointerUp={(e) => e.pointerType === "mouse" && endSwipe(e)}
              />
              <CountsLine onAdvisories={openChecks} />
              <SaveState />
            </div>
          )}
          <div className="panel-scroll" ref={panel}>
            {content}
          </div>
          {!phone && (
            <button
              type="button"
              className="icon-btn panel-collapse"
              onClick={() => setPanelOpen(false)}
              aria-label="Collapse panel"
              title="Collapse panel"
              data-testid="panel-collapse"
            >
              <Icon name="sidebar" />
            </button>
          )}
        </aside>
      )}
      {!phone && panelShown && (
        <div
          className="panel-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Panel width"
          aria-valuemin={PANEL.min}
          aria-valuemax={PANEL.max}
          aria-valuenow={width}
          tabIndex={0}
          onKeyDown={(e) => {
            const by = e.key === "ArrowLeft" ? -20 : e.key === "ArrowRight" ? 20 : 0;
            if (!by) return;
            setWidth(clampWidth(width + by));
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            document.body.style.cursor = "col-resize";
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(clampWidth(e.clientX - RAIL));
          }}
          onLostPointerCapture={() => (document.body.style.cursor = "")}
        />
      )}

      {showCounts && <Counts onAdvisories={openChecks} />}
      {!phone && checks && (
        <div className="checks-pop" role="dialog" aria-label="Checks">
          <ChecksList onAdjust={adjustRules} onClose={() => setChecks(false)} phone={false} />
        </div>
      )}
      {!phone && !compare && camera !== "walk" && !pickSeat && (
        <SelectionBar
          onDetails={() => {
            setDetails(true);
            setPanelOpen(true);
          }}
        />
      )}
      {pickSeat && camera !== "walk" && (
        <div className="walk-hint glass seated" role="status" data-testid="picking">
          <span>Choose a seat · {picking}</span>
          <button type="button" className="plain-btn" onClick={() => viewStore.setState({ pickSeat: null })}>
            Cancel
          </button>
        </div>
      )}
      {camera === "walk" && seat && (
        <div className="walk-hint glass seated" data-testid="seated">
          <span>Seated · {seated} · drag to look around</span>
          <button
            type="button"
            className="plain-btn"
            onClick={() => editor.setCamera(seat.from === "walk" ? "dollhouse" : seat.from)}
          >
            Stand up
          </button>
        </div>
      )}
      {camera === "walk" && !seat && (
        <>
          <p className="walk-hint glass">
            <span className="desktop-only">Click to look around · WASD or arrows to move · Esc to stop</span>
            <span className="touch-only">Drag to look · use the pad to move</span>
          </p>
          <Joystick />
        </>
      )}

      {phone && (
        <nav className="tabbar" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id && panelShown && !phoneSelection && !checks ? "on" : ""}
              aria-pressed={section === s.id && panelShown && !phoneSelection && !checks}
              onClick={() => go(s.id)}
              data-testid={`section-${s.id}`}
            >
              <Icon name={s.icon} />
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
      )}
      <Toast />
      <OfflineBanner />
      <ConflictDialog />
      <PartnerChooser />
      {leaving && (
        <LeaveDialog
          status={<SaveState />}
          onStay={() => setLeaving(false)}
          onLeave={() => {
            setLeaving(false);
            leave();
          }}
        />
      )}
      <Loading />
    </div>
  );
}
