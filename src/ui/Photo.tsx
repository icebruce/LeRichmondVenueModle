import { useEffect, useState } from "react";
import type { Editor } from "../state/editor";
import { type Photo, photoRenderer, viewStore } from "../state/view";
import { useEditor, useStudio, useView } from "../scene/context";
import { useBackLayer } from "./back";
import { Icon } from "./icons";
import { type Services, useServices } from "./services";
import { LightToggle } from "./TopBar";

/** Photo mode (EXP-02, owner-approved mock-up `docs/mockups/photo.html`). */

const BLURS: { value: Photo["blur"]; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "soft", label: "Soft" },
  { value: "strong", label: "Strong" },
];

/** Photo mode works in Dollhouse and Walk, not in Plan or while comparing. */
export function usePhotoAllowed(): boolean {
  const plan = useEditor((s) => s.camera === "plan");
  const compare = useView((s) => s.compare);
  return !plan && !compare;
}

export const PHOTO_UNAVAILABLE = "Works in Dollhouse and Walk";

/** Opens Photo mode: the selection is paused (kept to bring back on Close). */
export function openPhoto(editor: Editor) {
  const st = editor.store.getState();
  const v = viewStore.getState();
  if (st.camera === "plan" || v.compare || v.photo) return;
  viewStore.setState({
    photo: { blur: "soft", focus: null, selection: st.selection, busy: false },
    pickSeat: null,
  });
  editor.select([]);
}

/** Closes Photo mode and brings the selection back (whatever of it still exists). */
export function closePhoto(editor: Editor) {
  const photo = viewStore.getState().photo;
  if (!photo) return;
  viewStore.setState({ photo: null });
  const ids = new Set(editor.active().items.map((i) => i.id));
  editor.select(photo.selection.filter((id) => ids.has(id)));
}

const setPhoto = (patch: Partial<Photo>) =>
  viewStore.setState((s) => (s.photo ? { photo: { ...s.photo, ...patch } } : {}));

/** Keeps the room sharp at this screen point (px from the canvas's top left). */
const setFocus = (at: [number, number]) => setPhoto({ focus: at });

/**
 * Makes the image: twice the window on a desktop, the screen's own pixels on a phone (up to 2048 px
 * on the long side); once more at screen size if that fails. A phone that can share offers it.
 */
async function savePhoto(editor: Editor, services: Services, phone: boolean) {
  const render = photoRenderer.render;
  if (!render) return;
  setPhoto({ busy: true });
  const long = Math.max(window.innerWidth, window.innerHeight);
  const ratio = phone ? Math.min(window.devicePixelRatio || 1, 2048 / long) : 2;
  const blob = await render(ratio).catch(() => render(1).catch(() => null));
  // Closed while it was being made: the image is dropped.
  if (!viewStore.getState().photo) return;
  setPhoto({ busy: false });
  if (!blob) {
    editor.notify("Couldn't make the image. Try again, or set blur to Off.");
    return;
  }
  const file = services.viewFile(blob);
  // The share sheet needs a fresh tap, so it is offered rather than opened.
  if (phone && navigator.canShare?.({ files: [file] }))
    editor.notify("Image ready", undefined, {
      label: "Share",
      run: () => void services.saveFile(file, true),
    });
  else {
    await services.saveFile(file);
    editor.notify(`Image saved · ${file.name}`);
  }
}

/** Desktop toolbar: the camera button after the light (shortcut P). */
export function PhotoButton() {
  const { editor } = useStudio();
  const allowed = usePhotoAllowed();
  return (
    <button
      type="button"
      className="icon-btn"
      disabled={!allowed}
      onClick={() => openPhoto(editor)}
      aria-label={allowed ? "Photo mode" : `Photo mode · ${PHOTO_UNAVAILABLE}`}
      title={allowed ? "Photo mode (P)" : PHOTO_UNAVAILABLE}
      data-testid="photo-mode"
    >
      <Icon name="camera" />
    </button>
  );
}

/** The canvas the room is drawn on (the main view's). */
const canvas = () => document.querySelector<HTMLCanvasElement>("[data-testid=studio-canvas] canvas");

/**
 * Photo mode's layer over the room: a hint, Close, the focus ring and one bar (Background blur, the
 * light, Save image). Everything else is hidden by `StudioUI`; edit shortcuts are off.
 */
