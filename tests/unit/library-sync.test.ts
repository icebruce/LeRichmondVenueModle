import { beforeEach, describe, expect, test, vi } from "vitest";
import { route } from "../../api/_lib/router";
import { resetMemoryStore } from "../../api/_lib/store";
import { LibrarySync } from "../../src/data/library";
import type { CustomRequest } from "../../src/domain/library/schema";
import { libraryStore } from "../../src/state/library";

// The device's own storage (IndexedDB in the browser).
const device = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => device.get(k),
  set: async (k: string, v: unknown) => void device.set(k, v),
}));

let cookie = "";
const puts: string[] = [];
const fetchFn = (async (path: string, init: RequestInit = {}) => {
  if (init.method === "PUT") puts.push(path);
  return route(
    new Request(`https://studio.test${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), cookie },
    }),
  );
}) as typeof fetch;

beforeEach(async () => {
  process.env.APP_PASSWORD = "summer-wedding";
  process.env.SESSION_SECRET = "x".repeat(40);
  process.env.RS_MEMORY_STORE = "1";
  resetMemoryStore();
  device.clear();
  puts.length = 0;
  libraryStore.setState({ imports: [], requests: [] });
  const res = await route(
    new Request("https://studio.test/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "summer-wedding" }),
    }),
  );
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
});

const request = (imageIds: string[], updatedAt = "2026-10-16T10:00:00.000Z"): CustomRequest => ({
  id: "req-abc123",
  itemId: "candelabra-5",
  name: "Gold candelabra",
  sizeCm: { w: 30, h: 60 },
  placement: "table",
  notes: "",
  imageIds,
  status: "requested",
  createdAt: "2026-10-16T10:00:00.000Z",
  updatedAt,
  createdBy: "A",
});

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1])], { type: "image/jpeg" });
const stored = async (id: string) => (await fetchFn(`/api/uploads/${id}`, { method: "GET" })).status;

describe("custom request photos", () => {
  test("[REQ-01] a request's photos reach the cloud only when it is sent, once each", async () => {
    const sync = new LibrarySync("test", fetchFn);
    await sync.share();
    // A photo added to a form that is then left unsent stays on this device only.
    await sync.addImage("img-left01", jpeg());
    await sync.refresh();
    expect(await stored("img-left01")).toBe(404);

    await sync.addImage("img-sent01", jpeg());
    await sync.saveRequest(request(["img-sent01"]));
    expect(await stored("img-sent01")).toBe(200);
    expect(await stored("img-left01")).toBe(404);

    // Saving again sends only the photo added since.
    await sync.addImage("img-sent02", jpeg());
    await sync.saveRequest(request(["img-sent01", "img-sent02"], "2026-10-16T11:00:00.000Z"));
    expect(puts).toEqual(["/api/uploads/img-sent01", "/api/uploads/img-sent02"]);
  });
});
