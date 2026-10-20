# Richmond Studio — Visual Upgrade Status

**Current stage:** V0 (#16), V1 (#17), V2 (#18), V3 (#19) and V2b (#20) merged; the owner asked for V3 to V6, one PR each, stopping before V7. V4 (linens and chairs) merged (#21). V5 in progress: Photo mode mock-up approved (owner, 2026-10-20); Meshy for all eight flower types and the six plants (owner, 2026-10-20). Plan v3 approved (owner, 2026-10-18): end-to-end implementation in eight stages, people last. The proofs of concept are done and closed (branch `proto/visual-poc`, never merged; it holds the scripts that V0 brings over). Freeze ~2026-11-10; no visual merges after 2026-11-07, fixes only.
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
| V0 | Performance foundation, measurement, asset pipeline and checks | Must | Merged (PR #16); owner: device readings |
| V1 | Room model and surfaces | Must | Merged (PR #17) |
| V2 | Light: hybrid bake, evening calibration, grounding | Must | Merged (PR #18), approved by the owner |
| V3 | Bar and back bar | Should | Merged (PR #19) |
| V4 | Linens and chairs | Must | Merged (PR #21) |
| V5 | Table décor and Photo mode | Must | In progress |
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
- Lever differences from the table, decided in the build: bloom keeps one resolution in every tier, and bloom strength and vignette follow the device as before; the effect chain (multisampling, ambient occlusion at half resolution) follows the device, not the tier: making either follow the tier (V2b, so the setting would show on a still picture) rebuilt the chain at a tier change and compiled its passes again at the next camera change ([PLT-03]); the tiers differ in motion, resolution and live ambient occlusion, and corners are baked for all; "Décor and people detail" follows the device (phones load the lighter models, PLT-03), since Auto never changes models. Light maps, textures and the reflection capture levers come with V1 and V2.
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

**Built (2026-10-18):**

- Surfaces as WebP (`npm run assets:textures`; first KTX2, whose decoder the site's CSP blocks: owner chose WebP and a strict CSP, 2026-10-18): slate tiles `large_floor_tiles_02` at 0.65 m with a tone per tile and 8 cm grey-tan wood joint strips; dark hardwood `old_wood_floor`; buff brick `yellow_brick` with soft patches (its colour correction baked into the file); red brick `red_brick` for the dado and the whole west wall; ceiling `roof_planks`. 2K colour maps for the four big surfaces on desktops, 1K otherwise and on phones. Initial download, served uncompressed: ≈ 5.8 MB desktop, ≈ 3.5 MB phone (CI, under the 12 and 6 MB budgets).
- Fidelity fixes: the restroom corridor (R07) at x 4.5–5.45 in the north wall, green inside with a framed photo, checked for clearance like the other openings, the north banquette ending at x 4.35; the mezzanine edge overhangs 0.6 m from its west end to x 12.28 (the foot of the first flight), then steps back so the stairwell stays open (R01, R09); lime-yellow glow across each tread top, evening only; a dimmer kitchen pass.
- From the fidelity review: R01 camera moved onto the second flight ([15.4, 3.6, 12.4] → [8, 1.2, 5.5]), the steel girder to z 6.4 clear of the skylight, the north dado to 1.3 m, the green wall flat with one ledge, sheers lighter.
- Room details: steel jambs and headers on the garage doors, bevelled beams, girders, caps, bar top and plinth, rivets on the girders, conduit and lighting track, nail-head trim on the banquettes, sheers behind the east velvet.
- Presentation: light bevelled wall caps, a light plinth with a soft contact shadow, a dithered gradient backdrop (brightened in daylight so it reads high-key after tone mapping); the overview fit includes the plinth. `?lens=narrow` shows the dollhouse at 20° for the owner's A/B (ux and fidelity reviewers both recommend 20°); the overview may now pull back to 220 m, with the depth range following the distance.
- Not done in V1: GPU texture memory against a budget (set at the V0 gate from the device readings); garage doors with 8–9 pane columns and arched black headboards on the banquettes (fidelity, minor).

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

**Built (2026-10-18):**

- `npm run bake` (`tools/README.md`): the app exports the fixed room (`?bake-export`), Blender bakes evening and daylight (Cycles diffuse, direct and bounced, 128 samples, 7 to 11 minutes a set on 4 cores), the tool checks the result and writes lossless WebP maps, plus `data/bake/manifest.json`.
- Light-map UVs come from the app (`scene/venue/lightmap.ts`): flat islands packed at about 42 texels a metre at 2K, the same at export and at load; the dollhouse's cut walls reuse the full walls' bake.
- Receivers: the walls' faces toward the room (their backs, ends and tops stay live-lit, so cut walls and wall tops never go dark), floors (the joint strips take the tiles' light), ceiling deck and beams, mezzanine edge. Their diffuse light comes from the map and a little of the live sky; live highlights and reflections stay. The stair, bar, fixtures, everything movable and every placed light stay live.
- Evening lights in the bake: chandeliers, pendant drums, six track spots scalloping the north brick, the back bar (its glow brighter than the brick, as in R01, R03, R08), warm uplights on the east piers between the street windows. Daylight: a warm sky through the glass and a low sun from the terrace. Exposure per set (`useBake.ts`: evening 0.3, daylight 2.6), the first calibration.
- Grounding: soft contact shadows under tables, chairs and standing guests (one instanced draw each); the bake itself darkens corners and wall feet and pools light under the chandeliers.
- Calmer evening live light, so white, ivory and champagne linen stay distinct (colour check: white reads light ivory-white, not beige).
- `[LGT-03]`: CI fails when the manifest's fingerprints (room surfaces, light inputs, bake script) do not match; at load a mismatch draws the live-lit room (`?bake=stale` shows it).
- Reviews: `ux-reviewer` (1 blocker, 4 majors) and `fidelity-reviewer` (black wall tops and cut-wall faces, brick outshining the back bar, cold daylight) all addressed and re-baked; the colour check passes on the cloth drops.
- Owner changes folded into V2 (2026-10-18), re-baked: the dollhouse lens is 20° (the `?lens=narrow` A/B is gone); the garage-door (west) wall has a red-brick dado under buff brick like the back-bar wall; the back bar stands 0.9 m off the north wall with a passage behind it (closed at its east end by the wine wall), the bar island's back end moving inland with it (front unchanged); the restroom corridor door sits half behind the back bar's west end (x 5.2–6.15). Also fixed: the back-bar bottles, hidden since V0 by the static merge (instanced meshes are now drawn outside it).
- Not done in V2: the box-projected reflection capture and an HDR daylight environment (the light-former environment stays; neither review asked for them); calibration camera presets matching R08 and U02 (U02 is not in the local cache). The fixed bar, back bar and stair are in the bake as occluders, so their floor shadows are baked.

### V2b: Light rework (owner, 2026-10-19)

**Why:** the owner found the V2 evening flat: uniform light brick, no warm bounce, missing bar shadows and ambient occlusion, a night tone unlike R06/R08, and a graphics setting that showed no difference.

**Built:**

- Baked surfaces keep 8 % of the sky light (was 35 %, a uniform fill that flattened the bake's falloff) and 35 % of the live lights' direct light (was none), so live shadows and the couple's placed lights show on the floor and walls.
- ACES filmic tone mapping (AgX greyed the warm light); evening exposure 0.24, daylight 2.3.
- Evening bake at about 2400 K, crisper chandelier shadows (smaller sources), narrower and brighter track scallops on the north brick, brighter pier uplights, a darker night sky; the buff brick takes a warm tint in the evening (`BRICK_TINT`).
- The evening key light from nearly overhead, so the bar and tables cast their shadows straight down; soft contact shadows under the bar and back counter, in the existing instanced draw.
- Ambient occlusion stronger and tighter (radius 0.55 m). Multisampling and full-resolution ambient occlusion per tier were tried and dropped: a tier change then compiled shaders at the next camera change ([PLT-03]).
- Calibrated after a `fidelity-reviewer` round against R06, R08, R11, R16 and R01–R03: the bake at about 2700 K and a lighter evening brick tint, so the buff brick reads amber and the red dado stays distinct; evening exposure 0.19 with dimmer chandeliers, 25 % live share and a 0.45 hemisphere, for a darker floor; track spots at 220 W, 22°, aimed lower, for separate pools on the north brick; neutral-warm live light and halved fills, so white linen reads white; the street dark through the glass at night; daylight exposure 3.4 with a brighter sky; darker floor joints. The terrace backdrop is bright by day, dark at night (owner, 2026-10-19).
- Owner's second review (2026-10-19, after V3): the room a bit bright, wanting more of R06/R08's orange-yellow; corners and the feet of the bar, back bar and raised floor too sharp. Ambient occlusion within 80 cm (ao^2.2, so a junction reads a fifth as bright or less) is baked into the light maps (walls meeting floor and ceiling, corners, the floor at the feet of the fixed furniture, the raised floor's edges), on every tier; the bar, back bar, counter, banquettes, stair and rails darken over their lowest 35 cm (to half their colour at the floor). The evening bake at about 2400 K, a more amber brick tint and live light, evening exposure 0.16.
- Owner's third review (2026-10-19, on #20): walls good, but nothing on the floor touched it: the floor's live light and reflections were not occluded, so the glossy tile shone evenly up to the bar, platform and walls, and tables looked afloat. The baked occlusion now also ships alone (one 1K grey map for both sets, keeping the light maps within their 3 MB) and dims the live light, highlights and reflections on every baked surface; tables, chairs and the DJ booth cast contact shadows that follow their outline (dark at the edge, fading over 30 cm, 12 cm for chairs) in one mesh, replacing the size-scaled soft squares and the bar's contact squares.
- Occlusion audit (owner 2026-10-19: items 1 to 6 and the décor, in #20): the fixed furniture joins the bake as light-mapped surfaces (the stair's treads, landings and closed sides; the raised floor's step; the bar's base and well; the back bar's cabinet, counter, frame and shelves; the banquettes; the wine case; the reveals of every opening), so its own creases and the floor's take baked light and occlusion on every tier (light map 36.5 texels a metre, was 42); their floor-darkening shader gives way to the bake. Décor standing on a table or the floor (plates, glasses, candles, vases, pieces) casts a small outline contact shadow in the same mesh as the tables'. Metal, glass, trim and the stair's LED treads stay live-lit.
- Budget: ppl03 Balanced stays at 149 draw calls (≤ 150).
- Not done: the ceiling still reads a little red by day (the review suggests a lighter beam colour; left for a later bake).

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

**Built (2026-10-18):**

- Owner's heights from the V2 review: dado 1.2 m (north and west), banquette backs 1.45 m, restroom corridor head 2.1 m, the horseman painting portrait (1.45 × 2.0 m) over the banquettes.
- Bar: one U-shaped 8 cm marble slab with an eased edge and a 12 cm overhang on the guest side, a black base with raised stiles and rails framing panels, a round black foot rail on brackets; inside, a stainless working ledge and a dark mat.
- Bar flowers (VEN-06, schema v6): two tall slim glass vases of white blossom on the bar top, one on the west side near the front, one along the front (R02). Room › Bar flowers shows or hides them and slides each along the bar; the readout names the side in room words (garage-door side, front, raised side) with its distance; the vases keep 15 cm off the ends and 30 cm apart; opening the page frames the bar; one undo step per vase. Not done: moving a vase by dragging it in the room.
- Back bar (R02, R03, R14): four wide dark-wood bays with plain posts, a stepped crown with a brass line; four wood shelves 0.40 m apart above a clear zone over the counter, each with a warm strip under its front edge; a front row of real bottles (two instanced shapes, every bottle clear of the shelf above), backlit bottle and glass cards behind; an antique-mirror back panel; a brushed stainless canopy with downlights (in the bake too); dark glass-door fridges in stainless frames; a stainless counter top; a wide chrome espresso machine near the middle with cups on its warmer; ferns and dried branches in white pots at the canopy's front edge; violins and guitars hung tilted on the brick.
- Wine wall: a lit glass case of upright bottles on glass shelves, on its two faces toward the room, with crates at its foot. One card sheet (`backBarAtlas`) serves every card; cut-out cards stay out of the bake.
- A stored R02 camera (the main back-bar reference); the raised-floor railing no longer puts a post through the bar top.
- Reviews: `ux-reviewer` (7 majors) and `fidelity-reviewer` (bottles through shelves, back bar read as coolers, wine wall not a lit case, railing post, fridges, counter top, espresso, plants, slab seams) addressed.
- Not done: the neon stays the V1 ring (R02 shows a sunburst sign); Meshy models for the espresso machine, stools and flowers come with their stages.

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

**Built (2026-10-19):**

- **Linens:** every table wears a procedural drape (`scene/items/drape.ts`): an eased top edge, folds 4 cm deep at the hem round its line, a rectangle's corners crisp at the top and gathered round at the hem, a 3.5 cm flare; floor length stops 12 mm above the floor, lap length 0.30 m below the top, a rectangle's corners hanging in points to about 0.42 m, as a flat cloth's do (R04; owner, 2026-10-20). One geometry per table size, shared. Runner ends hang just outside the cloth's reach at their own hem (`domain/layout/cloth.ts`).
- **Chair-gap rule:** a tucked chair's front stays outside the cloth's furthest reach, for every chair style and table size (unit test).
- **Chairs (Meshy, approved 2026-10-19):** oval-back, cross-back and Chiavari, made with Meshy (about 3,000 triangles each; task ids in `tools/meshy/TASKS.md`) and prepared by `tools/blender/chair_from_meshy.py`: the remesher's topology kept (its few fins and pin holes do not show; refilling them made jagged patches), width and height fitted, the backrest placed where a seated guest's back rests, a grey detail map and a frame/seat mask, so each library entry tints frame and seat and every chair type is one draw call. About 320 KB each, uncompressed (the site's CSP has no `wasm-unsafe-eval` for meshopt). On desktops (High and Balanced), loaded with the room so no chair shader compiles on a later switch; phones keep the parametric chairs (corrected 2026-10-20: an earlier note said High only). The venue chair: grey-oak frame, grey velvet (R04).
- **Budgets:** High's triangle budget is 2.0 M (owner, 2026-10-19; was 1.5 M), for the Meshy chairs, flowers and chandeliers.

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

**In progress (2026-10-20):**

- **Photo mode (EXP-02):** built to the approved mock-up (owner, 2026-10-20; `docs/mockups/photo.html`, DESIGN_GUIDE §4 "Photo mode"): the camera button (P) and the phone camera menu's "Photo mode", Plans › "Save this view as an image"; a layer that hides the interface, pauses the selection and the edit shortcuts and gives both back on Close (Escape, back); Background blur (depth of field sharp at the tap or the centre, its sharp band a share of the focus distance so the dollhouse stays readable); the detailed blooms whatever the view; Save image at twice the window on desktops (2880 × 1800 from 1440 × 900), the screen's pixels up to 2048 px on phones, once more at screen size if that fails, with "Share" on phones that offer it; a footnote naming approximate imported items in view. Opening and closing it rebuilds the effect chain once (a compile, as for a new tier); on Battery saver the chain is mounted only while it is open. **Short of the mock-up:** phones save with their own shading (1K textures, no ambient occlusion, the simple chairs) rather than High's: building the desktop chain on a phone would compile for longer than the 3 s target; candles warm the cloth under them (the pools below) but light nothing else, in the room or the image. UX review of the built mode (2026-10-20): the focus ray skipped invisible pick boxes (in Walk nothing was sharp), a sharp band of at least 1 m, the toast placed from the bar's measured height, the footnote's label once and in its exact words, the hint and focus ring fade, focus returns to the camera button on Close, tokens for the footnote and ring.
- **Candles:** flames are teardrops (96 triangles, 36 on phones: no more than the spheres they replace); every flame on a table warms the cloth under it in the evening, a 0.26 m pool multiplied into the cloth (on a white cloth candlelight shows as warmth, not brightness), one draw call for all. ppl03 on Balanced is now at 149 of its 150 draw calls.
- **Blooms (Meshy, owner):** rose, peony, ranunculus, pampas plume, blossom cluster and a leaf sprig (every mound's leaves), 265–600 triangles each, tinted per arrangement (`public/assets/models/blooms/`, `tools/blender/bloom_from_meshy.py`, task ids in `tools/meshy/TASKS.md`). Drawn at eye level only (Walk, Sit here, low reference views; Photo mode when built); the dollhouse and plan keep the primitives, both meshes always mounted so a switch compiles nothing. Desktops only. Hydrangea and baby's breath keep their primitives (their models came out as shards and loose florets). The venue sample with a mound on every table: about 0.76–0.99 M triangles in one frame at eye level, against 0.63 M for the candle benchmark.
- **Plants (Meshy, owner):** all six, 4.7–8.3 k triangles, a 1K colour map, 0.5–0.9 MB each (`public/assets/models/plants/`, `tools/blender/plant_from_meshy.py`); desktops draw the model, phones the generator. A plant's model loads when it is first placed, a moment after it appears. The blossom tree's crown (2.1 m) is wider than its footprint (1.0 m); two pots came out beige, not stone grey.

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

- **Meshy credits:** 989 left. Owner (2026-10-19): Meshy approved before V7 for the three chair styles, flowers and plants, the chandeliers, and anything else that raises quality, each cleaned up in Blender to the asset rules; text prompts or the owner's own photos only (no third-party photos uploaded). Planned: people ≈ 150; ≥ 300 kept in reserve.
- **People reference image:** the owner attaches it to a custom request in the app ("Guest figures"), so it stays private and Claude can read it with the requests token.
- **New spec rows and budgets when built:**
  - Spec rows: bar flowers (VEN) and Photo mode (EXP) (the graphics setting is PLT-05).
  - `ARCHITECTURE.md` §7 rows: GPU memory, view-switch freeze, idle frames, light maps, people.
- **Decided (owner, 2026-10-18, after V2):** the fidelity review's heights apply (dado ≈ 1.2 m, banquette backs ≈ 1.45 m, corridor head ≈ 2.1 m, horseman painting portrait ≈ 1.45 × 2.0 m); the doorway and back bar stay where they are; the passage stays ≈ 0.9 m.
- **V0 gate (owner):** open `?perf&bench=sample` and `?perf&bench=ppl03` on the laptop, iPhone 16 and Galaxy S24, orbit and drag at the dollhouse and eye-level cameras, press Copy and paste the numbers back; decide the phone draw-call budget for Balanced's still frame (≈ 155 against 150); set the GPU memory budget from the readings.
