# Richmond Studio — Visual Upgrade Status

**Current stage:** Planned (owner-approved 2026-10-16). One look-development prototype first, on a throwaway branch; the steps below start after step 3b merges and finish before the freeze (~2026-11-10).
**Scope:** look and performance only. Behaviour stays as in `PRODUCT_SPEC.md`; the owner validates functionality separately. Main plan: `PROJECT_STATUS.md`.

## Goal

A premium, polished room — closer to the owner's isometric sample and to the reference photos — with no lag on a laptop or on a two-year-old iPhone and Android phone. Best visible return per cost: big, frequently seen surfaces and pieces first; nothing that cannot be seen at room scale.

**Expectation:** live lighting stays (ADR-2). The result is clean, detailed and well shaded, not the soft bounced light of an offline render. Baked lighting and a path-traced still mode (Tier C) are postponed.

## Steps

Each step ships on its own; stopping after any step leaves a consistent result.

| Step | Delivers | Gate | State |
|---|---|---|---|
| P | Look-dev prototype: bar area + two dressed tables (light hierarchy, bevels, new materials, bar flowers, one draped round table, sample candles and flowers); dollhouse evening + R03 shots at desktop and phone sizes | Owner accepts the shots as the visual target | Next |
| V0 | Performance: profile; fix the view-switch and menu lag; render only when something changes; merge static venue meshes by material; static shadows drawn once; Auto quality monitor; baseline shots and numbers | Targets below met on the owner's devices | Not started |
| V1 | Light and presentation: evening light hierarchy (painted light pools under chandeliers, warm washes on brick, darker edges); bevelled edges; painted-on contact shadows under furniture; reflection environment; tone; wall caps and ground decision; graphics tiers + setting | Owner approves look on the preview | Not started |
| V2 | Room surfaces: floor tiles (per-tile variation, quiet warm joints), dark hardwood, buff brick at correct scale with whitewash variation, red-brick dado; garage-door frames, pier bands, green panelled wall | Fidelity review vs R02/R03/R04 | Not started |
| V3 | Bar and back bar: thick marble slab with real veining and eased edge, panelled black base, foot rail; the two bar flowers; back bar with mixed lit bottles, wood frame, steel canopy, round red neon sign, glass fridges | Fidelity review vs R02/R03/R11/R14 | Not started |
| V4 | Linens and chairs: drape built from Blender corners with a code-stretched middle (any table length), runners the same way; chair-gap rule so tucked chairs never pierce floor-length cloth; venue oval-back chair rebuilt (weathered oak, grey velvet), other chair styles | Fidelity review vs R04/R09/R10 | Not started |
| V5 | Table décor: flowers (petal and leaf cut-out cards from one texture sheet, bloom shape per flower type); candles (glow-sprite flames with GPU flicker, warm pool on the cloth, reflective glass); table-number stand; tableware (turned plates, chargers, glasses; folded napkins); detailed versions only in close views; library thumbnails re-rendered | Budget test with heaviest décor on every table | Not started |
| V6 | Remaining fixtures and sharing: ornate iron scroll railings (stair, raised floor), east curtains (deep folds, sheen), plants (fiddle-leaf fig by the green wall, pot by the garage door), tufted headboard banquettes, terrace fairy lights through the glass, chandelier polish; high-quality capture for sharing | Owner approves on the preview | Not started |

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
- Visible, large, frequently seen pieces first; skip people detail, tableware close-ups, projector, track spots, extra ceiling detail, espresso machine, the decorations above the back bar, and exact paintings (copyright; stand-ins gain frame depth only).
- Bar flowers: exactly two, always present, movable along the bar top only; big glass vases with tall white blossom branches as in R02, in the venue's own style (not the table palette). New behaviour: spec row and scenario migration when built.
- Table-number stand: realistic size (≈ 20–25 cm brass stand, large card) with the digits printed; readable at table distance. No floating badges.
- Blender is used for asset authoring; the Blender Python scripts are committed so assets are reproducible. Blender is added to the cloud environment setup when V4 starts.
- Graphics setting with Auto / High / Balanced / Battery saver; Battery saver on phone only (owner, 2026-10-16).
- Test devices: the owner's two-year-old iPhone and Android phone.

## Open items

- Phone models (exact iPhone and Android) to fix the targets.
- Wall caps light vs dark charcoal, and evening ground/backdrop: shown side by side in V1 (changes `DESIGN_GUIDE.md` §9 if light wins).
- Prototype branch push for a Vercel preview (lets the owner feel the frame rate on the phones) needs the owner's go-ahead.
- New spec rows when built: bar flowers (VEN), graphics setting (PLT). New budget rows in `ARCHITECTURE.md` §7: GPU memory, view-switch freeze.
- Menu-open lag cause not yet profiled (V0).
