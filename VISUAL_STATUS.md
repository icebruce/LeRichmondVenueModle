# Richmond Studio — Visual Upgrade Status

**Current stage:** V0 built (PR #16, 2026-10-18), waiting on the owner: read `?perf` on the three devices, merge. Then V1 and V2 as one PR each, stopping after V2 for owner approval; V7 waits for the owner before any Meshy spend (owner, 2026-10-18). Plan v3 approved (owner, 2026-10-18): end-to-end implementation in eight stages, people last. The proofs of concept are done and closed (branch `proto/visual-poc`, never merged; it holds the scripts that V0 brings over). Freeze ~2026-11-10; no visual merges after 2026-11-07, fixes only.
**Scope:** look and performance only. Behaviour stays as in `PRODUCT_SPEC.md`; the owner validates functionality separately. Main plan: `PROJECT_STATUS.md`. Reference analysis (finish checklist, people style, venue details, evening calibration): `docs/visual/REFERENCE_NOTES.md`.

## Goal

A premium, polished room for deciding décor and seeing it realistically, much closer to the owner's isometric sample while staying a live render, with no lag on a laptop, an iPhone 16 or a Galaxy S24. Best visible return per cost: big, frequently seen surfaces and pieces first; nothing that cannot be seen at room scale.

## Approach (decided)

**Lighting: hybrid bake** (owner, 2026-10-17; LGT-03, ADR-2).

- **Baked:** the fixed room's own light, direct and bounced from the venue's fixtures (walls, floor, ceiling and beams, bar and back bar, stair, mezzanine edge, banquettes). Baked in Blender (Cycles) into light maps, one evening set and one daylight set.
- **Live:** everything movable (tables, linens, chairs, décor, people) and every light the couple places. Live parts get one shadow-casting light drawn once, painted light pools and contact shadows, and one room reflection capture.
- **Re-baking:** a build step Claude runs (`npm run bake`) in the same pull request as any change to the fixed room or its fixtures. Nothing the couple does in the app needs a re-bake.
- **Stale-bake guards:**
  - CI fails when the bake does not match the venue data.
  - At load, a mismatched bake falls back to live lighting, so the room is never shown with wrong light.
- **Photo mode** gives realistic stills: the same scene rendered larger with full-quality shading, real light from lamps and candles, and depth of field, overlays hidden, in 1–3 s.

**Geometry and assets.**

- **Where real polygons go:**
  - Only where a silhouette is seen in the benchmark views.
  - Detail smaller than ~20 px on the phone at the default views becomes texture or is not built.
- **Blender pipeline:**
  - Pieces are authored in Blender from committed Python scripts.
  - Detail is baked from a full model onto a simple one: colour, ambient occlusion and normal maps.
  - Trim sheets (one shared texture of mouldings, panel edges and tufting) serve the bar, back bar, banquettes and frames.
  - See-through cut-out cards for railings, leaves, petals and bottle rows.
- **In the app:**
  - Instancing for repeated pieces.
  - Simpler versions at distance.
  - Detailed versions only at eye level, in Sit here and in Photo mode.
  - KTX2 textures and meshopt geometry.

**Asset quality bar** (owner, 2026-10-18): every model can be low-poly, but it is never broken. That means no tears, holes, folds, jagged or faceted surfaces, floating parts or pieces passing through each other where they can be seen. `check-assets` (V0) enforces this on every GLB in CI:

- the mesh is closed where the source was closed (no open or non-manifold edges added by processing)
- no zero-area faces and no flipped normals
- triangle and texture budgets met
- contact rules met: on the floor, on the seat, on the table, within tolerance

Every new model is also reviewed in close-up renders against its source before it reaches the app.

## Stages

One pull request per stage, with the Vercel preview. Stopping after any stage leaves a consistent, shippable result. Order: performance first; then the fixed room's shape and surfaces, which the bake depends on; then light; then everything movable; people last. A later room change only means re-running the bake script.

| Stage | Delivers (summary) | Priority | State |
|---|---|---|---|
| V0 | Performance foundation, measurement, asset pipeline and checks | Must | Built (PR #16), waiting on the owner: device readings, merge |
| V1 | Room model and surfaces | Must | Not started |
| V2 | Light: hybrid bake, evening calibration, grounding | Must | Not started |
| V3 | Bar and back bar | Should | Not started |
| V4 | Linens and chairs | Must | Not started |
| V5 | Table décor and Photo mode | Must | Not started |
| V6 | Remaining fixtures | If time allows | Not started |
| V7 | People | Should | Not started |

### V0: Performance foundation and measurement

**Delivers:**

- **Rendering:**
  - Render only when something changes.
  - Static shadows drawn once.
  - Constant light count, so switching views or lighting never recompiles shaders (the likely cause of today's view-switch and menu lag).
  - Merge static venue meshes by material.
  - The compare view on the Balanced tier.
- **Graphics tiers:**
  - Auto, High, Balanced and Battery saver, with the Auto frame-time monitor.
  - The setting is a new UI pattern: mock-up first, for owner approval.
- **Measurement:**
  - Hidden `?perf` overlay: median and slow-frame times, longest frame, draw calls, triangles, GPU memory estimate, tier; Copy button.
  - Benchmark cameras: dollhouse default and eye level.
  - Benchmark scenes:
    - the venue sample plan with the heaviest décor and 75 guests
    - the PPL-03 scene: 15 tables, 150 guests
- **Asset pipeline:**
  - Bring the Blender, bake and capture scripts over from `proto/visual-poc` into `tools/`.
  - `check-assets` in CI.
  - gltf-transform (dev dependency) for meshopt and KTX2.
  - Blender runs headless from its Python module.

**Validation:**

- **Automated:**
  - 0 frames rendered while idle.
  - 0 shader recompiles on view, lighting and menu switches (program count unchanged).
  - Budget test on both benchmark scenes per tier.
  - `check-assets` passes on the existing GLBs.
- **Devices:** the owner reads `?perf` on the laptop, iPhone 16 and Galaxy S24; the numbers are recorded here as the baseline.
- **Review:** `ux-reviewer` on the setting mock-up and overlay.

**Gate:** the targets below are met on the owner's devices, or the gap is recorded with a fix plan. The phone draw-call budget is revisited from measurement.

**Built (PR #16, 2026-10-18):**

- Frames on demand, shadows redrawn only when the room's contents change, the same light set in every view, parts hidden rather than unmounted, every shader compiled at load: 0 frames while still and 0 compiles on view, lighting, menu and selection switches (CI, both device weights), and none after a tier change.
- Tiers High, Balanced, Battery saver with Auto (`state/graphics.ts`); the compare halves draw at Balanced's moving resolution. The setting is built as the approved mock-up (`docs/mockups/graphics.html`, owner 2026-10-18; PLT-05): Room › This device › Graphics, kept per device.
- Lever differences from the table, decided in the build: bloom keeps one resolution in every tier, and multisampling, bloom strength and vignette follow the device as before (changing either at run time rebuilds every effect pass, a stall of its own); "Décor and people detail" follows the device (phones load the lighter models, PLT-03), since Auto never changes models. Light maps, textures and the reflection capture levers come with V1 and V2.
- Static venue parts (floors, railing, bar, back bar, furnishings) merged per material.
- `?perf` overlay with Copy and the two benchmark cameras (dollhouse, `benchEye`); `?bench=sample|ppl03` opens a benchmark scene on a fresh session.
- `tools/`: the Blender and Meshy scripts, `check-assets` (in CI; 0 GLBs today, every piece is parametric) and `optimize` (glTF Transform, meshopt). Headless Blender verified: `pip install bpy` runs `mesh_audit.py` (45 open edges on the Meshy man, as the checker also finds).

**Measured in CI (software rendering, frame totals with the shadow pass):**

| Scene | High | Balanced (moving) | Balanced (still frame, with AO) | Battery saver |
|---|---|---|---|---|
| Venue sample, heaviest décor, 75 guests | ≈ 125–165 calls, ≈ 0.3–0.5 M tris | ≈ 110 | ≈ 120 | ≈ 70–90 |
| PPL-03: 15 tables, 150 guests | ≈ 200–220, ≈ 0.85 M | ≈ 140 | ≈ 140–155 | ≈ 85–95 |

The Balanced still frame on PPL-03 can reach ≈ 155 draw calls (its ambient-occlusion passes), above the phone budget of 150; moving frames stay under it. Kept at 150 for the owner's decision at the gate (Open items).

**Device baseline (owner, `?perf` → Copy, at the gate):** laptop —, iPhone 16 —, Galaxy S24 — (not yet read).

### V1: Room model and surfaces

**Delivers:**

- **Open fidelity fixes:**
  - the restroom corridor opening in the north wall (R07), its clearance check applying like the other openings
  - the mezzanine fascia projecting ≈ 0.6 m
  - the LED treads glowing lime-yellow across each tread top
  - the kitchen pass less bright
- **Surfaces at real-world scale (CC0, Poly Haven), each with normal and roughness maps:**
  - slate floor tiles (`large_floor_tiles_02`, 0.65 m tiles, per-tile tone, wood joint strips)
  - dark hardwood (`old_wood_floor`)
  - buff brick (`yellow_brick`) with soft patch variation
  - red-brick dado (`red_brick`)
- **Room details:**
  - Garage-door frames, pier bands and the green panelled wall.
  - Ceiling at eye level: bevelled beams and girders, rivets as texture, black conduit and track runs as thin lines.
  - North-wall tufted nail-head banquettes (trim sheet).
  - Sheer curtains behind the east velvet.
  - Bevelled edges on counters, wall caps and frames.
- **Presentation:** light wall caps, a plinth under the room, and its soft shadow on a gradient backdrop; narrower-lens A/B for the dollhouse default.
- **Textures:** compressed, with a 1K phone set.

**Validation:**

- **Automated:**
  - Budget and download test per tier.
  - GPU texture memory within the V0 budget.
  - Owner-stated dimensions still within tolerance (unit).
  - Visual baselines updated in a reviewed commit.
- **Review:**
  - `fidelity-reviewer` vs R01–R04, R06, R07, R09 and R10.
  - Finish checklist (`REFERENCE_NOTES.md` §1) items Bevelled, Presented and Real scale.
  - `ux-reviewer` on the presentation.
- **Devices:** no frame-rate regression of more than 10% from V0.

**Gate:** the owner approves the room on the preview.

### V2: Light (hybrid bake, evening calibration, grounding)

**Delivers:**

- **Bake pipeline (`npm run bake`):**
  - Export the fixed room from the venue data.
  - In Blender: light-map UVs, the venue's own lights, and a Cycles diffuse bake (direct and bounced), denoised.
  - Encode as 8-bit KTX2: 2K desktop, 1K phone.
  - Store the hash of the venue data and bake script with it.
  - Evening and daylight sets.
- **In the app:**
  - The room uses its light map; the dollhouse cutaway reuses the full walls' bake.
  - Live fill lights the bake replaces are removed.
  - Movables keep live light.
  - A box-projected room reflection capture.
  - An HDR environment for daylight.
- **Grounding and light:**
  - Painted light pools under chandeliers and on the bar top; warm uplight washes on the brick piers.
  - Contact shadows under tables, chairs and people.
  - Soft darkening where walls meet the floor.
- **Calibration:**
  - Evening light hierarchy, exposure and white balance tuned side by side against R06, R08, R11, U02 and UV01, from camera presets matching R08 and U02.
  - Calmer warm whites.
  - The colour check: white, ivory and champagne linens and the flower palette stay distinguishable under evening light.
- **Docs:** the LGT-03 test replaces its manual entry in `check-traceability`.

**Validation:**

- **Automated:**
  - `[LGT-03]` stale bake fails CI.
  - `[LGT-03]` e2e: a mismatched bake at load shows the live-lit room.
  - Bake check: no empty or black texels on visible faces, and minimum texel density on large walls.
  - Download within budget, with the phone set loaded after the room appears.
  - 0 recompiles when switching lighting.
- **Review:**
  - Calibration shots beside each reference photo.
  - The colour check renders.
  - `fidelity-reviewer`.
  - Finish checklist items Grounded, Soft light and Calm palette.
  - The two target pictures in `docs/visual/` met or beaten from the same cameras.
- **Devices:** frame rate equal or better than V1.

**Gate:** the owner approves the evening and daylight look on the preview.

### V3: Bar and back bar

**Delivers:**

- **Bar:** thick marble slab with real veining and eased edge, panelled black base, foot rail; the two bar flowers (big glass vases with tall white blossom branches, movable along the bar top; spec row and scenario migration).
- **Back bar,** with the grandeur of R02, R03 and R14:
  - 5–6 lit shelf rows up to the canopy.
  - A front row of real bottles in four shapes; rows behind as backlit bottle cards in amber, green and clear, with gaps and rows of glasses.
  - An antique-mirror back panel, brighter at the top of each bay.
  - A bevelled wood frame with brass trim and crown moulding (trim sheet).
  - A steel canopy with downlights.
  - Lit glass-door fridges, the chrome espresso machine and the round red neon.
  - Small plants and dried grasses on the canopy, and string instruments on the brick (cards).
- **Wine wall:** bottles as cards.
- **Bake:** re-baked.

**Validation:**

- **Automated:** `check-assets`, budget test and the stale-bake check.
- **Review:** `fidelity-reviewer` vs R02, R03, R11, R14 and R15.

**Gate:** the owner approves on the preview.

### V4: Linens and chairs

**Delivers:**

- **Linens:**
  - A procedural drape for every table shape and size: eased top edge, folds deepening toward the hem, gathered rounded corners, a hem floating just above the floor.
  - Runners the same way.
- **Chairs:**
  - The chair-gap rule: tucked chairs never pierce floor-length cloth.
  - The venue oval-back chair (weathered oak, grey velvet) built in Blender, with detail baked onto a ~2.5k-triangle version (≤ 400 for the overview and phone), and the other chair styles in the same way.

**Validation:**

- **Automated:**
  - Unit tests for the drape's vertex counts and corner shapes per table size.
  - Unit test for the chair-gap rule.
  - `check-assets`: chair legs on the floor within ±5 mm, no open edges.
  - Budget test with 150 chairs per tier.
- **Review:** `fidelity-reviewer` vs R04, R09 and R10; finish checklist item Soft goods.

**Gate:** the owner approves on the preview.

### V5: Table décor and Photo mode

**Delivers:**

- **Table décor:**
  - Flowers as cupped bloom shapes and folded leaf blades from one texture sheet, with a warm petal glow at night (the proof of concept's roses were 42k triangles; cards bring them into budget).
  - Candles: teardrop flames, a warm pool on the cloth, reflective glass.
  - Table-number stand with the card printed from a shared sheet.
  - Tableware: plates, chargers, stemmed goblets and folded napkins, all turned.
  - Detailed versions at eye level, in Sit here and in Photo mode; library thumbnails re-rendered.
- **Photo mode:** the same scene rendered larger with full-quality shading and shadows, real lamp and candle light, depth of field and overlays hidden; saves the image (EXP-02).

**Validation:**

- **Automated:**
  - Budget test with the heaviest décor on every table per tier.
  - The colour check repeated with décor.
  - e2e Photo mode flow: opens, renders, saves, returns with the same view.
  - Visual baselines.
- **Devices:** Photo mode completes in ≤ 3 s on both phones; editing frame rate unchanged.
- **Review:** `ux-reviewer` on the Photo mode controls (new pattern, mock-up first).

**Gate:** the owner approves on the preview.

### V6: Remaining fixtures (if time allows)

**Delivers:**

- Ornate iron scroll railings as cut-out panels (stair, raised floor, mezzanine; R09, R11).
- East curtains: deep pleats, sheen.
- Plants: fiddle-leaf figs by the green wall and the west garage door; planters on the east window sills.
- The terrace string-light canopy through the garage doors at night (R11, R16).
- Chandelier polish, then a re-bake if fixtures change.

**Validation:** as V3.

**Gate:** the owner approves on the preview.

### V7: People (last)

V7 is the last change to the app. Details, lessons from the proofs of concept and the people budget are in **People plan** below.

**Delivers:**

- **Figures:** a man and a woman in 4 poses each: seated with hands on the table, seated with hands in the lap, standing relaxed, standing with a glass.
- **Versions:** each in three detail levels.
- **Colour:** per-guest outfit, skin and hair colours from one shared material.
- **Rendering:** solid at eye level and in Sit here; light and see-through in the dollhouse overview.
- **Docs:** the `DESIGN_GUIDE.md` §9 people rule and the PRODUCT_SPEC people line updated.

**Validation:** in **People plan**.

**Gate:** the owner approves each pose in close-up renders before integration, then the room on the preview.

## People plan (V7)

**Quality bar** (owner, 2026-10-18): proper models in natural poses. Lower-poly is acceptable; broken, torn, folded or jagged is not. The unposed Meshy character is the reference for surface quality: a posed figure must look as clean as it does. The minimal face is kept (owner, 2026-10-18).

**What went wrong in the proofs of concept, and the rule that prevents it:**

| Problem seen | Cause | Rule |
|---|---|---|
| Jacket and lapels torn into shards | Meshy splits the mesh along texture seams; smoothing and simplifying pulled the seams apart (6,975 open edges against 45 in the source) | Never smooth or simplify the raw Meshy mesh. Weld it, then rebuild a clean mesh (step 3 below) |
| Waist folded, joints creased | Hips, spine and legs set by hand on an automatic rig | Body posture only from motion-captured poses; hand adjustments limited to shoulder, elbow, wrist and neck, within natural ranges |
| Palms up, hands distorted | The rig has no finger bones and a broken hand-bone axis | Hands placed from the mesh's own palm, and fingers kept as generated. If a pose still needs different fingers, it is generated directly in that pose (step 2 fallback) |
| Feet floating 10 cm | Seated by the lowest mesh point, where the skinned buttocks sag | Seated by the hip joints, 10 cm above the seat |
| Thighs through the seat rail, jacket through the backrest | Thighs sloping down; seated too far back | Contact checks against every chair model in `check-assets` |
| Head looking down | The recorded pose | Neck levelled; head turns vary per guest |

**Pipeline** (all scripted in `tools/`, outputs reproducible):

1. **Characters.**
   - Meshy text-to-3D (realistic, A-pose, symmetric).
   - The man exists already; the woman is new.
   - Prompts follow `REFERENCE_NOTES.md` §2, with smooth pressed matte fabric and the minimal face.
   - The owner approves each unposed character's turntable before any posing.
2. **Poses.**
   - Meshy auto-rig, plus motion-captured clips from Meshy's animation library frozen at one frame: Chair Sit Idle (male and female), Stand and Chat, Stand and Drink, idles.
   - Small arm and neck adjustments for hands on the table.
   - **Fallback** when a pose cannot pass the gate: Meshy image-to-3D from a generated image of the pose. The figure is then built in pose, with no rig at all.
3. **Clean rebuild in Blender.**
   - Weld seams.
   - Take the posed full mesh and rebuild it as a clean closed mesh at each detail level, with new UVs.
   - Bake its colour (plus normals on the detailed version) into one shared people texture atlas.
4. **Fit.**
   - Hip joints over the seat, feet on the floor, hands on the table top.
   - Checked against the actual chair and table models.

**Variety without cost:**

- 2 bodies × 4 poses = 8 meshes.
- Mirrored copies.
- Per-guest colours from masks: 5 outfit colours, 5 skin tones, 4 hair colours.
- Varied head turns on seated figures (small neck bones only; still static).
- One material and one texture for all people.

**People budget** (the PPL-03 scene: 150 guests; a hard cap, not a target):

| | Desktop | Phone |
|---|---|---|
| Per figure | Detailed ≤ 8k triangles (eye level, Sit here, Photo mode; nearest 12 guests only); medium ≤ 2k; simple ≤ 600 | Medium only for the nearest 12 at eye level and in Sit here; else simple ≤ 600 |
| All people | ≤ 400k triangles | ≤ 100k triangles |
| Draw calls, all people | ≤ 16 (one instanced mesh per pose and detail level) | ≤ 8 |
| Texture | One 1K atlas (KTX2) | One 512 atlas |
| Download | ≤ 3 MB, loaded after the room | ≤ 1.5 MB, loaded after the room |
| Runtime | No skinning, no animation, no per-guest materials. Real shadows from people only on High; painted contact shadows elsewhere | Same, no real shadows |

**Validation:**

- **Automated, every figure (`check-assets`):**
  - Closed mesh: 0 open or non-manifold edges after the rebuild.
  - No zero-area faces or flipped normals; triangles and texture within the budget above.
  - Feet within ±2 cm of the floor.
  - Seated: hip joints over the seat; no intersection deeper than 1 cm with any chair outside the seat cushion; none with the table.
  - Hands within 1 cm of the table top.
- **Close-up review:** front, side, three-quarter and back renders plus a hands close-up, next to the unposed character, for every pose; the owner approves before integration.
- **In the app:**
  - Budget test with 75 and with 150 guests per tier.
  - PPL-01 and PPL-02 tests unchanged.
  - Visual baselines.
  - `fidelity-reviewer` against the people reference.
  - `ux-reviewer` on the overview see-through rule.
- **Devices:** the PPL-03 scene on the iPhone 16 and Galaxy S24 meets the frame-rate target; a regression of more than 10% from V6 is fixed or V7 is reverted.

**Fallback:** if V7 cannot pass its gate by 2026-11-07, today's simple figures stay. The result is consistent, just plainer.

## Validation (every stage)

1. **Automated (pre-commit and CI):**
   - Typecheck, lint, unit tests.
   - e2e on desktop 1440×900 and phone 390×844.
   - Visual baselines for the High and Battery saver tiers.
   - Budget test on the benchmark scenes per tier: draw calls, triangles, GPU memory estimate, download.
   - The idle-frame and no-recompile tests (from V0).
   - `check-assets` on every model and texture (from V0).
   - The stale-bake check (from V2).
   - Test titles carry the requirement IDs.
2. **Shots:** the two benchmark cameras plus the six baseline shots (dollhouse day, dollhouse evening, R01, R03, R09, Sit here), before and after, side by side, at desktop and phone sizes.
3. **Reviewers:**
   - `fidelity-reviewer` for venue changes.
   - `ux-reviewer` for anything visible, with the finish checklist.
   - `spec-reviewer` before the pull request is marked ready.
4. **Devices:**
   - The owner reads `?perf` on the laptop, iPhone 16 and Galaxy S24 at each gate.
   - A stage that misses a target, or regresses frame rate by more than 10%, is fixed before merge or reverted, not shipped.
5. **Owner:** approval on the Vercel preview, then merge.

## Schedule and cut line

Estimates, from 2026-10-18 to the last visual merge on 2026-11-07, including owner review:

| Stage | Window | Latest start |
|---|---|---|
| V0 | 10-19 → 10-21 | 10-19 |
| V1 | 10-21 → 10-24 | 10-22 |
| V2 | 10-24 → 10-28 | 10-25 |
| V3 | 10-28 → 10-30 | cut if V2 ends after 10-29 |
| V4 | 10-29 → 11-01 | 10-30 |
| V5 | 11-01 → 11-04 | 11-01 |
| V6 | only if ahead | — |
| V7 | 11-03 → 11-07 | 11-03 |

Eight stages in twenty days is tight. When a stage runs late, V6 is cut first, then V3, so that V7 keeps its window. All people work, including generating the woman, happens in V7 (owner, 2026-10-18).

## Starting a stage

- **Read first:** this file, `docs/visual/REFERENCE_NOTES.md`, then the stage's spec rows.
- **Prototype branch:** `proto/visual-poc` (never merged) holds:
  - the proof-of-concept scene code behind `?poc&baked`
  - the Blender, bake, capture and Meshy scripts, with `tools/visual-poc/README.md` on how to run them
  - the Meshy man (rigged source, prompts, task ids: `tools/visual-poc/meshy/TASKS.md`)

  V0 brings the scripts over into `tools/`. Its scene code is a reference, not a base: rebuild to the layer rules.
- **Environment:**
  - Blender runs headless: `python -m venv venv && venv/bin/pip install bpy numpy`; `blender.org` is allowed.
  - The Meshy API key is injected by the session proxy; `docs.meshy.ai` is blocked.
  - Capture scripts need `vite preview` on port 4173 and Chromium at `/opt/pw-browsers/chromium`.

## Proof-of-concept findings (2026-10-17 and 2026-10-18)

What worked, what failed, and what to carry into the stages:

- **Light map (V2):**
  - three.js `lightMap` on UV channel 1.
  - An HDR light map loaded with RGBELoader needs `flipY = false`; with the default the light lands mirrored, which showed as a dark wedge on the walls.
  - Values that read well in the evening shot: light-map intensity ~2.2, emissive capped at 0.9, room reflection intensity 0.35, hemisphere 0.06.
  - Room exported from the app (GLTFExporter) and baked with Blender's `lightmap_pack` (it rejects `PREF_IMG_PX_SIZE`). A 2048 HDR was 11 MB: it must be encoded down (V2 targets).
- **Blender:** `import bpy` must come before `import bmesh`.
- **Detail baking (V4, V5):**
  - Colour and ambient-occlusion bakes from full to simple models worked.
  - The normal-map bake came out empty and is still to be fixed in the pipeline.
- **Chairs (V4):**
  - Automatic simplification mangled the chair.
  - A purpose-built simple chair (2,340 triangles) with baked detail looked right.
- **Linens (V4):** cloth simulation frayed and pooled at the hem; the procedural drape (rounded corners, 3 cm floating hem) looked right.
- **Flowers (V5):** a modelled rose arrangement was 42k triangles; cards are required.
- **People (V7):** see the People plan table; the posing and fitting scripts (`meshy_pose.py`, `mesh_audit.py`, `clash.py`) are the starting point.

## Graphics tiers

**Auto** is the default. It:

- starts at High on desktop and Balanced on phone
- steps down after ~2 s of slow frames
- steps up only after a sustained good run
- remembers the tier per device
- changes tier only while the view is still

A manual choice (Auto, High, Balanced, Battery saver; Battery saver on phone only) sits in the settings.

| Lever | High | Balanced | Battery saver (phone) |
|---|---|---|---|
| Resolution | up to 2× | 2× still, ~1.25× while moving | 1.25× |
| Frame cap | 60 fps | 60 fps | 30 fps |
| Room light map | 2K | 2K desktop, 1K phone | 1K |
| Ambient occlusion | live | in the still refine frame only | none (baked in the room; painted contact shadows) |
| Bloom | on | on, lower resolution | off (glow sprites) |
| Shadows (movables) | soft 2048, drawn once | 1024, drawn once | none (painted contact shadows) |
| Reflection capture | on | on, lower resolution | static |
| Textures | 2K | 1K | 1K |
| Décor and people detail | detailed at eye level | detailed in Sit here only | simple |

Rules:

- **Rendering:** render only when something changes, in every tier. Nothing animates while idle (no candle flicker).
- **Moving and still:** while moving, resolution drops slightly; one full-quality frame renders when the view stops.
- **Tiers trim polish only:** the look is cheap by design. Auto cuts in this order: ambient occlusion, resolution, bloom, shadows; never lighting mood or models.

## Targets (definition of done)

| Target | Value | Measured |
|---|---|---|
| Frame rate (Auto) | desktop 60 fps; iPhone 16 and Galaxy S24 steady 60 fps orbiting and dragging, never below 30 | Owner's devices, `?perf` |
| Single freeze during a gesture | ≤ 50 ms | Owner's devices |
| View switch, lighting switch or menu open | scene freeze < 100 ms; no shader recompile | CI (recompiles), devices (freeze) |
| Frames rendered while idle | 0 | CI |
| iPhone after backgrounding | no lost 3D view | Owner's iPhone |
| Draw calls, triangles, download | within `ARCHITECTURE.md` §7 per tier; people within the people budget; phone draw calls revisited in V0 | CI |
| GPU memory | budget set in V0 from measurement | CI (estimate) |
| Light maps | ≤ 3 MB desktop (both sets), ≤ 1.5 MB phone, loaded after the room appears | CI |
| First meaningful paint | as §7; room appears with simple shapes first, detailed ones swap in | CI |
| Models | `check-assets` passes; no visible tear, fold, gap or intersection in the close-up review | CI, review |

CI checks counts and pictures; software rendering makes frame rate meaningless there. Motion is off in tests and under reduced motion.

## Stopping criteria

Stop the visual track when any of these holds:

- the owner cannot point to a placeholder-looking element in the benchmark shots
- the next gain needs a new technique (path tracing, real-time bounce light, runtime animation)
- a stage misses the performance targets
- remaining feedback is venue detail rather than finish
- the date is 2026-11-07

## Not built

- **Rendering techniques:** path-traced stills; real-time bounce light; screen-space reflections while editing; point-light shadows; light shafts.
- **Simulation and glass:** cloth simulation (the drape is procedural); transparent-glass refraction.
- **People:** runtime skinning or animation (poses are baked into static meshes); detailed faces.
- **Minor fixtures:** projector bodies, track spot heads, skylight detail, speakers, alarms, thermostats.
- **Copyright and scope:** exact paintings (copyright; stand-ins gain frame depth only); terrace geometry.
- **In the app:** in-app image-to-3D. Meshy is a tool Claude uses offline, never part of the app.

## Decisions

- **Tiers and baking:** Tiers A (real-time polish) and B (detail and materials) approved (owner, 2026-10-16). Tier C's baking is replaced by the hybrid bake (owner, 2026-10-17); path-traced stills stay out.
- **Hybrid bake** (owner, 2026-10-17):
  - The fixed room is baked: evening and daylight.
  - Movables stay live.
  - Claude re-bakes with any fixed-room change.
  - A stale bake is blocked by CI and falls back to live lighting at load.
  - Proven in the proof of concept (evening).
- **Defaults and purpose:**
  - Evening is the default; daylight kept.
  - The 3D is for deciding décor and seeing it realistically (owner, 2026-10-17). Table décor (V5) and Photo mode are first-class, and colour accuracy under evening light is a gate.
- **Plan v3** (owner, 2026-10-18):
  - Staged end to end with validation per stage.
  - People are the last stage.
  - Every model must meet the asset quality bar (low-poly allowed, never broken).
  - People are capped by the people budget.
- **Visual targets:**
  - The isometric sample is the finish reference, accepting a live render (owner, 2026-10-17).
  - The two prototype pictures are the minimum bar (owner, 2026-10-16).
  - Light wall caps and the plinth are accepted; `DESIGN_GUIDE.md` §9 is updated in V1.
- **Back bar** uplifted to the grandeur of the reference photos (owner, 2026-10-16).
- **Guest figures** (owner, 2026-10-16, revised 2026-10-18):
  - Stylised, slim, minimal face kept.
  - Men in suits, women in dresses, a few outfit colours and a range of skin tones per guest.
  - Generated with Meshy (owner's Pro API), posed from motion capture, rebuilt clean in Blender (People plan).
  - The `DESIGN_GUIDE.md` §9 people rule changes when built.
- **Bar flowers:** exactly two, always present, movable along the bar top only; big glass vases with tall white blossom branches as in R02. New behaviour: spec row and scenario migration when built.
- **Table-number stand:** realistic size (≈ 20–25 cm brass stand, large card) with the digits printed; no floating badges.
- **Tools:**
  - Blender (5.2, headless) for asset authoring, detail baking and the room light bake.
  - Meshy for people and, on request, organic décor.
  - Both run by Claude offline from committed scripts.
  - Meshy-generated models may be committed to this repository (owner accepts Meshy's terms, 2026-10-18).
- **Kitchen wall:** no EXIT door or banquettes for now (owner, 2026-10-18).
- **Graphics setting:** Auto, High, Balanced and Battery saver; Battery saver on phone only (owner, 2026-10-16; confirmed 2026-10-17). Mock-up approved and built (owner, 2026-10-18).
- **Order of work** (owner, 2026-10-18): V0 merged first; V1 and V2 one PR each, then stop for owner approval; no Meshy spend before the owner approves V7's start.
- **Test devices:** iPhone 16 and Samsung Galaxy S24 (owner, 2026-10-17).
- **Gold cordless table lamp** added to the library; the R07 opening is the restroom corridor (owner, 2026-10-17).

## Open items

- **Meshy credits:** 989 left. Planned: people ≈ 150 (the woman, rigs, about 10 poses at 3 credits each, retries); décor through library requests at ~30 each when the owner asks; ≥ 300 kept in reserve.
- **People reference image:** the owner attaches it to a custom request in the app ("Guest figures"), so it stays private and Claude can read it with the requests token.
- **New spec rows and budgets when built:**
  - Spec rows: bar flowers (VEN) and Photo mode (EXP) (the graphics setting is PLT-05).
  - `ARCHITECTURE.md` §7 rows: GPU memory, view-switch freeze, idle frames, light maps, people.
- **V0 gate (owner):** open `?perf&bench=sample` and `?perf&bench=ppl03` on the laptop, iPhone 16 and Galaxy S24, orbit and drag at the dollhouse and eye-level cameras, press Copy and paste the numbers back; decide the phone draw-call budget for Balanced's still frame (≈ 155 against 150); set the GPU memory budget from the readings.
