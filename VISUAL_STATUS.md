# Richmond Studio — Visual Upgrade Status

**Current stage:** Prototype done and accepted as the visual target (owner, 2026-10-16), with two changes folded into the plan: a grander back bar (V3) and dressed, faceless guest figures (V4). No further prototypes. The steps below start after step 3b merges and finish before the freeze (~2026-11-10).
**Scope:** look and performance only. Behaviour stays as in `PRODUCT_SPEC.md`; the owner validates functionality separately. Main plan: `PROJECT_STATUS.md`.

## Goal

A premium, polished room — closer to the owner's isometric sample and to the reference photos — with no lag on a laptop or on a two-year-old iPhone and Android phone. Best visible return per cost: big, frequently seen surfaces and pieces first; nothing that cannot be seen at room scale.

**Expectation:** live lighting stays (ADR-2). The result is clean, detailed and well shaded, not the soft bounced light of an offline render. Baked lighting and a path-traced still mode (Tier C) are postponed.

## Steps

Each step ships on its own; stopping after any step leaves a consistent result.

| Step | Delivers | Gate | State |
|---|---|---|---|
| P | Full-plan prototype (local branch `proto/visual-lookdev`, not merged): every V1–V6 visual at prototype quality; two reference pictures, `docs/visual/target-overview-evening.webp` and `docs/visual/target-eye-level-evening.webp` | Owner accepts the pictures as the visual target | Done (2026-10-16) |
| V0 | Performance: profile; fix the view-switch and menu lag; render only when something changes; merge static venue meshes by material; static shadows drawn once; Auto quality monitor; baseline shots and numbers | Targets below met on the owner's devices | Not started |
| V1 | Light and presentation: evening light hierarchy (lower fill, walls fading into the dark above head height, painted light pools under the chandeliers and on the bar top, warm uplight washes on the brick piers, darker edges); bevelled edges; painted-on contact shadows under tables and chairs; reflection environment; tone; light wall caps and a plinth under the room; compressed textures with a 1K phone set (required: the new textures add ~6 MB); graphics tiers + setting | Owner approves look on the preview | Not started |
| V2 | Room surfaces at real-world scale (CC0, Poly Haven): slate floor tiles (`large_floor_tiles_02`, 0.65 m tiles, per-tile tone, darker warm joints), dark hardwood (`old_wood_floor`), buff brick (`yellow_brick`) with soft patch variation, red-brick dado (`red_brick`); garage-door frames, pier bands, green panelled wall | Fidelity review vs R02/R03/R04 | Not started |
| V3 | Bar: thick marble slab with real veining and eased edge, panelled black base, foot rail; the two bar flowers. Back bar with the grandeur of R02/R03/R14: 5–6 shelf rows up to the canopy, each with a lit strip under it; backlit bottles in four shapes (wine, square spirit, tall gin, round liqueur) glowing in amber, green and clear, varied heights, gaps and rows of glasses; antique-mirror back panel brighter at the top of each bay; thick bevelled wood frame with brass trim and crown moulding; steel canopy with downlights and soft pools on the rear counter; lit glass-door fridges with bottles, chrome espresso machine, brighter round red neon sign; dried grasses in vases on the canopy (~6–8 extra draw calls) | Fidelity review vs R02/R03/R11/R14 | Not started |
| V4 | Linens, chairs and guests: procedural drape for any table size (eased top edge, folds deepening toward the hem, gathered at corners), runners the same way; chair-gap rule so tucked chairs never pierce floor-length cloth; venue oval-back chair from Blender (weathered oak, grey velvet), other chair styles; guest figures from Blender (see Decisions) | Fidelity review vs R04/R09/R10 | Not started |
| V5 | Table décor: flowers as cupped bloom shapes and folded leaf blades, with a warm petal glow so they keep their colour at night; candles (teardrop flames, GPU flicker, warm pool on the cloth, reflective glass); table-number stand with the card printed from one shared texture sheet (one draw call for all numbers); tableware (turned plates and chargers, stemmed goblets; folded napkins); detailed versions only in close views; library thumbnails re-rendered | Budget test with heaviest décor on every table | Not started |
| V6 | Remaining fixtures and sharing: ornate iron scroll railings (stair, raised floor), east curtains (deep pleats, sheen), plants (fiddle-leaf fig by the green wall, pot by the garage door), padded tufted headboard banquettes, terrace fairy lights through the glass, chandelier polish; high-quality capture for sharing that hides the planning overlays (prototype: `?capture`) | Owner approves on the preview | Not started |

**Acceptance reference:** the two prototype pictures in `docs/visual/` (evening, with guests, overlays hidden). The finished steps should look at least this good from the same cameras (dollhouse default; eye level across the west tables toward the bar: position [2.0, 1.6, 9.8], target [7.2, 1.5, 2.2], fov 60, added as a camera preset in V1). The pictures predate the back-bar uplift and the dressed figures, which should improve on them. Detail shows mainly at eye level; from the dollhouse overview a chair is ~15 px, so the overview gains come from light, surfaces, chairs and figures.

