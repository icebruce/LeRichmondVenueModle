import { get, set } from "idb-keyval";
import { parseScenario } from "../domain/scenario/scenario";
import type { Scenario } from "../domain/scenario/schema";
import type { Editor } from "../state/editor";

export const LOCAL_KEY = "richmond-studio/scenarios/v1";
/** `?fresh` (tests, demos) starts empty and saves here, so it never touches the real scenarios. */
export const FRESH_KEY = "richmond-studio/scenarios/fresh";

/**
 * `unreadable` holds saved entries this version cannot parse (e.g. written by a newer one). They
 * are written back untouched on every save, so opening an older build never deletes them (SCN-09).
 */
type Saved = { scenarios: unknown[]; activeId?: string; unreadable?: unknown[] };

/** `readable: false` means storage could not be read at all; then nothing may be written over it. */
export type Local = { scenarios: Scenario[]; activeId?: string; unreadable: unknown[]; readable: boolean };

/** Scenarios saved on this device; unreadable entries are kept aside rather than blocking the app. */
export async function loadLocal(key = LOCAL_KEY): Promise<Local> {
  try {
    const saved = (await get(key)) as Saved | undefined;
    if (!saved) return { scenarios: [], unreadable: [], readable: true };
    const scenarios: Scenario[] = [];
    const unreadable: unknown[] = [...(saved.unreadable ?? [])];
    for (const raw of saved.scenarios) {
      try {
        scenarios.push(parseScenario(raw));
      } catch (e) {
        console.warn("Keeping an unreadable saved scenario aside", e);
        unreadable.push(raw);
      }
    }
    return { scenarios, unreadable, readable: true, ...(saved.activeId ? { activeId: saved.activeId } : {}) };
  } catch (e) {
    console.warn("Local storage unavailable", e);
    return { scenarios: [], unreadable: [], readable: false };
  }
}

/** Save every change to IndexedDB shortly after it happens (SCN-09). Returns an unsubscribe. */
export function persistLocal(
  editor: Editor,
  {
    key = LOCAL_KEY,
    unreadable = [],
    delayMs = 400,
  }: { key?: string; unreadable?: unknown[]; delayMs?: number } = {},
): () => void {
  let timer: number | undefined;
  const write = async () => {
    const st = editor.store.getState();
    try {
      await set(key, {
        scenarios: st.order.map((id) => st.scenarios[id]),
        activeId: st.activeId,
        ...(unreadable.length ? { unreadable } : {}),
      } satisfies Saved);
      // With cloud saving on, the top bar reports the shared save instead (data/cloud.ts).
      if (!editor.store.getState().cloud) editor.setSaveState("saved");
    } catch (e) {
      console.error(e);
      editor.setSaveState("error");
    }
  };
  const flush = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
      void write();
    }
  };
  const unsub = editor.store.subscribe((s, prev) => {
    if (s.version === prev.version && s.activeId === prev.activeId) return;
    if (!s.cloud) editor.setSaveState("saving");
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      void write();
    }, delayMs);
  });
  window.addEventListener("pagehide", flush);
  return () => {
    unsub();
    window.removeEventListener("pagehide", flush);
  };
}
