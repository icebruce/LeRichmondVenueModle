// Prepare a model for the app (VISUAL_STATUS.md, V0): drop duplicate and unused data, resize its
// textures to the target, and compress the geometry with meshopt. Never simplifies or smooths (the
// asset quality bar); detail comes from the Blender bake. KTX2 textures need KTX-Software's `toktx`
// and are added when the first textured model ships.
// Usage: node tools/assets/optimize.ts <in.glb> <out.glb> [desktop|phone]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const [input, output, target = "desktop"] = process.argv.slice(2);
if (!input || !output || !["desktop", "phone"].includes(target)) {
  console.error("Usage: node tools/assets/optimize.ts <in.glb> <out.glb> [desktop|phone]");
  process.exit(1);
}
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(input);
const side = target === "phone" ? 1024 : 2048;
await doc.transform(
  dedup(),
  prune(),
  // Without an encoder library this only resizes, keeping each texture's format.
  textureCompress({ resize: [side, side] }),
  meshopt({ encoder: MeshoptEncoder }),
);
await io.write(output, doc);
console.log(`Wrote ${output} (${target}).`);
