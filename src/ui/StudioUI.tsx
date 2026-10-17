import { type CSSProperties, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useProgress } from "@react-three/drei";
import { countLayout, tableLabels } from "../domain/layout/counts";
import { shapeOf } from "../domain/layout/items";
import { itemTitle, spotFor } from "../domain/layout/validate";
import type { Scenario } from "../domain/scenario/schema";
import type { StoreApi } from "zustand/vanilla";
import { type EditorState, ROTATE_STEP } from "../state/editor";
import { adviseScenario } from "../domain/layout/advisories";
import { useEditor, useStudio, useView } from "../scene/context";
import { viewStore, walkInput } from "../state/view";
import { Icon, type IconName } from "./icons";
import {
  AddPanel,
  ChecksList,
  DecorPanel,
  Inspector,
  LayoutRules,
  PaintingsPage,
  PeoplePanel,
  RoomPanel,
  type Section,
  SelectionActions,
  showYours,
} from "./Panels";
import { PlansPanel, SaveState } from "./Plans";
import { Actions, CameraSwitch, PhoneControls } from "./TopBar";
import { ConflictDialog, OfflineBanner, PartnerChooser } from "./Dialogs";
import { InspirationPanel } from "./Inspiration";

/** The five sections (DESIGN_GUIDE §3): a rail on desktop, a tab bar on phones, same order. */
const SECTIONS: { id: Section; label: string; icon: IconName }[] = [
  { id: "room", label: "Room", icon: "venue" },
  { id: "add", label: "Add", icon: "add" },
  { id: "style", label: "Style", icon: "decor" },
  { id: "guests", label: "Guests", icon: "people" },
  { id: "plans", label: "Plans", icon: "plans" },
];

/** Desktop rail width (the `--rail-w` token) and the panel's width range (DESIGN_GUIDE §3.1). */
const RAIL = 76;
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
        <span>tables</span>
      </div>
      <div className="count">
        <b data-testid={id ? undefined : "count-seats"}>{c.seats}</b>
        <span>seats</span>
      </div>
      <div className="count">
        <b data-testid={id ? undefined : "count-guests"}>{c.guests}</b>
        <span>guests</span>
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
      <span>{c.tables} tables</span> · <span>{c.seats} seats</span>
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
 * Keeps the browser's history in step with the open layers (a sheet, a page, details, the checks):
 * opening one adds an entry, so the system back gesture closes the top layer; closing one in the app
 * takes its entry away again. With `guard` (phones) one more entry sits under the layers, so back
 * with nothing open never leaves the app (DESIGN_GUIDE §3.2).
 */
