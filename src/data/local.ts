import { get, set } from "idb-keyval";
import { parseScenario } from "../domain/scenario/scenario";
import type { Scenario } from "../domain/scenario/schema";
import type { Editor } from "../state/editor";

const KEY = "richmond-studio/scenarios/v1";

type Saved = { scenarios: unknown[]; activeId?: string };

/** Scenarios saved on this device; unreadable entries are skipped rather than blocking the app. */
export async function loadLocal(): Promise<{ scenarios: Scenario[]; activeId?: string }> {
  try {
    const saved = (await get(KEY)) as Saved | undefined;
    if (!saved) return { scenarios: [] };
    const scenarios: Scenario[] = [];
    for (const raw of saved.scenarios) {
      try {
        scenarios.push(parseScenario(raw));
      } catch (e) {
        console.warn("Skipping unreadable saved scenario", e);
      }
    }
    return { scenarios, ...(saved.activeId ? { activeId: saved.activeId } : {}) };
  } catch (e) {
    console.warn("Local storage unavailable", e);
    return { scenarios: [] };
  }
}

/** Save every change to IndexedDB shortly after it happens (SCN-09). Returns an unsubscribe. */
export function persistLocal(editor: Editor, delayMs = 400): () => void {
  let timer: number | undefined;
  const write = async () => {
    const st = editor.store.getState();
    try {
      await set(KEY, {
        scenarios: st.order.map((id) => st.scenarios[id]),
        activeId: st.activeId,
      } satisfies Saved);
      editor.setSaveState("saved");
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
    editor.setSaveState("saving");
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
