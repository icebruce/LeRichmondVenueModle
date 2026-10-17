import { useEffect, useRef } from "react";
import { createStore } from "zustand/vanilla";

/**
 * Things open on top of the room that the phone's back gesture closes, latest first (DESIGN_GUIDE
 * §3.2): menus, dialogs, steps inside a page, compare, walking. The sheet, its pages, the checks and
 * the selection are counted where they live (StudioUI).
 */
type Layer = { id: number; close: () => void };
export const backStore = createStore<{ layers: Layer[] }>(() => ({ layers: [] }));
let next = 0;

/** While `open`, back closes this layer with `close` (which must end `open`); a no-op holds it. */
export function useBackLayer(open: boolean, close: () => void) {
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const id = ++next;
    backStore.setState((s) => ({ layers: [...s.layers, { id, close: () => latest.current() }] }));
    return () => backStore.setState((s) => ({ layers: s.layers.filter((l) => l.id !== id) }));
  }, [open]);
}