export function PhotoLayer({ phone }: { phone: boolean }) {
  const { editor } = useStudio();
  const services = useServices();
  const photo = useView((s) => s.photo);
  const [touched, setTouched] = useState(false);
  // The focus ring shows for a second after the focus is set.
  const focus = photo?.focus ?? null;
  const [faded, setFaded] = useState<Photo["focus"]>(null);
  useEffect(() => {
    if (!focus) return;
    const t = window.setTimeout(() => setFaded(focus), 1000);
    return () => window.clearTimeout(t);
  }, [focus]);
  const ring = focus && faded !== focus ? focus : null;
  useBackLayer(phone, () => closePhoto(editor));

  // A tap or click on the room (not a drag) sets the focus there; any first touch fades the hint.
  useEffect(() => {
    const el = canvas();
    if (!el) return;
    let start: [number, number] | null = null;
    const down = (e: PointerEvent) => {
      start = [e.clientX, e.clientY];
      setTouched(true);
    };
    const up = (e: PointerEvent) => {
      if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6) return;
      const r = el.getBoundingClientRect();
      setFocus([e.clientX - r.left, e.clientY - r.top]);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
    };
  }, []);

  // Keys: Escape closes; with nothing else focused, Enter focuses the centre and the arrows move the
  // focus. Every other shortcut is off while the layer is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      e.stopPropagation();
      if (e.key === "Escape") return closePhoto(editor);
      const free = !t || t === document.body || t.tagName === "CANVAS";
      const el = canvas();
      if (!free || !el) return;
      const { width, height } = el.getBoundingClientRect();
      const at = viewStore.getState().photo?.focus ?? [width / 2, height / 2];
      const step: Record<string, [number, number]> = {
        ArrowLeft: [-40, 0],
        ArrowRight: [40, 0],
        ArrowUp: [0, -40],
        ArrowDown: [0, 40],
      };
      if (e.key === "Enter") setFocus([width / 2, height / 2]);
      else if (step[e.key]) {
        e.preventDefault();
        const [dx, dy] = step[e.key] as [number, number];
        setFocus([Math.min(width, Math.max(0, at[0] + dx)), Math.min(height, Math.max(0, at[1] + dy))]);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editor]);

  if (!photo) return null;
  const blur = (
    <div className="seg photo-blur" role="radiogroup" aria-label="Background blur">
      {BLURS.map((b) => (
        <button
          key={b.value}
          type="button"
          role="radio"
          aria-checked={photo.blur === b.value}
          className={photo.blur === b.value ? "on" : ""}
          onClick={() => setPhoto({ blur: b.value })}
          data-testid={`photo-blur-${b.value}`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
  const save = (
    <button
      type="button"
      className="btn primary"
      disabled={photo.busy}
      onClick={() => void savePhoto(editor, services, phone)}
      data-testid="photo-save"
    >
      {photo.busy ? "Making image…" : "Save image"}
    </button>
  );
  return (
    <div className="photo-layer" data-testid="photo-layer">
      {!touched && !focus && (
        <p className="photo-hint glass">
          <span className="desktop-only">Drag to frame · click to focus</span>
          <span className="touch-only">Drag to frame · tap to focus</span>
        </p>
      )}
      <div className="photo-close glass">
        <button
          type="button"
          className="icon-btn"
          onClick={() => closePhoto(editor)}
          aria-label="Close Photo mode"
          title="Close (Esc)"
          data-testid="photo-close"
        >
          <Icon name="close" />
        </button>
      </div>
      {ring && <div className="focus-ring" style={{ left: ring[0], top: ring[1] }} aria-hidden="true" />}
      <div className="photo-bar glass" role="toolbar" aria-label="Photo">
        {phone ? (
          <>
            <div className="photo-line">
              <span className="photo-label">Background blur</span>
              <LightToggle />
            </div>
            {blur}
            {save}
          </>
        ) : (
          <>
            <span className="photo-label">Background blur</span>
            {blur}
            <LightToggle />
            {save}
          </>
        )}
      </div>
      <p className="sr-only" role="status">
        {focus ? "Focus set" : ""}
      </p>
    </div>
  );
}
