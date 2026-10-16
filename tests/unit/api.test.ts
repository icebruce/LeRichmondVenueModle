import { beforeEach, describe, expect, test } from "vitest";
import { route } from "../../api/_lib/router";
import { resetMemoryStore } from "../../api/_lib/store";
import { venueSampleScenario } from "../../src/domain/scenario/scenario";

const base = "https://studio.test";
let cookie = "";
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  route(
    new Request(base + path, {
      method,
      headers: { "content-type": "application/json", cookie, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  process.env.APP_PASSWORD = "summer-wedding";
  process.env.SESSION_SECRET = "x".repeat(40);
  process.env.RS_MEMORY_STORE = "1";
  resetMemoryStore();
  cookie = "";
});

async function signIn() {
  const res = await call("POST", "/api/login", { password: "summer-wedding" });
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return res;
}

describe("cloud API", () => {
  test("[ACC-01] one shared password; the session lasts 30 days; wrong passwords are rate-limited", async () => {
    expect((await call("GET", "/api/session")).status).toBe(401);
    const res = await signIn();
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
    expect((await call("GET", "/api/session")).status).toBe(200);
    cookie = "rs_session=9999999999.forged";
    expect((await call("GET", "/api/scenarios")).status).toBe(401);
    cookie = "";
    const ip = { "x-forwarded-for": "203.0.113.9" };
    const tries = [];
    for (let i = 0; i < 9; i++)
      tries.push((await call("POST", "/api/login", { password: "guess" }, ip)).status);
    expect(tries.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(tries[8]).toBe(429);
    expect((await call("POST", "/api/login", { password: "summer-wedding" }, ip)).status).toBe(429);
  });

  test("[SCN-02] [SCN-03] scenarios are shared; saving over a newer revision returns the partner's copy", async () => {
    await signIn();
    const s = { ...venueSampleScenario("api-1", "2026-10-16T00:00:00.000Z") };
    const created = await call("POST", "/api/scenarios", { scenario: s });
    expect(created.status).toBe(201);
    const list = (await (await call("GET", "/api/scenarios")).json()) as { scenarios: { id: string }[] };
    expect(list.scenarios.map((x) => x.id)).toContain("api-1");
    const a = await call(
      "PUT",
      "/api/scenarios/api-1",
      { scenario: { ...s, name: "Mine" } },
      { "if-match": "1" },
    );
    expect(((await a.json()) as { scenario: { revision: number } }).scenario.revision).toBe(2);
    const b = await call(
      "PUT",
      "/api/scenarios/api-1",
      { scenario: { ...s, name: "Theirs" } },
      { "if-match": "1" },
    );
    expect(b.status).toBe(409);
    expect(((await b.json()) as { scenario: { name: string } }).scenario.name).toBe("Mine");
    expect(
      (await call("PUT", "/api/scenarios/api-1", { scenario: { bad: true } }, { "if-match": "2" })).status,
    ).toBe(400);
  });

  test("[SCN-04] each save keeps the previous version, which can be restored", async () => {
    await signIn();
    const s = venueSampleScenario("api-2", "2026-10-16T00:00:00.000Z");
    await call("POST", "/api/scenarios", { scenario: s });
    await call("PUT", "/api/scenarios/api-2", { scenario: { ...s, name: "Second" } }, { "if-match": "1" });
    await call("PUT", "/api/scenarios/api-2", { scenario: { ...s, name: "Third" } }, { "if-match": "2" });
    const v = (await (await call("GET", "/api/scenarios/api-2/versions")).json()) as {
      versions: { revision: number; name: string }[];
    };
    expect(v.versions.map((x) => [x.revision, x.name])).toEqual([
      [2, "Second"],
      [1, "Option A · Venue sample"],
    ]);
    const r = await call("POST", "/api/scenarios/api-2/versions", { revision: 1 });
    expect(((await r.json()) as { scenario: { name: string; revision: number } }).scenario).toMatchObject({
      name: "Option A · Venue sample",
      revision: 4,
    });
  });

  test("[ACC-01] without a password, secret and storage configured, the API says so (the app stays local)", async () => {
    delete process.env.APP_PASSWORD;
    const res = await call("GET", "/api/session");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ configured: false });
  });
});
