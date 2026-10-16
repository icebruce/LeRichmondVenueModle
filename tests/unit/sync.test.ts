import { beforeEach, describe, expect, test } from "vitest";
import { catalog, venue } from "./fixtures";
import { route } from "../../api/_lib/router";
import { resetMemoryStore } from "../../api/_lib/store";
import { CloudApi, CloudSync } from "../../src/data/cloud";
import { createEditor } from "../../src/state/editor";
import { venueSampleScenario } from "../../src/domain/scenario/scenario";

/** A device: its own editor and cookie jar, talking to the real API handlers. */
function device(
  name: "A" | "B",
  online: { up: boolean; dropNextCreateReply?: boolean } = { up: true },
  // Each device's own (renamed, so not an untouched venue sample) starting scenario.
  initial = [{ ...venueSampleScenario(`${name}-start`, "2026-10-16T00:00:00.000Z"), name: `${name} start` }],
) {
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
    // The server saved it, but the reply never reaches the phone.
    if (online.dropNextCreateReply && init.method === "POST" && path === "/api/scenarios") {
      online.dropNextCreateReply = false;
      throw new TypeError("Failed to fetch");
    }
    return res;
  }) as typeof fetch;
  const api = new CloudApi(fetchFn);
  const editor = createEditor(
    { venue, catalog, now: () => new Date().toISOString(), newId: () => `${name}${++n}` },
    initial,
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

  test("[SCN-02] a create whose reply was lost is reconciled, not retried forever", async () => {
    const { a, b } = await pair();
    a.online.dropNextCreateReply = true;
    a.editor.createScenario("blank");
    const id = a.editor.store.getState().activeId;
    await a.sync.pull();
    expect(a.editor.store.getState().saveState).toBe("offline");
    a.editor.setGuests(42);
    await a.sync.pull();
    await b.sync.pull();
    expect(b.editor.store.getState().scenarios[id]?.guests.count).toBe(42);
    expect(a.editor.store.getState().conflict).toBeNull();
    a.sync.stop();
    b.sync.stop();
  });

  test("[SCN-02] a new device's untouched venue sample is not added to a shared list", async () => {
    const { a, b } = await pair();
    const c = device("A", { up: true }, []);
    expect(await c.api.login("pw")).toBeNull();
    const seed = c.editor.store.getState().activeId;
    await c.sync.start();
    const ids = Object.keys(c.editor.store.getState().scenarios).sort();
    expect(ids).toEqual(["A-start", "B-start"]);
    expect(ids).not.toContain(seed);
    expect((await c.api.list()).scenarios.map((s) => s.id).sort()).toEqual(["A-start", "B-start"]);
    for (const d of [a, b, c]) d.sync.stop();
  });

  test("[SCN-03] deleting a scenario the partner changed since keeps their version and says so", async () => {
    const { a, b } = await pair();
    await b.sync.pull();
    b.editor.switchScenario("A-start");
    b.editor.setGuests(66);
    await b.sync.pull();
    a.editor.switchScenario("A-start");
    a.editor.deleteScenario("A-start");
    await a.sync.pull();
    const st = a.editor.store.getState();
    expect(st.scenarios["A-start"]?.guests.count).toBe(66);
    expect(st.toast?.text).toMatch(/changed on the other device/);
    a.sync.stop();
    b.sync.stop();
  });

  test("[SCN-03] “keep mine” keeps the partner's notes too", async () => {
    const { a, b } = await pair();
    await b.sync.pull();
    a.editor.switchScenario("A-start");
    a.editor.addNote("Florals lower, please", "A");
    a.editor.setGuests(90);
    await a.sync.pull();
    b.editor.switchScenario("A-start");
    b.editor.setGuests(60);
    await b.sync.pull();
    await b.sync.resolve("mine", () => "unused");
    await a.sync.pull();
    const s = a.editor.store.getState().scenarios["A-start"];
    expect(s?.guests.count).toBe(60);
    expect(s?.notes.map((x) => x.text)).toEqual(["Florals lower, please"]);
    a.sync.stop();
    b.sync.stop();
  });

  test("[SCN-02] a lost create reply followed by an edit and a plain save is not a conflict", async () => {
    const { a, b } = await pair();
    a.online.dropNextCreateReply = true;
    a.editor.createScenario("blank");
    const id = a.editor.store.getState().activeId;
    await a.sync.pull();
    a.editor.setGuests(42);
    // The retry is a save pass (as after the retry timer or the next edit), not a pull.
    await (a.sync as unknown as { run: () => Promise<void> }).run();
    expect(a.editor.store.getState().conflict).toBeNull();
    await a.sync.pull();
    await b.sync.pull();
    expect(b.editor.store.getState().scenarios[id]?.guests.count).toBe(42);
    a.sync.stop();
    b.sync.stop();
  });

  test("[SCN-03] two conflicts are asked one after the other, none dropped", async () => {
    const { a, b } = await pair();
    await b.sync.pull();
    for (const id of ["A-start", "B-start"]) {
      a.editor.switchScenario(id);
      a.editor.setGuests(90);
    }
    await a.sync.pull();
    for (const id of ["A-start", "B-start"]) {
      b.editor.switchScenario(id);
      b.editor.setGuests(60);
    }
    await b.sync.pull();
    const first = b.editor.store.getState().conflict?.id;
    expect(first).toBeDefined();
    await b.sync.resolve("theirs", () => "unused");
    const second = b.editor.store.getState().conflict?.id;
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    await b.sync.resolve("theirs", () => "unused");
    expect(b.editor.store.getState().conflict).toBeNull();
    a.sync.stop();
    b.sync.stop();
  });

  test("[SCN-02] starting twice (React StrictMode) neither subscribes nor pulls twice", async () => {
    const a = device("A");
    expect(await a.api.login("pw")).toBeNull();
    let lists = 0;
    const list = a.api.list.bind(a.api);
    a.api.list = () => {
      lists += 1;
      return list();
    };
    await Promise.all([a.sync.start(), a.sync.start()]);
    expect(lists).toBe(1);
    a.sync.stop();
  });

  test("[SCN-02] a shared scenario this version cannot read is left alone, not taken as deleted", async () => {
    const { a, b } = await pair();
    await b.sync.pull();
    const list = b.api.list.bind(b.api);
    b.api.list = async () => {
      const r = await list();
      return { scenarios: r.scenarios.filter((s) => s.id !== "A-start"), unreadable: ["A-start"] };
    };
    await b.sync.pull();
    expect(b.editor.store.getState().scenarios["A-start"]).toBeDefined();
    a.sync.stop();
    b.sync.stop();
  });

  test("[SCN-09] offline when the app starts: it still syncs once the connection is back", async () => {
    const online = { up: false };
    const a = device("A", online);
    expect(await a.api.session()).toBe("on");
    online.up = true;
    expect(await a.api.login("pw")).toBeNull();
    online.up = false;
    await a.sync.start();
    expect(a.editor.store.getState().saveState).toBe("offline");
    online.up = true;
    await a.sync.pull();
    expect((await a.api.list()).scenarios.map((s) => s.id)).toContain("A-start");
    a.sync.stop();
  });
});