**Prototype cost (for budgeting):** desktop 186 draw calls / 1.36 M triangles; phone 136 / 0.37 M (limits 250 / 1.5 M and 150 / 0.6 M). Phone headroom is the binding constraint, so V0 must free draw calls before V3–V6 land.

**Every step:** before/after numbers for each tier; the six baseline shots (dollhouse day, dollhouse evening, R01, R03, R09, Sit here) side by side with the previous step; desktop 1440×900 and phone 390×844 screenshots; `ux-reviewer` and `fidelity-reviewer`; owner approval.

## Graphics tiers

**Auto** is the default: starts at High on desktop and Balanced on phone, steps down after ~2 s of slow frames, steps up only after a sustained good run, remembers the tier per device, and changes tier only while the view is still. A manual choice (Auto / High / Balanced / Battery saver; Battery saver on phone only) sits in the settings — a new UI pattern, mocked up for owner approval first.

| Lever | High | Balanced | Battery saver (phone) |
|---|---|---|---|
| Resolution | up to 2× | 2× still, ~1.25× while moving | 1.25× |
| Frame cap | 60 fps | 60 fps | 30 fps |
| Ambient occlusion | live | in the still refine frame only | none (painted-on contact shadows) |
| Bloom | on | on, lower resolution | off (glow sprites) |
| Shadows | soft 2048, drawn once | 1024, drawn once | none (painted-on contact shadows) |
| Textures | 2K | 1K | 1K |
| Décor detail | detailed in close views | detailed in Sit here only | simple |
| Candle flicker | on | on | off |

Rules: render only when something changes, in every tier. While moving, resolution drops slightly; one full-quality frame renders when the view stops. The look is made cheap by design (painted light pools, contact shadows, glow sprites), so tiers only trim polish. Auto cuts in this order: ambient occlusion, resolution, bloom, shadows; never lighting mood or models.

## Targets (definition of done)

| Target | Value |
|---|---|
| Phone frame rate (owner's iPhone and Android, Auto) | steady 60 fps orbiting and dragging; never below 30 |
| Single freeze during a gesture | ≤ 50 ms |
| View switch or menu open | scene freeze < 100 ms |
| iPhone after backgrounding | no lost 3D view |
| Draw calls, triangles, download | within `ARCHITECTURE.md` §7, per tier |
| GPU memory | budget set in V0 from measurement |
| First meaningful paint | as §7; room appears with simple shapes first, detailed ones swap in |

CI checks draw calls and triangles per tier (software rendering makes frame rate meaningless there). Frame rate is read on the owner's devices through a hidden `?perf` overlay. Visual baselines for High and Battery saver; flicker and other motion off in tests and under reduced motion.

## Decisions

- Tiers A (real-time polish) and B (detail and materials) approved; Tier C (baked lighting, path-traced stills) postponed (owner, 2026-10-16).
- Evening and daylight both kept.
- Visible, large, frequently seen pieces first; skip tableware close-ups, projector, track spots, extra ceiling detail and exact paintings (copyright; stand-ins gain frame depth only).
- Prototype accepted as the visual target, including light wall caps and the plinth (owner, 2026-10-16); `DESIGN_GUIDE.md` §9 is updated in V1.
- Back bar uplifted to reflect the grandeur of the reference photos (V3 detail above; owner, 2026-10-16).
- Guest figures (owner, 2026-10-16): faceless and stylized, slim proportions with simple hair (the owner's second reference style; reference images are stock and used for style only). Small variety: men in suits, women in dresses, a few outfit colours and a range of skin tones, coloured per guest in the shader. Four base meshes (man and woman, seated and standing). Solid at eye level and in Sit here; light and see-through in the dollhouse overview so the room stays visible. Simple version (~600 triangles) in the overview and on phones, detailed version only at eye level, switched by camera mode. `DESIGN_GUIDE.md` §9 people rule changes when built.
- Bar flowers: exactly two, always present, movable along the bar top only; big glass vases with tall white blossom branches as in R02, in the venue's own style (not the table palette). New behaviour: spec row and scenario migration when built.
- Table-number stand: realistic size (≈ 20–25 cm brass stand, large card) with the digits printed; readable at table distance. No floating badges.
- Blender is used for asset authoring (chairs, guest figures); the Blender Python scripts are committed so assets are reproducible. Blender 5.2 runs headless from its Python module (`pip install bpy`); it is added to the cloud environment setup before V4.
- Graphics setting with Auto / High / Balanced / Battery saver; Battery saver on phone only (owner, 2026-10-16).
- Test devices: the owner's two-year-old iPhone and Android phone.

## Open items

- Phone models (exact iPhone and Android) to fix the targets.
- Prototype branch `proto/visual-lookdev` exists only in the session that built it; pushing it (and a Vercel preview to feel frame rate on the phones) needs the owner's go-ahead.
- New spec rows when built: bar flowers (VEN), graphics setting (PLT). New budget rows in `ARCHITECTURE.md` §7: GPU memory, view-switch freeze.
- Menu-open lag cause not yet profiled (V0).
