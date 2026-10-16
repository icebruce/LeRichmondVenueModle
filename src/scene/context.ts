import { createContext, useContext, useMemo } from "react";
import { type Advisory, advise } from "../domain/layout/advisories";
import type { Scenario } from "../domain/scenario/schema";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { Catalog } from "../domain/library/catalog";
import type { VenueModel } from "../domain/venue/model";
import type { Editor, EditorState } from "../state/editor";
import { type ViewState, viewStore } from "../state/view";

/** `readOnly`: the side-by-side compare view, which shows a scenario but does not edit it. */
export type Studio = { venue: VenueModel; catalog: Catalog; editor: Editor; readOnly?: boolean };

export const StudioContext = createContext<Studio | null>(null);

export function useStudio(): Studio {
  const s = useContext(StudioContext);
  if (!s) throw new Error("StudioContext missing");
  return s;
}

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useStore(useStudio().editor.store as StoreApi<EditorState>, selector);
}

export function useView<T>(selector: (s: ViewState) => T): T {
  return useStore(viewStore, selector);
}

/** Advisory checks for the active scenario (LAY-08), recomputed when the layout or settings change. */
export function useAdvisories(): Advisory[] {
  const { venue, catalog } = useStudio();
  const scenario = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  return useMemo(
    () => advise(scenario.items, scenario.guests.count, scenario.thresholds, venue, catalog),
    [scenario.items, scenario.guests.count, scenario.thresholds, venue, catalog],
  );
}
