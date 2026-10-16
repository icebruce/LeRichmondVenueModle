import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { Catalog } from "../domain/library/catalog";
import type { VenueModel } from "../domain/venue/model";
import type { Editor, EditorState } from "../state/editor";
import { type ViewState, viewStore } from "../state/view";

export type Studio = { venue: VenueModel; catalog: Catalog; editor: Editor };

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
