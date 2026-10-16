import { beforeEach, describe, expect, test } from "vitest";
import { catalog, venue } from "./fixtures";
import { route } from "../../api/_lib/router";
import { resetMemoryStore } from "../../api/_lib/store";
import { CloudApi, CloudSync } from "../../src/data/cloud";
import { createEditor } from "../../src/state/editor";
import { venueSampleScenario } from "../../src/domain/scenario/scenario";

/** A device: its own editor and cookie jar, talking to the real API handlers. */
function device(name: "A" | "B", online = { up: true }) {
  let cookie = "";
  let n = 0;
  const fetchFn = (async (path: string, init: RequestInit = {}) => {
    if (!online.up) throw new TypeError("Failed to fetch");
    const res = await route(
      new Request(`https://studio.test${path}`, {
        ...init,
        headers: { ...init.headers, cookie } as HeadersInit,
      }),
    );
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0] ?? "";
    return res;
  }) as typeof fetch;
  const api = new CloudApi(fetchFn);
  const editor = createEditor(
    { venue, catalog, now: () => new Date().toISOString(), newId: () => `${name}${++n}` },
    [venueSampleScenario(`${name}-start`, "2026-10-16T00:00:00.000Z")],
  );
  const sync = new CloudSync(editor, api, () => name, false);
  return { api, editor, sync, online };
}

beforeEach(() => {
  process.env.APP_PASSWORD = "pw";
  process.env.SESSION_SECRET = "s".repeat(40);
  process.env.RS_MEMORY_STORE = "1";
  resetMemoryStore();
});

async function pair() {
  const a = device("A");
  const b = device("B");
  for (const d of [a, b]) expect(await d.api.login("pw")).toBeNull();
  await a.sync.start();
  await b.sync.start();
  await a.sync.pull();
  return { a, b };
}

describe("cloud sync", () => {
  test("[SCN-02] changes on one device appear on the other", async () => {
    const { a, b } = await pair();
    a.editor.switchScenario("A-start");
    a.editor.renameScenario("Long tables");
    await a.sync.pull();
    await b.sync.pull();
    expect(b.editor.store.getState().scenarios["A-start"]?.name).toBe("Long tables");
    expect(b.editor.store.getState().scenarios["B-start"]).toBeDefined();
    expect(a.editor.store.getState().scenarios["B-start"]).toBeDefined();
    a.sync.stop();
    b.sync.stop();
  });

  test("[SCN-03] both edit the same scenario: nothing is overwritten; the second asks keep, take or copy", async () => {
    const { a, b } = await pair();
    await b.sync.pull();
    a.editor.switchScenario("A-start");
    a.editor.setGuests(90);
    await a.sync.pull();
    b.editor.switchScenario("A-start");
    b.editor.setGuests(60);
    await b.sync.pull();
    const conflict = b.editor.store.getState().conflict;
    expect(conflict?.id).toBe("A-start");
    expect(conflict?.theirs.guests.count).toBe(90);
    await b.sync.resolve("copy", () => "B-copy");
    const st = b.editor.store.getState();
    expect(st.scenarios["A-start"]?.guests.count).toBe(90);
    expect(st.scenarios["B-copy"]?.guests.count).toBe(60);
    expect(st.scenarios["B-copy"]?.name).toMatch(/\(mine\)$/);
    a.sync.stop();
    b.sync.stop();
  });

  test("[SCN-05] a partner's note merges silently into a scenario edited here", async () => {
    const { a, b } = await pair();
    await b.sync.pull();
    a.editor.switchScenario("A-start");
    a.editor.addNote("Can the sweetheart table face the windows?", "A");
    await a.sync.pull();
    b.editor.switchScenario("A-start");
    b.editor.setGuests(80);
    await b.sync.pull();
    const st = b.editor.store.getState();
    expect(st.conflict).toBeNull();
    expect(st.scenarios["A-start"]?.notes.map((x) => [x.author, x.text])).toEqual([
      ["A", "Can the sweetheart table face the windows?"],
    ]);
    expect(st.scenarios["A-start"]?.guests.count).toBe(80);
    a.sync.stop();
    b.sync.stop();
  });

  test("[SCN-09] offline: edits stay on the device and are saved when the connection returns", async () => {
    const { a, b } = await pair();
    a.online.up = false;
    a.editor.switchScenario("A-start");
    a.editor.setGuests(101);
    await a.sync.pull();
    expect(a.editor.store.getState().saveState).toBe("offline");
    a.online.up = true;
    await a.sync.pull();
    await b.sync.pull();
    expect(b.editor.store.getState().scenarios["A-start"]?.guests.count).toBe(101);
    a.sync.stop();
    b.sync.stop();
  });
});
