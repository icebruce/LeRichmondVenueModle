import { createContext, useContext, useMemo } from "react";
import { type Advisory, adviseScenario } from "../domain/layout/advisories";
import type { Scenario } from "../domain/scenario/schema";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { Catalog } from "../domain/library/catalog";
import type { VenueModel } from "../domain/venue/model";
import type { Editor, EditorState } from "../state/editor";
import { type ViewState, viewStore } from "../state/view";

/** `readOnly`: the side-by-side compare view, which shows a scenario but does not edit it. */
export type Studio = {
  venue: VenueModel;
  catalog: Catalog;
  editor: Editor;
  readOnly?: boolean;
  /** A stored photo (an import, a print) as a URL to draw, or null if it cannot be had now. */
  imageUrl?: (id: string) => Promise<string | null>;
};

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
  const { items, guests, thresholds, venueToggles } = useEditor((s) => s.scenarios[s.activeId] as Scenario);
  // Only what the checks read: a rename or a décor change does not re-run them.
  return useMemo(
    () => adviseScenario({ items, guests, thresholds, venueToggles }, venue, catalog),
    [items, guests, thresholds, venueToggles, venue, catalog],
  );
}
