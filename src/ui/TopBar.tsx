import { useEffect, useRef, useState } from "react";
import type { CameraMode } from "../state/editor";
import { useEditor, useStudio } from "../scene/context";
import { Icon, type IconName } from "./icons";
import { useServices } from "./services";

const CAMERAS: { mode: CameraMode; label: string; icon: IconName; key: string }[] = [
  { mode: "dollhouse", label: "Dollhouse", icon: "cube", key: "1" },
  { mode: "plan", label: "Plan", icon: "plan", key: "2" },
  { mode: "walk", label: "Walk", icon: "walk", key: "3" },
];

export function CameraSwitch() {
  const { editor } = useStudio();
  const mode = useEditor((s) => s.camera);
  return (
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
  );
}

function SaveState() {
  const state = useEditor((s) => s.saveState);
  const text =
    state === "saving"
      ? "Saving…"
      : state === "error"
        ? "Not saved — storage unavailable"
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
            if (typeof v === "string") editor.renameScenario(activeId, v);
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
              editor.renameScenario(activeId, e.currentTarget.value);
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
              Duplicate
            </button>
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={act(() => setRenaming(true))}
            >
              Rename
            </button>
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={act(() => editor.createScenario("sample"))}
            >
              New from venue sample
            </button>
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={act(() => editor.createScenario("blank"))}
            >
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
              <Icon name="download" size={16} /> Save as file
            </button>
            <button
              role="menuitem"
              type="button"
              className="menu-item"
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="upload" size={16} /> Open file…
            </button>
            <button
              role="menuitem"
              type="button"
              className="menu-item danger"
              onClick={act(() => editor.deleteScenario(activeId))}
            >
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
    </div>
  );
}

export function Actions() {
  const { editor } = useStudio();
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const lighting = useEditor((s) => s.scenarios[s.activeId]?.style.lighting ?? "evening");
  return (
    <div className="actions glass">
      <button
        type="button"
        className="icon-btn"
        onClick={() => editor.undo()}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo (⌘Z)"
        data-testid="undo"
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
        data-testid="redo"
      >
        <Icon name="redo" />
      </button>
      <div className="seg" role="radiogroup" aria-label="Lighting">
        <button
          type="button"
          role="radio"
          aria-checked={lighting === "evening"}
          className={lighting === "evening" ? "on" : ""}
          onClick={() => editor.setStyle("lighting", "evening")}
          data-testid="light-evening"
        >
          <Icon name="moon" />
          <span className="seg-label">Evening</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={lighting === "day"}
          className={lighting === "day" ? "on" : ""}
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
