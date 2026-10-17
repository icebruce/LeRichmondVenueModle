# Richmond Studio — Visual Upgrade Status

**Current stage:** Plan revised and approved (owner, 2026-10-17); V0 next. Supersedes PR #7, whose prototype (step P) set the visual target. Freeze ~2026-11-10; no visual merges after 2026-11-07, fixes only.
**Scope:** look and performance only. Behaviour stays as in `PRODUCT_SPEC.md`; the owner validates functionality separately. Main plan: `PROJECT_STATUS.md`. Reference analysis (finish, people, venue details, evening calibration): `docs/visual/REFERENCE_NOTES.md`.

## Goal

A premium, polished room for deciding décor and seeing it realistically — closer to the owner's isometric sample and to the reference photos — with no lag on a laptop, an iPhone 16 or a Galaxy S24. Best visible return per cost: big, frequently seen surfaces and pieces first; nothing that cannot be seen at room scale.

## Lighting approach (decided)

Live lighting stays (ADR-2), made cheap and soft by design:

- **Evening light hierarchy** tuned side by side against the venue's own evening photos (R06, R08, R11, U02, UV01), not by taste.
- **Painted, not computed:** light pools under chandeliers and on the bar top, warm uplight on the brick piers, soft darkening where walls meet the floor, contact shadows under tables, chairs and people. Same on every device.
- **One shadow-casting light**, its shadow drawn only when the scene changes.
- **One captured reflection of the room**, refreshed only after changes, for the glass walls, marble, brass and glossy tiles.
- **Photo mode** (V6) for realistic stills: same look, rendered larger with full-quality shading and shadows, overlays hidden, in 1–3 s.

Postponed (Tier C), with reasons:

- **Baked lighting.** The generated venue still changes (each change means re-baking); the dollhouse cutaway hides walls and ceiling the bake assumed; nothing movable (tables, linens, candles, placed lights) is in it, so décor gains nothing; evening and daylight need two bakes.
- **Path-traced stills.** Slow and grainy with many small light sources (the candlelit evening is its worst case); it ignores or double-counts the editor's painted light, glows and see-through figures, so the still would not match the room as designed; two new dependencies.

## Geometry rule

Real polygons only where a silhouette is seen in the benchmark views; everything else is a texture or not built. Under ~20 px on the phone at the default views → texture or skip. Blender bakes detail from high-poly models into normal maps for simple meshes; see-through cut-out cards for railings, leaves, petals and bottle rows (one shared texture sheet per family); instancing for repeated pieces; detailed versions only at eye level, in Sit here and in Photo mode.

## Steps

Each step ships on its own; stopping after any step leaves a consistent result. **Cut line:** V0–V2 must; V4–V5 should; V3 and V6 if time allows.

