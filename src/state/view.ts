import { createStore } from "zustand/vanilla";
import type { AlignGuide } from "../domain/layout/align";

/** Live drag preview, kept out of the editor so a drag is one undo step (LAY-06). */
export type Drag = {
  kind: "move" | "rotate";
  ids: string[];
  dx: number;
  dz: number;
  dRot: number;
  valid: boolean;
  reason: string | null;
  /** Centre lines the drag snapped onto (LAY-05), drawn as guides. */
  guides: AlignGuide[];
};

export type ViewState = {
  drag: Drag | null;
  hover: string | null;
  /** Camera controls pause while an item is being dragged. */
  controlsEnabled: boolean;
  /** Eye-level reference view being shown (VEN-01): full walls and ceiling, no cutaway. */
  view: string | null;
  /** Pixels on the left covered by the desktop rail and panel; the camera frames the room beside them. */
  insetLeft: number;
  /** Desktop: pixels covered by the toolbar row; the overview frames the room below it. */
  insetTop: number;
  /** Phone: pixels covered by the tab bar plus bottom sheet. */
  insetBottom: number;
  /** Phone: the width of the control column on the right; the overview keeps the room clear of it. */
  insetRight: number;
  /** Phone: the control column's bottom edge; below it the overview may use the full width. */
  insetColumn: number;
  /** Guests drawn in the room (a viewing choice, not saved). */
  showPeople: boolean;
  /** The checks' outlines drawn in the room at rest (LAY-08); remembered on this device, not saved. */
  showChecks: boolean;
  /** Scenario shown side by side with the active one, from the same camera (SCN-06). */
  compare: string | null;
  /** Desktop: screen point (px) just above the selection, where its toolbar sits; null when hidden. */
  anchor: [number, number] | null;
  /** Desktop: a light's height while its grip is dragged (LIB-08); drawn there, saved on release. */
  lift: { id: string; hang: number } | null;
  /** Desktop: a library piece being dragged from Add, and the floor point under the pointer (LAY-01). */
  dropping: { id: string; at: [number, number] | null } | null;
  /** Floor point at the centre of the current view, where new items are added. */
  focus: [number, number];
  /** Library item to start a custom model request from (REQ-01), opened in Inspiration. */
  requestFor: string | null;
  /** Sit here (CAM-04): the table whose chairs are offered as seats, then the chosen seat. */
  pickSeat: string | null;
  seat: {
    x: number;
    y: number;
    z: number;
    look: [number, number];
    table: string;
    /** The camera to return to on "Stand up". */
    from: "dollhouse" | "plan" | "walk";
  } | null;
  /** Photo mode (EXP-02, V5): open while set. */
  photo: Photo | null;
};

/** Photo mode's settings: the background blur, the point kept sharp (null: the centre of the view). */
export type Photo = {
  blur: "off" | "soft" | "strong";
  /** Screen point (px, from the canvas's top left) kept sharp; null: the centre of the view. */
  focus: [number, number] | null;
  /** The selection while Photo mode is open; brought back on Close. */
  selection: string[];
  /** Making the image. */
  busy: boolean;
};

const CHECKS_KEY = "rs-show-checks";

function storedShowChecks(): boolean {
  try {
    return localStorage.getItem(CHECKS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Shared by the scene (renders it) and the UI (writes panel inset, reads drag state). */
export const viewStore = createStore<ViewState>(() => ({
  drag: null,
  hover: null,
  controlsEnabled: true,
  view: null,
  insetLeft: 0,
  insetTop: 0,
  insetBottom: 0,
  insetRight: 0,
  insetColumn: 0,
  anchor: null,
  dropping: null,
  lift: null,
  focus: [8, 7],
  showPeople: true,
  showChecks: storedShowChecks(),
  compare: null,
  pickSeat: null,
  seat: null,
  requestFor: null,
  photo: null,
}));

viewStore.subscribe((s, prev) => {
  if (s.showChecks === prev.showChecks) return;
  try {
    localStorage.setItem(CHECKS_KEY, s.showChecks ? "1" : "0");
  } catch {
    // Private browsing: the choice lasts for this visit only.
  }
});

/** Walk-mode input written by keyboard handlers and the on-screen joystick (x = strafe, y = forward). */
export const walkInput = createStore<{ move: [number, number]; look: [number, number] }>(() => ({
  move: [0, 0],
  look: [0, 0],
}));

/** Requests from the UI: reset the current view (key = null) or jump to a named preset. */
export const cameraCommands = createStore<{ request: { key: string | null; n: number } }>(() => ({
  request: { key: null, n: 0 },
}));

/** The main view's camera, copied every frame by the side-by-side view (SCN-06). Not a store: per frame. */
export const sharedPose = {
  position: [0, 0, 0] as [number, number, number],
  quaternion: [0, 0, 0, 1] as [number, number, number, number],
  fov: 20,
};

export function requestCamera(key: string | null) {
  cameraCommands.setState((s) => ({ request: { key, n: s.request.n + 1 } }));
}

/** The drag-and-drop type of a library piece dragged from Add into the room (LAY-01, desktop). */
export const LIBRARY_DRAG = "application/x-richmond-library";

/**
 * Makes the saved image (Photo mode): set by the scene, which owns the renderer. Renders the view
 * at `pixelRatio` and returns it as a PNG, with a footnote naming approximate items in view.
 */
export const photoRenderer: { render: ((pixelRatio: number) => Promise<Blob>) | null } = { render: null };
