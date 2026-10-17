# Visual reference notes

**Date:** 2026-10-17 · **Plan:** `VISUAL_STATUS.md` · **Venue evidence:** `references/venue_evidence_matrix.md`

Third-party images (venue photos, the owner's stock samples) are never committed (ADR-6); this file records what they show. Committed pictures: `target-overview-evening.webp` and `target-eye-level-evening.webp` (our own prototype renders, the acceptance reference).

Where the originals are:

- Venue photos R01–R17: `python3 scripts/collect_venue_media.py --photos-only` into the gitignored `references/PRIVATE_LOCAL_PHOTO_CACHE/`.
- Owner stills U01–U05, clips UV01–UV02, plan F01: exist only in the sessions that received them; ask the owner to re-share.
- Finish sample (§1) and people reference (§2): owner-supplied stock images. For V4 the owner attaches the people reference to a custom request in the app, where Claude reads it with the requests token (REQ-03).

## 1. Finish reference (owner's isometric sample, 2026-10-17)

An offline daylight render of a small living room as a cutaway miniature. It sets the finish, not the geometry. What we take from it, used as the finish checklist in every step review:

- [ ] **Grounded:** every piece has soft contact darkening under it; walls darken softly where they meet the floor and each other.
- [ ] **Bevelled:** no razor-sharp box edges on furniture, counters, wall caps or the plinth; edges catch a thin highlight.
- [ ] **Presented:** thick light wall caps, the room on a plinth, its soft shadow on a smooth gradient backdrop; long-lens, near-isometric framing.
- [ ] **Calm palette:** warm neutrals, no oversaturated orange; whites read as white or ivory, not beige.
- [ ] **Soft light:** broad, soft shading; no hard black pockets; highlights restrained.
- [ ] **Real scale:** textures (planks, tiles, brick) at real-world size with gentle variation, no visible repeats.
- [ ] **Soft goods look soft:** fabrics have rounded volume and sheen; cushions and cloths are not boxes.

Not transferable at real-time cost: true bounced light and area-light soft shadows everywhere (see the lighting approach in `VISUAL_STATUS.md`). Evening is our default; the checklist applies to both lighting modes.

## 2. People reference (owner, 2026-10-16 and 2026-10-17)

Stock 3D character (watermarked; style only). V4 figures follow it:

- **Face and skin:** faceless smooth head, no features; matte skin, no texture detail; skin tone varies per guest.
- **Hair:** simple sculpted shape, short and rounded for men; women's simple sculpted styles in the same language; a few hair colours.
- **Proportions:** slim and elongated (~8 heads tall), narrow shoulders, long legs; natural relaxed poses.
- **Clothing:** tailored, with real garment shapes: suit jacket with lapels and buttons over an open-collar shirt, trousers with a crease line, plain dark shoes; women in dresses. Fabrics matte with soft folds; a few outfit colours (charcoal, navy, black, muted tones).
- **Hands:** simplified with separated fingers in the detailed version; mitten-like in the simple version.
- **Shading:** soft studio look matching the room; no outlines, no toon shading.
- **Versions:** four base meshes (man, woman × seated, standing); detailed for eye level and Sit here, ~600 triangles for the overview and phones; light and see-through in the dollhouse overview.

## 3. Venue detail inventory (R01–R17 reviewed 2026-10-17)

Status: **M** modelled · **V0–V6** planned in that step · **—** skipped (low value) · **?** owner to confirm.

| Detail | Photos | Status |
|---|---|---|
| Timber plank ceiling, timber beams, riveted black steel girder along the north wall top | R01 R02 R03 | M (plain); detail V2 |
| Black conduit pipes and track rails across the ceiling | R01 R02 R03 R08 R11 | V2 (thin lines); spot heads — |
| Silver spiral ducts, black ducts | R02 R03 R07 | M; finish V2 |
| Skylight over the brass chandelier | R03 | M; detail — |
| Black drum pendants | R01 R02 R03 | M |
| Birdcage chandeliers on thick rope | R04 R05 R10 R15 | M; polish V6 |
| Brass cylinder-cluster chandelier | R02 R03 R14 | M; polish V6 |
| Projectors (ceiling) | R03 R04 R08 | — (body); monogram projection is a library light |
| Back bar: lit shelves, mirror, fridges, espresso machine, red round neon, POS screen | R02 R03 R07 R14 | V3 |
| On the back-bar canopy: small plants, dried grasses in vases, boxes | R02 R03 | V3 (plants, grasses as cards); boxes — |
| String instruments hung on the brick above the back bar | R02 | V3 (cards) |
| Bar: white veined marble, black base, foot rail, beer tap tower | R02 R03 R11 | V3; tap tower — |
| Bar stools: wood seat, cast-iron base | R02 R03 | M (toggle, hidden for the wedding) |
| Bar flowers: tall white blossom branches in glass vases (seasonal) | R02 R07 R11 | V3 |
| Wine wall: tall glass case with racks near the east windows | R15 UV02 | M; bottles as cards V3 |
| North wall: buff brick over red-brick dado; tufted nail-head headboard banquettes; paintings | R01 R06 R07 R10 | M (plain); brick V2, banquettes V2 |
| Restroom corridor: opening to a green-walled space with a framed photo, north wall near the pop-art painting (owner, 2026-10-17) | R07 | V1 (opening; exact position from R07 in the fidelity review) |
| South (kitchen) wall: dark green panelling, EXIT door, tufted banquettes, fiddle-leaf fig | R04 | M (green wall); EXIT door and banquettes ? (open item); fig V6 |
| Mezzanine fascia: dark green, long linear HVAC grille, projection screen above, red SORTIE neon | R09 | M (fascia, exit); grille as texture V1; screen — |
| Stair: LED treads (lime-yellow glow across each tread top), scrolled iron balustrade panels, timber handrail | R01 R09 R11 | M (plain bars); tread glow V1; scroll panels V6 |
| East wall: tall windows, gold velvet curtains on black rods, white sheers behind, brick piers with red-brick bands | R05 R09 R10 R13 | M (windows, curtains); sheers V2; pleats V6; pier bands V2 |
| Uplights washing the brick piers and curtains (event colour) | R05 R08 | V1 (warm washes); colour uplights are library lights |
| Window-sill planters (tropical plants) on the east windows | R05 R12 | V6 |
| Fiddle-leaf fig in a black planter by the west garage door | R01 R02 | V6 |
| Garage doors: black steel frames, fine pane grid, brick piers between | R01 R03 R04 R17 | M; frames and piers V2 |
| Terrace string-light canopy seen through the glass at night | R11 R16 | V6 |
| Floors: dark tiles with light wood joint strips (west and centre), dark hardwood (east) | R01 R02 R03 R04 R05 | M; real scale V2 |
| Gold cordless table lamps on the tables | R11 R12 | Library item (owner, 2026-10-17) |
| Farm tables with X-base, cane-back and cross-back chairs | R08 R10 | M (library) |
| Wall speakers, fire alarm, thermostat, HVAC cassettes | R04 R07 R10 | — |
| Bar cellar | none | Not in any image; the wine wall is the closest feature |

## 4. Evening calibration targets (V1)

Tune exposure and light balance side by side with these, from camera presets that approximate each view:

| Photo | What to match |
|---|---|
| R08 (wedding, navy linens beside the bar) | How dark the ceiling and upper walls go; candle pools on dark linen; back bar as the brightest area; birdcage glow |
| U02 (wedding evening from above) | Overall evening exposure from a high view, which the dollhouse resembles |
| R11 (dinner service) | White cloth brightness under warm light; glints on the marble; terrace string lights through the glass |
| R06 (candlelit tables, north wall) | Candle light on white flowers and glass; brick read in low light |
| UV01 (north side from the mezzanine) | Relative brightness of chandeliers, back bar and floor |

## 5. Current-state findings (2026-10-17, from code and the committed visual baselines)

Observed:

- The 3D canvas renders every frame even when nothing changes (no on-demand rendering).
- The shadow map is redrawn every frame although its light never moves; the budget test counts that pass.
- The four evening fill lights are removed in daylight and plan view, and shadows switch off in plan view: each changes the light set, which makes three.js recompile every material (likely the view-switch lag).
- Two quality tiers, chosen once from pointer type and screen size; no frame-time monitor.
- The compare view runs a second full 3D canvas.
- Phone draw calls in the dressed-room test: 140 of 150.
- Fourteen 1024² textures uploaded uncompressed (≈ 78 MB GPU memory, estimate).
- Architecture and furniture are mostly hard-edged boxes; people are merged capsules.

Largest visual gaps against §1, ranked by value for cost: grounding (contact and edge darkening); presentation (plinth, caps, backdrop); evening light hierarchy (today a uniform orange); bevels; tablecloths as boxes; mannequin people dominating the overview; chairs at eye level; repetitive floor and brick; oversaturated tone; back-bar grandeur.

No frame rate has been measured on a real device yet; V0 records the baseline on the iPhone 16 and Galaxy S24.
