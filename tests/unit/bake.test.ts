import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { venue } from "./fixtures";
import manifest from "../../data/bake/manifest.json";
import { bakeInputsHash, roomAtlas } from "../../src/scene/venue/bake";

const root = new URL("../..", import.meta.url).pathname;

describe("baked room light", () => {
  test("[LGT-03] the light maps were baked from this room, its lights and this bake script (run `npm run bake`)", () => {
    expect(manifest.geometryHash).toBe(roomAtlas(venue).hash);
    expect(manifest.inputsHash).toBe(bakeInputsHash(venue));
    const script = createHash("sha256")
      .update(readFileSync(`${root}tools/blender/bake_room.py`))
      .digest("hex");
    expect(manifest.scriptHash).toBe(script);
  });

  test("[LGT-03] the light-map atlas gives large walls at least 30 texels a metre at 2K", () => {
    expect(roomAtlas(venue).atlas.texelsPerMetre).toBeGreaterThanOrEqual(30);
  });
});
