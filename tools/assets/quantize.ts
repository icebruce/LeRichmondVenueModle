// Quantize a model's geometry (KHR_mesh_quantization): integers instead of floats, about half the
// download, decoded by the browser with no WebAssembly (the site's CSP allows none). Used for the
// guest figures (V7, after `blender/people_pack.py`); the app turns them back into floats.
// Usage: node tools/assets/quantize.ts <in.glb> <out.glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { quantize } from "@gltf-transform/functions";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Usage: node tools/assets/quantize.ts <in.glb> <out.glb>");
  process.exit(1);
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
// 10-bit normals: at 8, a guest's sliver could turn over against its face.
await doc.transform(quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 16 }));
await io.write(output, doc);
console.log(`Wrote ${output}.`);
