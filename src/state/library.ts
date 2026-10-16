import { createStore } from "zustand/vanilla";
import type { CustomRequest, Imported } from "../domain/library/schema";

/**
 * The couple's own additions, shared by both partners: items imported from photos (IMP-06) and
 * custom model requests (REQ-01). The data layer keeps it saved on the device and in the cloud.
 */
export type LibraryState = {
  imports: Imported[];
  requests: CustomRequest[];
};

export const libraryStore = createStore<LibraryState>(() => ({ imports: [], requests: [] }));

/** Merge in imports from elsewhere (the device, the partner): new ones join, removal sticks. */
export function mergeImports(mine: readonly Imported[], theirs: readonly Imported[]): Imported[] {
  const out = new Map(mine.map((i) => [i.id, i]));
  for (const t of theirs) {
    const m = out.get(t.id);
    out.set(t.id, m ? { ...m, archived: m.archived || t.archived } : t);
  }
  return [...out.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Merge in requests from elsewhere: each request keeps its latest change. */
export function mergeRequests(
  mine: readonly CustomRequest[],
  theirs: readonly CustomRequest[],
): CustomRequest[] {
  const out = new Map(mine.map((r) => [r.id, r]));
  for (const t of theirs) {
    const m = out.get(t.id);
    if (!m || t.updatedAt > m.updatedAt) out.set(t.id, t);
  }
  return [...out.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
