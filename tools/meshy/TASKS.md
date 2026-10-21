# Meshy tasks (proof of concept, 2026-10-18)

API: `https://api.meshy.ai/openapi`; the key is injected by the session proxy (no env var needed).
`docs.meshy.ai` is blocked by the network policy; the animation catalogue is free at
`GET /openapi/v1/animations/library` (678 clips). Credits after the POC: 989.

| What | Task id | Notes |
|---|---|---|
| Man, preview (chosen "b") | 01a14cd1-29ca-7169-8840-c8ece42f8158 | `prompts/man-preview.txt`; realistic, A-pose, symmetry on, 30k target |
| Man, refine (textured) | 01a14cd4-9df4-77a0-8bce-a0c8b9439d84 | `prompts/man-texture.txt`, PBR on. The owner liked this unposed result: the quality reference |
| Man, rig | 01a14cd5-3880-765c-8837-13575c5b873b | height 1.78 m; `tools/visual-poc/meshy/source/man-b-rig.glb` on branch `proto/visual-poc` (24 bones, no finger bones) |
| Chair Sit Idle Male (action 33) | 01a14d3d-b21d-71a0-a0d4-da125448a6e7 | frame 1 is the seated base pose used in POC v5 |
| Sit and Drink (action 343) | 01a14d3d-b423-77fd-8f2b-c29c8e0b9808 | frame ~132 lifts the hand to the mouth; reads as waving without a glass |

Useful clips: 32 Chair Sit Idle Female, 33 Chair Sit Idle Male, 56 Stand and Chat, 342 Stand and Drink,
343 Sit and Drink, 354 Sitting Clap, 307 Sitting Answering Questions, 0/11/12 and 243–254 idles.

Gotchas in the rigged GLB: an extra `Icosphere` object and a bundled action (delete both); the
armature carries rotation and 0.01 scale (convert world directions into armature space); the hand
bones' tails are unusable (take hand direction from the mesh); the mesh is split along UV seams
(weld before any smoothing or simplifying; check with `blender/mesh_audit.py`).

## Chairs (V4, 2026-10-19)

