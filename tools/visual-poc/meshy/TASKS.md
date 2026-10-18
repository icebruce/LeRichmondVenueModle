# Meshy tasks (proof of concept, 2026-10-18)

API: `https://api.meshy.ai/openapi`; the key is injected by the session proxy (no env var needed).
`docs.meshy.ai` is blocked by the network policy; the animation catalogue is free at
`GET /openapi/v1/animations/library` (678 clips). Credits after the POC: 989.

| What | Task id | Notes |
|---|---|---|
| Man, preview (chosen "b") | 01a14cd1-29ca-7169-8840-c8ece42f8158 | `prompts/man-preview.txt`; realistic, A-pose, symmetry on, 30k target |
| Man, refine (textured) | 01a14cd4-9df4-77a0-8bce-a0c8b9439d84 | `prompts/man-texture.txt`, PBR on. The owner liked this unposed result: the quality reference |
| Man, rig | 01a14cd5-3880-765c-8837-13575c5b873b | height 1.78 m; `source/man-b-rig.glb` (24 bones, no finger bones) |
| Chair Sit Idle Male (action 33) | 01a14d3d-b21d-71a0-a0d4-da125448a6e7 | frame 1 is the seated base pose used in POC v5 |
| Sit and Drink (action 343) | 01a14d3d-b423-77fd-8f2b-c29c8e0b9808 | frame ~132 lifts the hand to the mouth; reads as waving without a glass |

Useful clips: 32 Chair Sit Idle Female, 33 Chair Sit Idle Male, 56 Stand and Chat, 342 Stand and Drink,
343 Sit and Drink, 354 Sitting Clap, 307 Sitting Answering Questions, 0/11/12 and 243–254 idles.

Gotchas in the rigged GLB: an extra `Icosphere` object and a bundled action (delete both); the
armature carries rotation and 0.01 scale (convert world directions into armature space); the hand
bones' tails are unusable (take hand direction from the mesh); the mesh is split along UV seams
(weld before any smoothing or simplifying; check with `blender/mesh_audit.py`).