| Step | Delivers | Gate | State |
|---|---|---|---|
| P | Full-plan prototype (discarded): two reference pictures, `docs/visual/target-overview-evening.webp` and `docs/visual/target-eye-level-evening.webp` | Owner accepts the pictures as the visual target | Done (2026-10-16) |
| V0 | Performance and measurement: render only when something changes; static shadows drawn once; constant light count (switching views or lighting must not recompile shaders — likely cause of the view-switch and menu lag); merge static venue meshes by material; compare view on the Balanced tier; Auto quality monitor; hidden `?perf` overlay (median and slow-frame times, longest frame, draw calls, tier; Copy button); eye-level benchmark camera; baseline numbers in CI and on the owner's devices; confirm Blender runs headless in the cloud environment | Targets below met on the owner's devices; phone draw-call budget revisited from measurement | Not started |
| V1 | Light and presentation: evening light hierarchy calibrated against R06/R08/R11/U02/UV01 (camera presets matching R08 and U02); lower fill, walls fading into the dark above head height, painted light pools, warm uplight washes on the brick piers; soft darkening at wall–floor and wall–wall joins; contact shadows under tables, chairs and people; room reflection capture; tone and white balance (calmer warm whites); bevelled edges; light wall caps, a plinth under the room and the room's soft shadow on a gradient backdrop; narrower-lens A/B for the dollhouse default; open fidelity fixes (LED treads glow lime-yellow across each tread top, mezzanine fascia projecting ≈ 0.6 m, kitchen pass less bright, the restroom corridor opening in the north wall from R07 — its clearance check then applies like the other openings); compressed textures with a 1K phone set; graphics tiers + setting | Owner approves look on the preview | Not started |
| V2 | Room surfaces at real-world scale (CC0, Poly Haven): slate floor tiles (`large_floor_tiles_02`, 0.65 m tiles, per-tile tone, wood joint strips), dark hardwood (`old_wood_floor`), buff brick (`yellow_brick`) with soft patch variation, red-brick dado (`red_brick`); garage-door frames, pier bands, green panelled wall; ceiling at eye level (bevelled beams and girders, rivets as surface texture, black conduit and track runs as thin lines, warm glow on the planks above each chandelier); north-wall tufted nail-head banquettes (moved from V6); fabric sheen and weave for linens and velvet; sheer curtains behind the east velvet | Fidelity review vs R01/R02/R03/R04/R06/R10 | Not started |
| V3 | Bar: thick marble slab with real veining and eased edge, panelled black base, foot rail; the two bar flowers. Back bar with the grandeur of R02/R03/R14: 5–6 shelf rows up to the canopy, each with a lit strip; front row of real bottles in four shapes (wine, square spirit, tall gin, round liqueur), rows behind as backlit bottle cards in amber, green and clear with gaps and rows of glasses; antique-mirror back panel brighter at the top of each bay; thick bevelled wood frame with brass trim and crown moulding; steel canopy with downlights and soft pools on the rear counter; lit glass-door fridges, chrome espresso machine, brighter round red neon sign; on the canopy: small plants, dried grasses in vases, string instruments on the brick above (cards); wine wall bottles as cards | Fidelity review vs R02/R03/R11/R14/R15 | Not started |
| V4 | Linens, chairs and guests: procedural drape for any table size (eased top edge, folds deepening toward the hem, gathered at corners), runners the same way; chair-gap rule so tucked chairs never pierce floor-length cloth; venue oval-back chair from Blender (weathered oak, grey velvet), other chair styles; guest figures from Blender (see Decisions and `REFERENCE_NOTES.md` §2) | Fidelity review vs R04/R09/R10; owner approves figures against the people reference | Not started |
| V5 | Table décor: flowers as cupped bloom shapes and folded leaf blades from one texture sheet, with a warm petal glow so they keep their colour at night; candles (teardrop flames, warm pool on the cloth, reflective glass); table-number stand with the card printed from one shared texture sheet; tableware (turned plates and chargers, stemmed goblets, folded napkins); colour check — white, ivory and champagne linens and the flower palette stay distinguishable under evening light (vs R08, R12–R14); detailed versions at eye level, in Sit here and in Photo mode; library thumbnails re-rendered | Budget test with heaviest décor on every table; colour check passed | Not started |
| V6 | Remaining fixtures and sharing: ornate iron scroll railings as cut-out panels (stair, raised floor, mezzanine; R09, R11), east curtains (deep pleats, sheen), plants (fiddle-leaf figs by the green wall and the west garage door, planters on the east window sills), terrace string-light canopy through the garage doors at night (R11, R16), chandelier polish; Photo mode | Owner approves on the preview | Not started |

**Acceptance reference:** the two prototype pictures in `docs/visual/` (evening, with guests, overlays hidden). The finished steps should look at least this good from the same cameras (dollhouse default; eye level across the west tables toward the bar: position [2.0, 1.6, 9.8], target [7.2, 1.5, 2.2], fov 60). The pictures predate the 4B/4G venue revisions, the back-bar uplift and the dressed figures, which should improve on them.

**Benchmark scene:** the venue sample plan with the heaviest décor on every table and 75 guests, from the two cameras above, evening and daylight, desktop 1440×900 and phone 390×844.

**Every step:** before/after numbers for each tier; the benchmark shots and the six baseline shots (dollhouse day, dollhouse evening, R01, R03, R09, Sit here) side by side with the previous step; `ux-reviewer` and `fidelity-reviewer` (with the finish checklist in `REFERENCE_NOTES.md` §1); owner approval. A step that misses the performance targets is reverted, not shipped.

## Graphics tiers

**Auto** is the default: starts at High on desktop and Balanced on phone, steps down after ~2 s of slow frames, steps up only after a sustained good run, remembers the tier per device, and changes tier only while the view is still. A manual choice (Auto / High / Balanced / Battery saver; Battery saver on phone only) sits in the settings — a new UI pattern, mocked up for owner approval first.

| Lever | High | Balanced | Battery saver (phone) |
|---|---|---|---|
| Resolution | up to 2× | 2× still, ~1.25× while moving | 1.25× |
| Frame cap | 60 fps | 60 fps | 30 fps |
| Ambient occlusion | live | in the still refine frame only | none (painted-on contact shadows) |
| Bloom | on | on, lower resolution | off (glow sprites) |
| Shadows | soft 2048, drawn once | 1024, drawn once | none (painted-on contact shadows) |
| Reflection capture | on | on, lower resolution | static |
| Textures | 2K | 1K | 1K |
| Décor detail | detailed at eye level | detailed in Sit here only | simple |

