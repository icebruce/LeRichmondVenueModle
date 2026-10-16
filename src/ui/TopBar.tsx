import { useEffect, useRef, useState } from "react";
import type { CameraMode } from "../state/editor";
import { requestCamera } from "../state/view";
import { useEditor, useStudio } from "../scene/context";
import { Icon, type IconName } from "./icons";
import { useServices } from "./services";
import { VersionHistory } from "./Dialogs";

const CAMERAS: { mode: CameraMode; label: string; icon: IconName; key: string }[] = [
  { mode: "dollhouse", label: "Dollhouse", icon: "cube", key: "1" },
  { mode: "plan", label: "Plan", icon: "plan", key: "2" },
  { mode: "walk", label: "Walk", icon: "walk", key: "3" },
];

export function CameraSwitch() {
  const { editor } = useStudio();
  const mode = useEditor((s) => s.camera);
  return (
    <div className="camera-group">
      <div className="seg glass" role="radiogroup" aria-label="Camera">
        {CAMERAS.map((c) => (
          <button
            key={c.mode}
            type="button"
            role="radio"
            aria-checked={mode === c.mode}
            className={mode === c.mode ? "on" : ""}
            onClick={() => editor.setCamera(c.mode)}
            title={`${c.label} (${c.key})`}
            data-testid={`camera-${c.mode}`}
          >
            <Icon name={c.icon} />
            <span className="seg-label">{c.label}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="icon-btn glass reset-view"
        onClick={() => requestCamera(null)}
        aria-label="Reset view"
        title="Reset view"
      >
        <Icon name="frame" />
      </button>
    </div>
  );
}

function SaveState() {
  const state = useEditor((s) => s.saveState);
  const cloud = useEditor((s) => s.cloud);
  const text =
    state === "saving"
      ? "Saving…"
      : state === "offline"
        ? "Offline — kept on this device"
        : state === "error"
          ? cloud
            ? "Not shared yet — kept on this device"
            : "Not saved — storage unavailable"
          : cloud
            ? "Saved · shared"
            : "Saved on this device";
  return (
    <span className={`save-state ${state}`} data-testid="save-state">
      {text}
    </span>
  );
}

export function ScenarioMenu() {
  const { editor } = useStudio();
  const services = useServices();
  const scenarios = useEditor((s) => s.scenarios);
  const order = useEditor((s) => s.order);
  const activeId = useEditor((s) => s.activeId);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [history, setHistory] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = scenarios[activeId];

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const act = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="scenario glass" ref={ref}>
      {renaming && active ? (
        <form
          className="rename"
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("name");
            if (typeof v === "string") editor.renameScenario(v);
            setRenaming(false);
          }}
        >
          <label className="sr-only" htmlFor="scenario-name">
            Scenario name
          </label>
          <input
            id="scenario-name"
            name="name"
            defaultValue={active.name}
            maxLength={80}
            autoFocus
            onBlur={(e) => {
              editor.renameScenario(e.currentTarget.value);
              setRenaming(false);
            }}
          />
        </form>
      ) : (
        <button
          type="button"
          className="scenario-button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          data-testid="scenario-menu"
        >
          <span className="scenario-name">{active?.name}</span>
          <Icon name="chevron" size={16} />
        </button>
      )}
      <SaveState />
      {open && (
        <div className="menu" role="menu">
          <div className="menu-group" aria-label="Scenarios">
            {order.map((id) => (
              <button
                key={id}
                role="menuitemradio"
                aria-checked={id === activeId}
                type="button"
                className="menu-item"
                onClick={act(() => editor.switchScenario(id))}
              >
                <span className="check">{id === activeId && <Icon name="check" size={16} />}</span>
                {scenarios[id]?.name}
              </button>
            ))}
          </div>
          <div className="menu-group">
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={act(() => editor.duplicateScenario(activeId))}
            >
              <span className="check" />
              Duplicate
            </button>
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={act(() => setRenaming(true))}
            >
              <span className="check" />
              Rename
            </button>
            {services.cloud.status === "on" && (
              <button
                role="menuitem"
                type="button"
                className="menu-item"
                onClick={act(() => setHistory(true))}
                data-testid="history"
              >
                <span className="check" />
                Version history…
              </button>
            )}
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={act(() => editor.createScenario("sample"))}
            >
              <span className="check" />
              New from venue sample
            </button>
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={act(() => editor.createScenario("blank"))}
            >
              <span className="check" />
              New empty room
            </button>
          </div>
          <div className="menu-group">
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={act(() => services.exportScenario(activeId))}
            >
              <span className="check">
                <Icon name="download" size={16} />
              </span>
              Save as file
            </button>
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={() => fileRef.current?.click()}
            >
              <span className="check">
                <Icon name="upload" size={16} />
              </span>
              Open file…
            </button>
          </div>
          <div className="menu-group" aria-label="Export">
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={act(() => void services.exportPlan("pdf"))}
              data-testid="export-pdf"
            >
              <span className="check">
                <Icon name="download" size={16} />
              </span>
              Plan for the venue (PDF)
            </button>
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={act(() => void services.exportPlan("png"))}
              data-testid="export-png"
            >
              <span className="check">
                <Icon name="download" size={16} />
              </span>
              Plan as an image (PNG)
            </button>
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={act(() => void services.saveView())}
              data-testid="save-view"
            >
              <span className="check">
                <Icon name="download" size={16} />
              </span>
              Save this view as an image
            </button>
          </div>
          <div className="menu-group">
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={act(() => editor.deleteScenario(activeId))}
            >
              <span className="check" />
              Delete scenario
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="import-file"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void services.importScenario(f);
              e.currentTarget.value = "";
              setOpen(false);
            }}
          />
        </div>
      )}
      {history && <VersionHistory onClose={() => setHistory(false)} />}
    </div>
  );
}

