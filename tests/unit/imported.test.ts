import { beforeEach, describe, expect, test } from "vitest";
import { catalog } from "./fixtures";
import { route } from "../../api/_lib/router";
import { resetMemoryStore } from "../../api/_lib/store";
import {
  RESULT_LABELS,
  dominantColours,
  importParams,
  importedEntry,
  suggest,
  withImported,
} from "../../src/domain/library/imported";
import { entry } from "../../src/domain/library/catalog";
import { type CustomRequest, type Imported, importedSchema } from "../../src/domain/library/schema";
import { makePiece } from "../../src/domain/layout/pieces";
import { type Item, shapeOf } from "../../src/domain/layout/items";
import { tableDecor, heightOf } from "../../src/domain/layout/decor";
import { DEFAULT_STYLE, styleOf } from "../../src/domain/scenario/scenario";
import { mergeImports, mergeRequests } from "../../src/state/library";

const THUMB = "data:image/jpeg;base64,AAAA";
const imported = (over: Partial<Imported>): Imported => ({
  id: "imp-abc123",
  name: "Gold candelabra",
  type: "candle",
  result: "approximate",
  baseId: "candelabra-5",
  params: {},
  sizeCm: { w: 30, h: 60 },
  colours: ["#c9a55e"],
  imageId: "img-abc123",
  thumb: THUMB,
  createdAt: "2026-10-16T10:00:00.000Z",
  createdBy: "A",
  archived: false,
  ...over,
});

/** A crop of `w` × `h` pixels: a coloured object in the middle of a plain background. */
function photo(object: [number, number, number], background: [number, number, number], w = 40, h = 40) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = x > w * 0.25 && x < w * 0.75 && y > h * 0.2 && y < h * 0.8;
      const c = inside ? object : background;
      px.set([...c, 255], (y * w + x) * 4);
    }
  return px;
}