Previews at 3,000 triangles (`preview <name> <prompt> 3000 prop`), refined with PBR, then
`blender/chair_from_meshy.py`. The first previews were rejected (carved back pad; a solid panel
under the cross-back's seat; a grid back on the Chiavari); the prompts were tightened once.
Not used: a second oval refine asking for a fully upholstered back (01a15242-8c7c-72c5-a583-b0a645f62e72;
the defect it was meant to fix was a guest showing through the backrest) and a 2,000-triangle remesh
(`POST /v1/remesh`, 5 credits, 01a15251-e3e7-775f-88c1-45634ef8aec2: thin ring, faceted pad, warped
legs). Credits after: 824.

| Chair | Preview | Refine | Width, backrest, height (m) |
|---|---|---|---|
| Oval-back | 01a15213-bab2-75f1-94ed-1763f0ce65e9 | 01a15215-1d15-74fc-ad1a-ea953e65a32a | 0.47, -0.225, 1.00 |
| Cross-back | 01a15213-c34a-7759-8631-94e9972dcc87 | 01a15215-24e5-715f-9f11-6f0a449dc391 | 0.44, -0.225, 0.92 |
| Chiavari | 01a15213-cb96-705d-8575-168e2fda0c24 | 01a15215-2c9a-75e3-81fb-ea14b3582ed7 | 0.41, -0.225, 0.92 |

## Blooms and plants (V5, 2026-10-20)

Owner: Meshy for all eight flower types and the six plants. Blooms are untextured previews (`preview
<name> <prompt> <polycount> prop`; the app tints them, and `blender/bloom_from_meshy.py` bakes their
creases into the vertex colour); plants are refined with PBR and keep only the colour map
(`blender/plant_from_meshy.py`). Credits 824 → 394.

| Bloom | Used | Rejected |
|---|---|---|
| Rose | 01a15756-52aa-7798-8c5e-683d64209d9d (580 tri, `front-up`) | — |
| Peony | none: peonies draw the ranunculus, larger (owner 2026-10-20) | 01a15778-9524-7349-9eeb-d07886ff5550 (remesh to 600 of 01a15773-fc8e-74f7-91ac-89be57e07964: torn petals at eye level), 01a15757-f19d-714d-8092-e1388d604e17 (stray spike), 01a1575a-a881-744e-9864-229c86aa3c62 (spiky); the 1,345-triangle preview put a table of peonies at 1.2 M triangles |
| Ranunculus | remesh to 600 01a15778-9639-7350-931c-44298d93ec52 of 01a15774-0472-706c-a4c1-b8472e3d1107 (`stem`) | 01a15758-060c-74d7-b087-845e5949738b (a dahlia), 01a1575a-b1c5-7449-a50c-8abbbb9fcca2 (spiky) |
| Pampas plume | 01a15758-15d3-709f-9096-9d704ee57c1c | — |
| Blossom cluster | 01a15758-1d29-75f0-b177-bf1311d7c926 | — |
| Eucalyptus sprig (every mound's leaves) | 01a15758-29f1-74a0-aa83-8880df56de29 | — |
| Hydrangea | none: the app keeps its primitives | 01a15757-fe18-743f-b23d-c3f8fce71d7e (failed, too dense; no charge), 01a1575a-ba91-7506-aae9-7dd69e1dfc96 (shards) |
| Baby's breath | none: the app keeps its primitives | 01a15758-0e62-75f1-84cc-32cf1d84c4b6 (florets broke apart) |

| Plant | Preview (8,000 target) | Refine | Height (m) |
|---|---|---|---|
| Fiddle-leaf fig | 01a15758-9805-71f4-8290-01f3e5f570a1 | 01a1575e-b6e1-737f-890d-7c3d4333300f | 1.95 |
| Olive tree | 01a15758-a00b-73b5-884d-abfe996c6122 | 01a1575e-bf05-766a-8c36-8611014dc51b | 2.0 |
| Kentia palm | 01a15758-a903-70ea-ac57-b619127f29be | 01a1575e-c01d-73f3-b814-3ca593592f4f | 2.0 |
| Monstera | 01a15758-b120-7434-91dc-000611b8a2b3 | 01a1575e-c12e-741b-865d-c3983feb1de3 | 0.9 |
| Fern | 01a15758-bd00-779b-855a-2b3a4fa5e9c1 | 01a1575e-c252-7289-bc46-da8fe463df01 | 0.65 |
| Blossom tree | 01a15758-c51b-7489-8a95-fb339e5513ac | 01a1575e-c36c-7104-836f-53a8e813d465 (`prompts/plant-blossom-texture.txt`) | 2.4 |

## Chandeliers (V6, 2026-10-20)

Owner: Meshy for both chandeliers. Text prompts only (`prompts/chandelier-*.txt`). Credits 394 → 299.

| Chandelier | Used | Rejected |
|---|---|---|
| Birdcage (the crystal chandelier inside; the cage is built in code) | preview 01a15abb-ee55-7775-b5f1-928b8d236775, refine 01a15ac2-f940-757a-a56a-9ffa902d7ec6, remesh to 8,000 01a15ad6-b9c3-762f-9440-f860d2b41c40 (6,662 triangles; the refine's 18k was 1.5 MB, over the initial-download budget) | — |
| Brass cluster | none: built in code (tiers of arms, R03) | 01a15abb-e64a-733f-8782-a82eb40da2d8 (a candle chandelier), 01a15abd-24d8-7170-b143-7ffd9ba0b052 (a sputnik), 01a15ac1-8427-74d2-915d-5a659031246a (a column of hanging cylinders) |

## People (V7, 2026-10-21)

Owner: up to 180 credits; the man of the proofs of concept kept as approved (with his tie); the woman in a fitted sleeveless midi sheath dress with a low bun. Text prompts only (`prompts/woman-*.txt`; the owner's stock reference stays private). Credits 299 → 229.

| Character | Used | Rejected |
|---|---|---|
| Man | preview 01a14cd1-29ca-7169-8840-c8ece42f8158, refine 01a14cd4-9df4-77a0-8bce-a0c8b9439d84 (above) | — |
| Woman | preview 01a15bfe-2172-728a-9e56-d14e372f6d7d (attempt 2), refine 01a15c02-a260-77aa-9c72-e4be87fee8ba | 01a15bfd-1bfd-718d-9445-8fa63baf0881 (no dress), 01a15bff-55ab-7772-ace1-f6f34b25e74f (long hair, not a bun) |
