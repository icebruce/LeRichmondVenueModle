import { useEffect, useRef, useState } from "react";
import type { CameraMode } from "../state/editor";
import { requestCamera } from "../state/view";
import { useEditor, useStudio } from "../scene/context";
import { Icon, type IconName } from "./icons";

const CAMERAS: { mode: CameraMode; label: string; icon: IconName; key: string }[] = [
  { mode: "dollhouse", label: "Dollhouse", icon: "cube", key: "1" },
  { mode: "plan", label: "Plan", icon: "plan", key: "2" },
  { mode: "walk", label: "Walk", icon: "walk", key: "3" },
];

function ResetView() {
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => requestCamera(null)}
      aria-label="Reset view"
      title="Reset view"
    >
      <Icon name="frame" />
    </button>
  );
}

/** Desktop: the three cameras and Reset view in one pill (CAM-01..03, CAM-05). */
export function CameraSwitch() {
  const { editor } = useStudio();
  const mode = useEditor((s) => s.camera);
  return (
    <div className="seg glass camera-seg" role="radiogroup" aria-label="Camera">
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
      <span className="seg-sep" aria-hidden="true" />
      <ResetView />
    </div>
  );
}

/**
 * Phone: the top-right stack (DESIGN_GUIDE §3.2): the current camera, opening a menu of the three,
 * the lighting and Reset view; undo and redo in a second stack under it.
 */
export function PhoneControls() {
  const { editor } = useStudio();
  const mode = useEditor((s) => s.camera);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = CAMERAS.find((c) => c.mode === mode) ?? CAMERAS[0];
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className="phone-controls" ref={ref}>
      <div className="stack glass">
        <button
          type="button"
          className="icon-btn"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Camera: ${current?.label}`}
          onClick={() => setOpen((o) => !o)}
          data-testid="camera-menu"
        >
          <Icon name={current?.icon ?? "cube"} />
        </button>
        <LightToggle />
        <ResetView />
      </div>
      <History className="stack glass" />
      {open && (
        <div className="menu camera-menu" role="menu" aria-label="Camera">
          {CAMERAS.map((c) => (
            <button
              key={c.mode}
              type="button"
              role="menuitemradio"
              aria-checked={mode === c.mode}
              className="menu-item"
              onClick={() => {
                editor.setCamera(c.mode);
                setOpen(false);
              }}
              data-testid={`camera-${c.mode}`}
            >
              <Icon name={c.icon} />
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Undo and redo (LAY-06): in the desktop toolbar; on phones, a stack under the top-right controls. */
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
    </div>
  );
}

/** One button that flips evening and daylight (LGT-02). */
function LightToggle() {
  const { editor } = useStudio();
  const lighting = useEditor((s) => s.scenarios[s.activeId]?.style.lighting ?? "evening");
  const plan = useEditor((s) => s.camera === "plan");
  return (
    <button
      type="button"
      className="icon-btn"
      disabled={plan}
      onClick={() => editor.setStyle("lighting", lighting === "evening" ? "day" : "evening")}
      aria-label={lighting === "evening" ? "Switch to daylight" : "Switch to evening light"}
      title={plan ? "Plan view always uses daylight" : undefined}
      data-testid="light-toggle"
    >
      <Icon name={lighting === "evening" && !plan ? "moon" : "sun"} />
    </button>
  );
}

/** Desktop: undo, redo and the lighting at the toolbar's right end (LAY-06, LGT-02). */
export function Actions() {
  return (
    <div className="actions glass">
      <History />
      <span className="seg-sep" aria-hidden="true" />
      <LightToggle />
    </div>
  );
}
