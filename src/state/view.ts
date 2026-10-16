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
  /** Pixels on the right covered by the desktop panel; the camera frames the room beside it. */
  insetRight: number;
  /** Phone: pixels covered by the top bar and by the tab bar plus bottom sheet. */
  insetTop: number;
  insetBottom: number;
  /** Guests drawn in the room (a viewing choice, not saved). */
  showPeople: boolean;
  /** Floor point at the centre of the current view, where new items are added. */
  focus: [number, number];
};

/** Shared by the scene (renders it) and the UI (writes panel inset, reads drag state). */
export const viewStore = createStore<ViewState>(() => ({
  drag: null,
  hover: null,
  controlsEnabled: true,
  view: null,
  insetRight: 0,
  insetTop: 0,
  insetBottom: 0,
  focus: [8, 7],
  showPeople: true,
}));

/** Walk-mode input written by keyboard handlers and the on-screen joystick (x = strafe, y = forward). */
export const walkInput = createStore<{ move: [number, number]; look: [number, number] }>(() => ({
  move: [0, 0],
  look: [0, 0],
}));

/** Requests from the UI: reset the current view (key = null) or jump to a named preset. */
export const cameraCommands = createStore<{ request: { key: string | null; n: number } }>(() => ({
  request: { key: null, n: 0 },
}));

export function requestCamera(key: string | null) {
  cameraCommands.setState((s) => ({ request: { key, n: s.request.n + 1 } }));
}