/** Undo and redo; in the top bar on desktop, floating above the sheet on phones (DESIGN_GUIDE §3.2). */
export function History({ className = "" }: { className?: string }) {
  const { editor } = useStudio();
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  return (
    <div className={`history ${className}`}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => editor.undo()}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo (⌘Z)"
        data-testid={className ? undefined : "undo"}
      >
        <Icon name="undo" />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => editor.redo()}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo (⇧⌘Z)"
        data-testid={className ? undefined : "redo"}
      >
        <Icon name="redo" />
      </button>
    </div>
  );
}

export function Actions() {
  const { editor } = useStudio();
  const lighting = useEditor((s) => s.scenarios[s.activeId]?.style.lighting ?? "evening");
  const plan = useEditor((s) => s.camera === "plan");
  return (
    <div className="actions glass">
      <History />
      {/* Phone: one button that flips evening and daylight, to keep the top bar to one row. */}
      <button
        type="button"
        className="icon-btn light-toggle"
        disabled={plan}
        onClick={() => editor.setStyle("lighting", lighting === "evening" ? "day" : "evening")}
        aria-label={lighting === "evening" ? "Switch to daylight" : "Switch to evening light"}
        title={plan ? "Plan view always uses daylight" : undefined}
      >
        <Icon name={lighting === "evening" && !plan ? "moon" : "sun"} />
      </button>
      <div
        className="seg light-seg"
        role="radiogroup"
        aria-label="Lighting"
        aria-disabled={plan}
        title={plan ? "Plan view always uses daylight" : undefined}
      >
        <button
          type="button"
          role="radio"
          aria-checked={lighting === "evening" && !plan}
          className={lighting === "evening" && !plan ? "on" : ""}
          disabled={plan}
          onClick={() => editor.setStyle("lighting", "evening")}
          data-testid="light-evening"
        >
          <Icon name="moon" />
          <span className="seg-label">Evening</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={lighting === "day" || plan}
          className={lighting === "day" || plan ? "on" : ""}
          disabled={plan}
          onClick={() => editor.setStyle("lighting", "day")}
          data-testid="light-day"
        >
          <Icon name="sun" />
          <span className="seg-label">Day</span>
        </button>
      </div>
    </div>
  );
}
