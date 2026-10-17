import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useProgress } from "@react-three/drei";
import { countLayout, tableLabels } from "../domain/layout/counts";
import type { Scenario } from "../domain/scenario/schema";
import { ROTATE_STEP } from "../state/editor";
import { adviseScenario } from "../domain/layout/advisories";
import { useEditor, useStudio, useView } from "../scene/context";
import { viewStore, walkInput } from "../state/view";
import { Icon, type IconName } from "./icons";
import {
  ComparePanel,
  DecorPanel,
  Inspector,
  LayoutPanel,
  PeoplePanel,
  type Section,
  VenuePanel,
} from "./Panels";
import { Actions, CameraSwitch, History, ScenarioMenu } from "./TopBar";
import { ConflictDialog, OfflineBanner, PartnerChooser } from "./Dialogs";
import { InspirationPanel } from "./Inspiration";

const SECTIONS: { id: Section; label: string; icon: IconName }[] = [
  { id: "venue", label: "Venue", icon: "venue" },
  { id: "layout", label: "Layout", icon: "layout" },
  { id: "people", label: "People", icon: "people" },
  { id: "decor", label: "Décor", icon: "decor" },
  { id: "inspiration", label: "Inspiration", icon: "photo" },
  { id: "compare", label: "Compare", icon: "compare" },
];

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
 * Desktop: floating counts strip, bottom-left (LAY-07). Side by side (SCN-06) each half shows its
 * own, named, strip; `onAdvisories` opens the list of checks.
 */
export function Counts({ id, onAdvisories }: { id?: string; onAdvisories?: () => void }) {
  const c = useSummary(id);
  const advisories = (
    <>
      <b data-testid={id ? undefined : "count-advisories"}>{c.advisories}</b>
      <span>{c.advisories === 1 ? "advisory" : "advisories"}</span>
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
        <button type="button" className="count warn count-btn" onClick={onAdvisories}>
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
      <span>{c.tables} tables</span> · <span>{c.seats} seats</span> · <span>{c.guests} guests</span>
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
          <button type="button" className="warn link-btn" onClick={onAdvisories}>
            {c.advisories} {c.advisories === 1 ? "advisory" : "advisories"}
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

export function StudioUI() {
  const { editor } = useStudio();
  const selection = useEditor((s) => s.selection);
  const camera = useEditor((s) => s.camera);
  const [section, setSection] = useState<Section | null>("layout");
  const [chosen, setDetent] = useState<Detent>("peek");
  const drag = useRef<number | null>(null);
  useShortcuts();

  const phone = useMedia(PHONE);
  // Sit here (CAM-04): leaving walk ends the seat; a selection change ends picking one.
  const seat = useView((s) => s.seat);
  const { catalog } = useStudio();
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
    if (selection.length) viewStore.setState({ pickSeat: null });
  }, [selection]);
  // "Request a custom model" in the inspector opens the form in Inspiration (REQ-01).
  useEffect(
    () =>
      viewStore.subscribe((s, prev) => {
        if (!s.requestFor || s.requestFor === prev.requestFor) return;
        setSection("inspiration");
        setDetent((d) => (d === "peek" ? "half" : d));
      }),
    [],
  );
  const compare = useView((s) => s.compare);
  // Phone side by side needs the screen: the half-height sheet stays at its peek (full still opens).
  const detent: Detent = phone && compare && chosen === "half" ? "peek" : chosen;
  const hasSelection = selection.length > 0;
  const showPanel = camera !== "walk" && (hasSelection || section !== null);

  // Desktop: the camera frames the room beside the panel (340 px, its border and margin), not under it.
  useEffect(() => {
    viewStore.setState({ insetRight: showPanel && !phone ? 354 : 0 });
  }, [showPanel, phone]);

  // Phone: the camera centres the room between the top bar and the sheet (and the floating Undo
  // above it), measured again once the sheet's height transition ends.
  const ui = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ui.current;
    if (!phone || camera === "walk" || !root) {
      viewStore.setState({ insetTop: 0, insetBottom: 0 });
      return;
    }
    const measure = () => {
      const h = root.clientHeight;
      const top = root.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
      const covers = [...root.querySelectorAll(".panel, .tabbar, .history-float")].map(
        (el) => el.getBoundingClientRect().top,
      );
      const bottom = Math.min(h, ...covers);
      viewStore.setState({ insetTop: Math.round(top), insetBottom: Math.round(h - bottom) });
    };
    measure();
    root.addEventListener("transitionend", measure);
    window.addEventListener("resize", measure);
    return () => {
      root.removeEventListener("transitionend", measure);
      window.removeEventListener("resize", measure);
    };
  }, [phone, camera, showPanel, detent, hasSelection]);
  // Décor works on the selection, so it stays open while tables are selected.
  const content =
    section === "decor" ? (
      <DecorPanel key={selection.join(",")} />
    ) : section === "compare" ? (
      <ComparePanel />
    ) : hasSelection ? (
      <Inspector />
    ) : section === "venue" ? (
      <VenuePanel />
    ) : section === "layout" ? (
      <LayoutPanel />
    ) : section === "people" ? (
      <PeoplePanel />
    ) : section === "inspiration" ? (
      <InspirationPanel />
    ) : null;

  // The advisory count opens the list of checks (Layout, scrolled to them).
  const showChecks = () => {
    editor.select([]);
    setSection("layout");
    setDetent((d) => (d === "peek" ? "half" : d));
    window.requestAnimationFrame(() =>
      document.getElementById("checks")?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      }),
    );
  };

  const pick = (id: Section) => {
    setSection((s) => (s === id && !phone ? null : id));
    setDetent((d) => (d === "peek" ? "half" : d));
  };

  // Floating phone controls (Undo, toast) sit just above the sheet, whatever its height.
  const sheet = !phone ? "none" : showPanel ? detent : "none";

  return (
    <div className={`ui cam-${camera}`} data-sheet={sheet} ref={ui}>
      <header className="topbar">
        <ScenarioMenu />
        <CameraSwitch />
        <Actions />
      </header>

      <nav className="rail" aria-label="Sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={section === s.id ? "on" : ""}
            aria-pressed={section === s.id}
            onClick={() => pick(s.id)}
            data-testid={`section-${s.id}`}
          >
            <Icon name={s.icon} />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {showPanel && (
        <aside className={`panel detent-${detent}`} aria-label={hasSelection ? "Inspector" : "Panel"}>
          <button
            type="button"
            className="grabber"
            aria-label="Resize panel"
            onClick={() => setDetent((d) => (d === "peek" ? "half" : d === "half" ? "full" : "peek"))}
            onPointerDown={(e) => (drag.current = e.clientY)}
            onPointerUp={(e) => {
              if (drag.current === null) return;
              const dy = e.clientY - drag.current;
              drag.current = null;
              if (dy < -40) setDetent((d) => (d === "peek" ? "half" : "full"));
              if (dy > 40) setDetent((d) => (d === "full" ? "half" : "peek"));
            }}
          />
          {phone && <CountsLine onAdvisories={showChecks} />}
          {content}
        </aside>
      )}

      {!phone && !compare && <Counts onAdvisories={showChecks} />}
      {phone && camera !== "walk" && <History className="history-float glass" />}
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

      <nav className="tabbar" aria-label="Sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={section === s.id ? "on" : ""}
            aria-pressed={section === s.id}
            onClick={() => pick(s.id)}
          >
            <Icon name={s.icon} />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>
      <Toast />
      <OfflineBanner />
      <ConflictDialog />
      <PartnerChooser />
      <Loading />
    </div>
  );
}