function useBackLayers(depth: number, closeTop: () => void, guard: boolean) {
  const synced = useRef(0);
  const skip = useRef(0);
  const guarded = useRef(false);
  const close = useRef(closeTop);
  useEffect(() => {
    close.current = closeTop;
  });
  useEffect(() => {
    if (!guard || guarded.current) return;
    guarded.current = true;
    history.pushState({ rsGuard: true }, "");
  }, [guard]);
  useEffect(() => {
    const onPop = () => {
      if (skip.current) {
        skip.current--;
        return;
      }
      if (synced.current === 0) {
        // Below the last layer: put the guard back and stay.
        if (guarded.current) history.pushState({ rsGuard: true }, "");
        return;
      }
      synced.current--;
      close.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (depth > synced.current) {
      for (let i = synced.current; i < depth; i++) history.pushState({ rsLayer: i + 1 }, "");
    } else if (depth < synced.current) {
      skip.current++;
      history.go(depth - synced.current);
    }
    synced.current = depth;
  }, [depth]);
}

/** Desktop: the selection's toolbar, just above it in the room (DESIGN_GUIDE §5). */
function SelectionBar({ onDetails }: { onDetails: () => void }) {
  const { catalog, venue } = useStudio();
  const anchor = useView((s) => s.anchor);
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
      style={{ left: anchor[0], top: anchor[1] }}
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
  const [page, setPage] = useState<"rules" | "paintings" | null>(null);
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
  // Sit here (CAM-04): leaving walk ends the seat; a selection change ends picking one.
  const seat = useView((s) => s.seat);
  const activeItems = useEditor((s) => s.scenarios[s.activeId]?.items ?? []);
  const seated = seat ? `table ${tableLabels(activeItems, catalog).get(seat.table) ?? ""}`.trim() : "";
  const pickSeat = useView((s) => s.pickSeat);
  const picking = pickSeat ? `table ${tableLabels(activeItems, catalog).get(pickSeat) ?? ""}`.trim() : "";
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
  const phoneSelection = phone && hasSelection && selView;
  const depth =
    (checks ? 1 : 0) +
    (!phone && details && hasSelection ? 1 : 0) +
    (phoneSelection ? 1 : 0) +
    (page ? 1 : 0) +
    (phone && panelShown ? 1 : 0);
  useBackLayers(
    depth,
    () => {
      if (checks) setChecks(false);
      else if (!phone && details && hasSelection) setDetails(false);
      else if (phoneSelection) editor.select([]);
      else if (page) setPage(null);
      else if (phone && panelShown) setSheet("closed");
    },
    phone,
  );

  // Desktop: the camera frames the room beside the rail and the panel (DESIGN_GUIDE §3.1).
  const insetLeft = phone ? 0 : RAIL + (panelShown ? width : 0);
  // Phone: the overview keeps the room clear of the control column on the right (44 pt + margins).
  const insetRight = phone ? 64 : 0;
  // Desktop: the toolbar row (12 + 44 + 8 px) sits over the top of the room.
  const insetTop = phone ? 0 : 64;
  useEffect(() => {
    viewStore.setState({ insetLeft, insetRight, insetTop });
  }, [insetLeft, insetRight, insetTop]);

  // Phone: the camera centres the room above the sheet and the tab bar, measured again once the
  // sheet's height transition ends.
  const ui = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ui.current;
    if (!phone || camera === "walk" || !root) {
      viewStore.setState({ insetBottom: 0 });
      return;
    }
    const measure = () => {
      const h = root.clientHeight;
      const covers = [...root.querySelectorAll(".panel, .tabbar")].map(
        (el) => el.getBoundingClientRect().top,
      );
      viewStore.setState({ insetBottom: Math.round(h - Math.min(h, ...covers)) });
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
      ) : (
        <RoomPanel open={setPage} />
      )
    ) : section === "add" ? (
      <AddPanel
        key={libraryKey}
        // Added and selected: phones drop the sheet to its peek to show it; desktop keeps the list.
        onAdded={() => phone && setSheet("peek")}
        yours={(head) => <InspirationPanel head={head} />}
      />
    ) : section === "style" ? (
      <DecorPanel key={selection.join(",")} />
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

  // Phone sheet: drag its handle, or its content once scrolled to the top, to step it down to closed
  // or up to full; a quick flick skips a step (DESIGN_GUIDE §3.2).
  const panel = useRef<HTMLDivElement>(null);
  // Each new page starts at its top (the scroll area is shared by every section and page).
  const scrollKey = `${section}:${page}:${details}:${phoneSelection}:${checks}`;
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [scrollKey]);
  const swipe = useRef<{ x: number; y: number; t: number; top: boolean } | null>(null);
  const startSwipe = (t: { clientX: number; clientY: number } | undefined, from: EventTarget) => {
    // Sliders and scrubbed figures keep their own drags.
    if (!t || (from instanceof Element && from.closest("input[type=range], .scrub"))) return;
    swipe.current = {
      x: t.clientX,
      y: t.clientY,
      t: performance.now(),
      top:
        from instanceof Element && from.closest(".grabber") !== null
          ? true
          : (panel.current?.scrollTop ?? 0) <= 0,
    };
  };
  const endSwipe = (t: { clientX: number; clientY: number } | undefined) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || !t) return;
    const dy = t.clientY - s.y;
    // A short or sideways drag is not a swipe; content pulls the sheet down only from its very top.
    if (Math.abs(dy) < 48 || Math.abs(dy) < Math.abs(t.clientX - s.x)) return;
    if (dy > 0 && !s.top) return;
    const by = Math.abs(dy) / Math.max(1, performance.now() - s.t) > 0.9 ? 2 : 1;
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
                <span className="plan-name-text">{editor.active().name}</span>
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
            saveWidth(clampWidth(width + by));
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            document.body.style.cursor = "col-resize";
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) setWidth(clampWidth(e.clientX - RAIL));
          }}
          onPointerUp={(e) => saveWidth(clampWidth(e.clientX - RAIL))}
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
      <Loading />
    </div>
  );
}
