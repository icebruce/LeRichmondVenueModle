// Quantize a model's normals and texture coordinates (KHR_mesh_quantization): integers instead of
// floats, about a third off the download, decoded by the browser with no WebAssembly (the site's
// CSP allows none). Used for the guest figures (V7, after `blender/people_pack.py`); the app turns
// them back into floats.
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
// Normals (10-bit) and texture coordinates only: positions stay floats, as a guest's slivers turned
// over against their faces at 16 bits, and normals at 8.
await doc.transform(quantize({ pattern: /^(NORMAL|TEXCOORD_0)$/, quantizeNormal: 10, quantizeTexcoord: 16 }));
await io.write(output, doc);
console.log(`Wrote ${output}.`);
