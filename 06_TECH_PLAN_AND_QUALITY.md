# Suggested implementation plan, quality gates and test strategy

## Architecture recommendation (Claude may critique and improve)
- Vite + React + TypeScript; React Three Fiber + Drei on Three.js for interactive 3D; lightweight Zustand or equivalent for centralized app state.
- Data-driven independent modules: `VenueGeometry` (parametric static shell + PBR materials + source IDs), `EventLayout` (tables/chairs/dancefloor/people), `StyleSystem` (linens/candles/florals/lighting), `AssetCatalog` (references and visual objects), `ScenarioStore`, `CameraModes`, `CollisionAndAccessHints`, `UI`, `ReferenceComparison`.
- Use GLB/GLTF for licensed complex furniture, but create architecture geometry procedurally so uncertain dimensions are easily edited. Seed randomness; instanced meshes and LOD for chairs/guests/candles/flowers where appropriate.
- Persistence: browser IndexedDB for imported image blobs and scenes, explicit JSON backup/export, schema versioning. Handle browser storage failures visibly.
- Build using locally available tools, not dependent on asking user to buy subscription software. No vendor lock-in. Optional offline/desktop packaging later.

## Data structures
1. `venue_geometry.json`: metric geometry parameters, levels, walls, bars, windows, doors, stair edges, sourceRefs, confidence, notes; model transformation is deterministic.
2. `assets.json`/asset DB: id, category, renderer type, local reference image, source link, dimensions, visual match notes, license/provenance.
3. `scenarios.json`: array of instances by asset ID, position XYZ and rotation, style overrides, occupancy seed/counters, lights, camera snapshots, version.
4. `reference_register.json`: photo/video URL, scope, viewpoint, recognized landmark tags, estimated camera pose, observations and conflicts.

## Incremental vertical slices
**Phase 0 — Source analysis and approved plan**: inspect linked gallery/photos/videos/360, build venue landmark map, note suspect terrace images, initial geometry assumptions with confidence. Ask user to approve approach.

**Phase 1 — Recognizable venue**: generate static shell/bar/glazing/wood ceiling/brick/steps and 2–3 main 3D camera modes. Render four reference-matching views and inspect them; refine before adding a large feature set. Deliver working browser URL and source project.

**Phase 2 — Wedding configurator**: tables/chairs/dancefloor/DJ/food stations/people; drag/rotate/duplicate/undo; basic linen/candle/floral variants; scenarios and persistence; validation tests.

**Phase 3 — Asset intake and polish**: user image/link -> object classification -> material/parametric/2.5D/native-3D placement; reference photo comparisons, refined textures, evening lighting, performance, keyboard access, visual QA.

## Visual quality expectations
- Match **shape and composition** before tiny decorations: bar outline, major wall directions, glass bays, levels, lighting fixture silhouettes, ceiling structure and brick color.
- Match **lighting and color**: daytime neutral for structure; nighttime warm lower exposure for wedding choices, not neon or washed out.
- Compare screenshots with source photo R01/R02/R03/R04 from roughly similar camera viewpoints; attach screenshot diff or paired images and enumerate errors. Keep an uncertainty register.
- Avoid using copyrighted source photos as wall textures (except appropriately licensed content). If exact art reproduction isn't licensed, approximate its frame/silhouette/colors or use an intentionally generic substitute, while retaining a photo as a private research comparison.

## Practical testing
- Unit tests: geometry coordinate transformations, chair counts, occupancy counts, save/restore roundtrip, undo/redo, catalog asset dimensions, collision helper geometry.
- End-to-end Playwright: load scene; add/move/remove; switch materials; change guest count; save layout; reload; import file; fallback for blocked URL; switch camera.
- Screenshot tests at typical desktop viewport plus a smaller laptop size; performance smoke test with 100+ guest figures and 15 tables (illustrative benchmark, not asserted intended capacity).
- Validate UI keyboard/mouse interactions, exact tabletop positioning, gravity/levels, wall collisions, lack of accidental placement outside room.
- Exclusion test: `mezzanine`, `bistro`, `terrace` don't exist as navigable/editable zones; terrace-photo metadata excluded from geometry inference.

## Constraints & communications
- User supplies photos/feedback only; Claude executes all building, environment commands, packaging and tests after approval. If tools do not allow access to external photos/360/video, plainly report the limitation and continue from accessible URLs or provided screenshots. Avoid claiming videos were inspected when they were not.
- Never claim floor measurements are confirmed from photos or infer crowd/fire-code compliance. Warnings must say advisory only.
- Maintain `PROJECT_STATUS.md`: decisions, verified assets, pending user choices, geometry confidence, current issues, screenshot comparison scores and next actions.
- Any use of image or 3D model generation services requiring account connection or fees must be proposed before use.