Rules: render only when something changes, in every tier; nothing animates while idle (no candle flicker). While moving, resolution drops slightly; one full-quality frame renders when the view stops. The look is made cheap by design, so tiers only trim polish. Auto cuts in this order: ambient occlusion, resolution, bloom, shadows; never lighting mood or models.

## Targets (definition of done)

| Target | Value | Measured |
|---|---|---|
| Frame rate (Auto) | desktop 60 fps; iPhone 16 and Galaxy S24 steady 60 fps orbiting and dragging, never below 30 | Owner's devices, `?perf` |
| Single freeze during a gesture | ≤ 50 ms | Owner's devices |
| View switch, lighting switch or menu open | scene freeze < 100 ms; no shader recompile | CI (recompiles), devices (freeze) |
| Frames rendered while idle | 0 | CI |
| iPhone after backgrounding | no lost 3D view | Owner's iPhone |
| Draw calls, triangles, download | within `ARCHITECTURE.md` §7, per tier; phone draw calls revisited in V0 | CI |
| GPU memory | budget set in V0 from measurement | CI (estimate) |
| First meaningful paint | as §7; room appears with simple shapes first, detailed ones swap in | CI |

CI checks counts and pictures (software rendering makes frame rate meaningless there). Visual baselines for High and Battery saver; motion off in tests and under reduced motion.

## Stopping criteria

Stop the visual track when any holds: the owner cannot point to a placeholder-looking element in the benchmark shots; the next gain needs a new technique (baking, path tracing, real-time bounce light, a new asset pipeline); a step misses the performance targets; remaining feedback is venue detail rather than finish; 2026-11-07.

## Not built

Baked lighting and path-traced stills (above); real-time bounce light, screen-space reflections, point-light shadows, light shafts, depth of field while editing; cloth simulation; transparent-glass refraction; detailed faces or rigged figures; projector bodies, track spot heads, skylight detail, speakers, alarms, thermostats; exact paintings (copyright; stand-ins gain frame depth only); terrace geometry; in-app image-to-3D.

## Decisions

- Tiers A (real-time polish) and B (detail and materials) approved; Tier C (baked lighting, path-traced stills) postponed (owner, 2026-10-16; reasons recorded 2026-10-17).
- Evening is the default; daylight kept.
- The 3D is for deciding décor and seeing it realistically (owner, 2026-10-17): table décor (V5) and Photo mode are first-class, colour accuracy under evening light is a gate.
- Plan revised (owner, 2026-10-17): V0–V6 kept in scope and order, with the additions above (evening calibration, reflection capture, wall–floor darkening, ceiling at eye level, open fidelity fixes, banquettes in V2, colour check, Photo mode); bottles behind the front row are backlit cards.
- Prototype accepted as the visual target, including light wall caps and the plinth (owner, 2026-10-16); `DESIGN_GUIDE.md` §9 is updated in V1.
- Back bar uplifted to reflect the grandeur of the reference photos (owner, 2026-10-16).
- Guest figures (owner, 2026-10-16): faceless and stylized, slim proportions with simple hair, as in the owner's people reference (`REFERENCE_NOTES.md` §2; stock image, not committed). Men in suits, women in dresses, a few outfit colours and a range of skin tones, coloured per guest in the shader. Four base meshes (man and woman, seated and standing). Solid at eye level and in Sit here; light and see-through in the dollhouse overview. Simple version (~600 triangles) in the overview and on phones, detailed version only at eye level. `DESIGN_GUIDE.md` §9 people rule changes when built.
- Bar flowers: exactly two, always present, movable along the bar top only; big glass vases with tall white blossom branches as in R02, in the venue's own style. New behaviour: spec row and scenario migration when built.
- Table-number stand: realistic size (≈ 20–25 cm brass stand, large card) with the digits printed; readable at table distance. No floating badges.
- Blender is used for asset authoring and detail baking (chairs, guest figures, drape corners, railing and bottle cards), never for lighting; the Blender Python scripts are committed so assets are reproducible. Blender 5.2 runs headless from its Python module (`pip install bpy`), checked in V0.
- Graphics setting with Auto / High / Balanced / Battery saver; Battery saver on phone only (owner, 2026-10-16; confirmed 2026-10-17).
- Test devices: iPhone 16 and Samsung Galaxy S24 (owner, 2026-10-17).

## Open items

- People reference image: the owner attaches it to a custom request in the app ("Guest figures") so it stays private and Claude can read it with the requests token when V4 starts.
- New spec rows when built: bar flowers (VEN), graphics setting and Photo mode (PLT, EXP). New budget rows in `ARCHITECTURE.md` §7: GPU memory, view-switch freeze, idle frames.
- `ARCHITECTURE.md` §5 describes three tiers and a frame-time monitor that do not exist yet (code has two tiers chosen once); corrected in V0.