describe("inspiration import", () => {
  test("[IMP-05] the photo's own colours are found, not its background", () => {
    const colours = dominantColours(photo([31, 74, 58], [250, 250, 248]), 40, 40);
    expect(colours[0]).toBe("#1f4a3a");
    expect(colours.some((c) => c === "#fafaf8")).toBe(false);
  });

  test("[IMP-02] [IMP-05] the closest model comes first: by proportions and by colour", () => {
    // 60 cm tall and twice as tall as wide: a candelabra; a small low one: votives.
    const tall = suggest("candle", { sizeCm: { w: 30, h: 60 }, colours: [] }, catalog);
    expect(tall[0]?.id).toMatch(/^candelabra-/);
    expect(suggest("candle", { sizeCm: { w: 30, h: 8 }, colours: [] }, catalog)[0]?.id).toBe(
      "candle-votives",
    );
    expect(tall.every((e) => e.family === "candle")).toBe(true);
    // A green velvet swatch: the emerald runner beats white cloth; fabric is matched on colour.
    const fabric = suggest("fabric", { sizeCm: { w: 50, h: 50 }, colours: ["#214c3b"] }, catalog);
    expect(fabric[0]?.id).toBe("runner-velvet-emerald");
    // Gold chairs for a gold photo.
    const chair = suggest("chair", { sizeCm: { w: 45, h: 90 }, colours: ["#c8a35b"] }, catalog);
    expect(chair[0]?.id).toMatch(/gold/);
    // Something else is always a photo preview.
    expect(suggest("other", { sizeCm: { w: 60, h: 90 }, colours: [] }, catalog).map((e) => e.id)).toEqual([
      "photo-standee",
    ]);
  });

  test("[IMP-05] results are labelled honestly; a photo preview is never called 3D", () => {
    expect(RESULT_LABELS.photo).toBe("Photo preview");
    expect(RESULT_LABELS.photo).not.toMatch(/3D/);
    expect(RESULT_LABELS.material).toBe("Material");
    expect(RESULT_LABELS.approximate).toBe("Approximate 3D");
    const standee = importedEntry(
      imported({
        type: "other",
        result: "photo",
        baseId: "photo-standee",
        params: { image: "img-abc123", w: 0.6, h: 1.2 },
      }),
      catalog,
    );
    expect(standee.imported?.result).toBe("photo");
  });

  test("[IMP-04] [IMP-05] an approximate model takes the real size and the photo's colours", () => {
    // A centrepiece 45 cm tall is scaled to that height on the table.
    const base = entry(catalog, "floral-low");
    const params = importParams(base, {
      sizeCm: { w: 40, h: 45 },
      colours: ["#ef9fb8", "#ffffff"],
      imageId: "img-x1y2z3",
    });
    expect(params.colours).toBe("#ef9fb8,#ffffff");
    const item = imported({ id: "imp-flr001", type: "centrepiece", baseId: "floral-low", params });
    const cat = withImported(catalog, [item]);
    const round: Item = { id: "r", libraryId: "table-round", x: 4, z: 11, rotY: 0, options: { seats: 8 } };
    const parts = tableDecor(
      shapeOf(round, cat),
      { ...styleOf(round, DEFAULT_STYLE), candles: "none", florals: item.id },
      cat,
      { settings: false, menus: false, tableNumbers: false, linenLength: "floor" },
      1,
    );
    expect(heightOf(parts)).toBeGreaterThan(0.4);
    expect(heightOf(parts)).toBeLessThan(0.5);
    expect(
      parts.filter((p) => p.slot === "flower").every((p) => ["#ef9fb8", "#ffffff"].includes(p.colour ?? "")),
    ).toBe(true);
    // A floor piece is built to the real size; a chair takes its frame and seat colours.
    const plant = importedEntry(
      imported({ id: "imp-plt001", type: "plant", baseId: "plant-olive", sizeCm: { w: 80, h: 150 } }),
      catalog,
    );
    expect(plant.sizeM).toMatchObject({ w: 0.8, h: 1.5 });
    const chair = importParams(entry(catalog, "chair-oval"), {
      sizeCm: { w: 45, h: 90 },
      colours: ["#222222", "#aa0000"],
      imageId: "img-x1y2z3",
    });
    expect(chair).toEqual({ frame: "#222222", seat: "#aa0000" });
  });

  test("[LIB-09] a framed print shows the couple's own photo at its real size", () => {
    const params = importParams(entry(catalog, "sign-print"), {
      sizeCm: { w: 50, h: 70 },
      colours: [],
      imageId: "img-print1",
    });
    const item = imported({ id: "imp-prt001", type: "print", baseId: "sign-print", params });
    const e = importedEntry(item, catalog);
    const shape = shapeOf(
      { id: "p", libraryId: e.id, x: 9, z: 8, rotY: 0, options: {} },
      withImported(catalog, [item]),
    );
    if (shape.kind !== "piece") throw new Error("not a piece");
    const piece = makePiece(shape.generator, shape.params, shape.options, shape.size);
    expect(piece.image).toMatchObject({ id: "img-print1", w: 0.5, h: 0.7 });
    // The catalogue size is the piece's own, so placement and checks use the true footprint.
    expect(Math.abs(shape.width - e.sizeM.w)).toBeLessThan(0.01);
  });

  test("[IMP-06] imported items join the library and survive merges; removal sticks; unknown ones never break a room", () => {
    const a = imported({ id: "imp-aaa111" });
    const b = imported({ id: "imp-bbb222", createdAt: "2026-10-16T11:00:00.000Z" });
    const merged = mergeImports([a], [b, { ...a, archived: true }]);
    expect(merged.map((i) => i.id)).toEqual(["imp-aaa111", "imp-bbb222"]);
    expect(merged[0]?.archived).toBe(true);
    const cat = withImported(catalog, merged);
    expect(cat.get("imp-bbb222")?.imported?.result).toBe("approximate");
    expect(cat.get("candelabra-5")).toBe(catalog.get("candelabra-5"));
    // A partner's import not loaded yet shows as a plain panel instead of failing.
    expect(entry(catalog, "imp-zzz999").family).toBe("photo");
  });

  test("[IMP-07] a product link is kept only as the source, and only a web link is accepted", () => {
    const ok = importedSchema.safeParse(imported({ link: "https://shop.example.com/candelabra" }));
    expect(ok.success).toBe(true);
    expect(importedEntry(imported({ link: "https://shop.example.com/c" }), catalog).source.origin).toBe(
      "https://shop.example.com/c",
    );
    expect(importedSchema.safeParse(imported({ link: "javascript:alert(1)" })).success).toBe(false);
  });
});

// ---- API ----------------------------------------------------------------------------------------

const base = "https://studio.test";
let cookie = "";
const call = (
  method: string,
  path: string,
  body?: Uint8Array | object,
  headers: Record<string, string> = {},
) =>
  route(
    new Request(base + path, {
      method,
      headers: { "content-type": "application/json", cookie, ...headers },
      body:
        body === undefined
          ? undefined
          : body instanceof Uint8Array
            ? (body as BodyInit)
            : JSON.stringify(body),
    }),
  );

