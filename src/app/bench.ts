import type { Editor } from "../state/editor";

/**
 * Benchmark scenes (VISUAL_STATUS.md, V0), opened with `?bench=sample` or `?bench=ppl03` on a fresh
 * session, so the couple's own plans are never touched:
 * - `sample`: the venue sample plan, 75 guests, the heaviest table dressing;
 * - `ppl03`: 15 round tables of 8 and 150 guests (PPL-03), the same dressing and a dressed room.
 */
export type Bench = "sample" | "ppl03";

export function benchParam(): Bench | null {
  const b = new URLSearchParams(window.location.search).get("bench");
  return b === "sample" || b === "ppl03" ? b : null;
}

/** The heaviest dressing the layout allows (DEC-02 leaves off candles with no room): no flowers, so
 * the most candles fit (heavier than tall arrangements with a candle mix), runners, full settings. */
const HEAVIEST = {
  florals: "none",
  candles: [
    { id: "candelabra", n: 8, arms: 5 },
    { id: "candle-sand-trio", n: 8 },
    { id: "candle-tapers", n: 8 },
  ],
  runner: "runner-chiffon-ivory",
  napkin: "napkin-sage",
  charger: "gold",
};

/** Step-3 pieces across the room: lights, plants, florals and signs. */
const ROOM_PIECES: readonly (readonly [string, number, number])[] = [
  ["light-string", 5, 4],
  ["light-string", 5, 9],
  ["light-uplight", 0.6, 3],
  ["light-uplight", 0.6, 7],
  ["light-disco", 4.5, 11],
  ["light-chandelier", 11, 6],
  ["floral-arch", 2.8, 12.6],
  ["floral-wall", 15, 7],
  ["plant-olive", 15.5, 2],
  ["plant-kentia", 12, 11.3],
  ["sign-neon", 9, 0.4],
  ["sign-welcome", 14, 12.4],
];

export function buildBench(editor: Editor, bench: Bench) {
  if (bench === "ppl03") {
    editor.createScenario("blank");
    // Seeded across the room on a 2.8 m grid: from one point the free-spot search packs only 13.
    for (let z = 1.45; z < 12.9; z += 2.8)
      for (let x = 1.45; x < 16; x += 2.8)
        if (editor.active().items.length < 15) editor.addItem("table-round", [x, z], { seats: 8 });
    editor.setGuests(150);
  } else {
    editor.createScenario("sample");
    editor.setGuests(75);
  }
  editor.applyStyle("all", HEAVIEST);
  for (const k of ["settings", "menus", "tableNumbers"] as const) editor.setStyle(k, true);
  if (bench === "ppl03") for (const [id, x, z] of ROOM_PIECES) editor.addItem(id, [x, z]);
  editor.renameScenario(bench === "ppl03" ? "Benchmark · 15 tables, 150 guests" : "Benchmark · venue sample");
  editor.select([]);
}
