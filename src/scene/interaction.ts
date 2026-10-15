import { createStore } from "zustand/vanilla";

/** Live drag preview, kept out of the editor so a drag is one undo step (LAY-06). */
export type Drag = {
  kind: "move" | "rotate";
  ids: string[];
  dx: number;
  dz: number;
  dRot: number;
  valid: boolean;
  reason: string | null;
};

export type InteractionState = {
  drag: Drag | null;
  hover: string | null;
  /** Camera controls pause while an item is being dragged. */
  controlsEnabled: boolean;
};

export const interaction = createStore<InteractionState>(() => ({
  drag: null,
  hover: null,
  controlsEnabled: true,
}));

/** Walk-mode input written by keyboard handlers and the on-screen joystick (x = strafe, y = forward). */
export const walkInput = createStore<{ move: [number, number]; look: [number, number] }>(() => ({
  move: [0, 0],
  look: [0, 0],
}));