const TOKEN = "t".repeat(32);
beforeEach(async () => {
  process.env.APP_PASSWORD = "summer-wedding";
  process.env.SESSION_SECRET = "x".repeat(40);
  process.env.RS_MEMORY_STORE = "1";
  process.env.LIBRARY_REQUESTS_TOKEN = TOKEN;
  resetMemoryStore();
  cookie = "";
  const res = await call("POST", "/api/login", { password: "summer-wedding" });
  cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
});

const request = (over: Partial<CustomRequest> = {}): CustomRequest => ({
  id: "req-abc123",
  itemId: "imp-abc123",
  name: "Gold candelabra",
  sizeCm: { w: 30, h: 60 },
  placement: "table",
  notes: "Five arms, brushed gold",
  imageIds: ["img-abc123"],
  status: "requested",
  createdAt: "2026-10-16T10:00:00.000Z",
  updatedAt: "2026-10-16T10:00:00.000Z",
  createdBy: "A",
  ...over,
});

describe("library API", () => {
  test("[IMP-06] imported items and their photos are shared between partners", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    expect(
      (await call("PUT", "/api/uploads/img-abc123", jpeg, { "content-type": "image/jpeg" })).status,
    ).toBe(201);
    expect((await call("POST", "/api/catalog", { item: imported({}) })).status).toBe(201);
    const list = (await (await call("GET", "/api/catalog")).json()) as { items: Imported[] };
    expect(list.items.map((i) => i.id)).toEqual(["imp-abc123"]);
    const img = await call("GET", "/api/uploads/img-abc123");
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(jpeg);
    expect((await call("PATCH", "/api/catalog/imp-abc123", { archived: true })).status).toBe(200);
    const after = (await (await call("GET", "/api/catalog")).json()) as { items: Imported[] };
    expect(after.items[0]?.archived).toBe(true);
    // Bad input is refused at the boundary.
    expect((await call("POST", "/api/catalog", { item: { ...imported({}), id: "../x" } })).status).toBe(400);
    expect((await call("PUT", "/api/uploads/img-def456", jpeg, { "content-type": "text/html" })).status).toBe(
      400,
    );
    const big = new Uint8Array(700_000);
    expect((await call("PUT", "/api/uploads/img-def456", big, { "content-type": "image/jpeg" })).status).toBe(
      400,
    );
    cookie = "";
    expect((await call("GET", "/api/catalog")).status).toBe(401);
  });

  test("[REQ-01] [REQ-02] [REQ-03] [REQ-04] requests are private to the couple; Claude reads them with a read-only token", async () => {
    expect((await call("POST", "/api/library-requests", { request: request() })).status).toBe(201);
    const later = request({ status: "in_progress", updatedAt: "2026-10-16T12:00:00.000Z" });
    expect((await call("PATCH", "/api/library-requests/req-abc123", { request: later })).status).toBe(200);
    // An older change sent late does not undo the newer one.
    await call("PATCH", "/api/library-requests/req-abc123", { request: request({ notes: "old" }) });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    await call("PUT", "/api/uploads/img-abc123", jpeg, { "content-type": "image/jpeg" });
    cookie = "";
    const auth = { authorization: `Bearer ${TOKEN}` };
    const open = (await (
      await call("GET", "/api/library-requests?status=in_progress", undefined, auth)
    ).json()) as {
      requests: CustomRequest[];
    };
    expect(open.requests).toHaveLength(1);
    expect(open.requests[0]).toMatchObject({ status: "in_progress", notes: "Five arms, brushed gold" });
    expect((await call("GET", "/api/uploads/img-abc123", undefined, auth)).status).toBe(200);
    // Read-only: the token cannot change anything, and a wrong token reads nothing.
    expect(
      (await call("POST", "/api/library-requests", { request: request({ id: "req-zzz999" }) }, auth)).status,
    ).toBe(401);
    expect((await call("PATCH", "/api/library-requests/req-abc123", { request: later }, auth)).status).toBe(
      401,
    );
    expect(
      (await call("GET", "/api/library-requests", undefined, { authorization: "Bearer nope" })).status,
    ).toBe(401);
    // Merging keeps each request's latest change.
    expect(mergeRequests([later], [request()])[0]?.status).toBe("in_progress");
  });
});
