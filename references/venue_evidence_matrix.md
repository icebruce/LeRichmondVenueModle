# Venue evidence matrix — Le Richmond main floor

**Reviewed:** 2026-10-15 · **Scope:** main restaurant floor only · **Register:** `source_manifest.json`

Images are **not committed** (public repository). R01–R17 can be re-fetched from their URLs (`scripts/collect_venue_media.py --photos-only`). Owner-supplied stills/clips (U01–U05, UV01–UV02) and the venue sample plan (F01) exist only in the session that received them, so this file records what they show.

Legend: **O** observed in images · **C** confirmed by owner · **I** inferred · **?** unknown. Confidence: H / M / L.

## 1. Orientation convention

Plan north = the back-bar wall (top of F01). West = glazed garage doors to the terrace. East = tall street windows. South = wall with the kitchen behind it; the mezzanine sits above the kitchen and the entrance corridor.

```
                         NORTH: brick wall
   [horseman painting +    [BACK BAR: lit shelving,    [pop-art painting +
    tufted banquettes]      steel canopy]               tufted banquettes]
 W ┌──────────────────────────────────────────────────────────────┐ E
 E │ dark tile floor          ┌──── BAR (U, open to north) ────┐   dark wood, │ tall street
 S │ (light wood joint        │ marble top, black base          │   RAISED     │ windows,
 T │  strips)                 │ stools W/S, chairs E            │              │ velvet
   │ (communal table: removed)└─────────────────────────────────┘╲ step edge  │ curtains,
 g │                                                              ╲ + railing │ brick piers,
 l │                    DANCE FLOOR ZONE (full-height ceiling)       ╲          │ wine wall
 a │                                                                          │
 z │ [sweetheart table]                                   landing ═stair═► │
 e │ EXIT ────────────── KITCHEN PASS (opening) ─────────────┐ corridor ──┤ ENTRANCE
   └──────────────────────────────────────────────────────────────┘
                SOUTH: kitchen behind the wall; mezzanine above kitchen + corridor
```

The drawn map in `docs/mockups/lofi.html` (Venue map tab) is the authoritative picture of this layout.

## 2. Fixed features

| Feature | Evidence | Conf. | Notes |
|---|---|---|---|
| Bar: U-shaped island, white marble top, black base, open toward back bar | O: R01 R02 R03 U01 U02 U05 UV01 | H shape / L size | West + south sides: ~6–7 iron-base wood-seat stools. East side: upholstered chairs. |
| Back bar: lit bottle shelving, glass fridges, steel canopy, round red neon sign | O: R02 R03 R14 U02 UV01 | H | North wall, centred on bar opening. |
| Brass multi-bulb chandelier over bar | O: R02 R03 R14 U01 U02 U05 | H | Dominant evening light source. |
| Birdcage crystal chandeliers (≥5), some hung on rope | O: R01 R03 R04 R05 R08 R10 U04 UV01 UV02 | H presence / M positions | Over west dining, east window zone, central area. |
| Black drum pendants, track spots, projector(s) | O: R01 R02 R04 U04 UV02 | H | Projector near glazing (R04, U04). |
| Ceiling: timber beams on tongue-and-groove planks, riveted black steel girders, black ducts; skylight near bar | O: R01 R02 R03 U03 UV02 | H | Dance floor zone is under this full-height ceiling (C). |
| West wall: ≥2 black steel glazed garage doors (≈6×6 pane grid), brick piers | O: R02 R03 R04 R17 U01 U04 U05 | H presence / M count | Terrace beyond = background only. Night: terrace fairy lights visible through glass. |
| West wall, south part: dark green panelled wall, tufted banquette, EXIT door | O: R04 | M | Exact extent unknown. |
| North wall: buff brick over red-brick dado; tufted nail-head banquettes; horseman painting (west of back bar), pop-art portrait (east of back bar) | O: R01 R03 R06 R07 U03 U05 UV01 · C: F01 white rectangles = paintings | M | Artwork moves between years (R08, R15 differ); treat paintings as swappable. |
| East wall: double-height street windows, velvet curtains, brick piers with red-brick bands | O: R05 R09 R10 R13 R15 UV01 UV02 | M | Window height est. 5–6 m (L). |
| Wine wall: tall red-framed glass case under steel canopy beside brick pier | O: UV02 R15 | M presence / L position | Near east windows. |
| Floors: large dark tiles with light wood joint strips (west/centre); dark hardwood planks (east) | O: R01 R02 R03 R04 U01 · C | H materials / M boundary | The "recovered brick floor" in a design write-up is not visible in any interior image; ignore. |
| Raised floor: everything right (east) of the bar to the street windows; edge (step + railing) runs diagonally from the bar's south-east corner, then straight across to the east wall (F01 diagonal + L) | C · O: U01 U05 (chairs, not stools, at the bar's east side) · F01 | H outline / L height | Est. +0.15–0.45 m. Separate from the mezzanine stair. |
| Mezzanine: iron balustrade, dark green fascia, above the kitchen and the entrance corridor, i.e. behind the south wall line; NOT modelled as a floor | C · O: R09 UV02 UV01 | M | Front edge used only as the DJ option 3 spot (C). The dance floor and sweetheart table are not under it (C). |
| Stair to mezzanine: starts at the landing where the entrance corridor enters the room (SE), climbs to the right (east) up to the wall, then to the mezzanine; LED-lit treads, wrought-iron scroll balustrade, timber handrail | C · O: R01 R09 U01 U02 UV02 | M start / L run and turn | R01/R02/U01/U03 shot from its top. Turn at the wall inferred from R09 landing. |
| Entrance: street door on the east side, SE corner, into a corridor under the mezzanine that opens into the room at the stair landing | C | M | EXIT sign visible near it (UV02). Corridor itself is out of scope. |
| South wall: kitchen behind it (out of scope); kitchen pass = opening in that wall. Sweetheart table goes against this wall. | C · O: UV02 · F01 | M | F01 "CUISINE" box is the kitchen beyond the wall. |
| Communal high table with stools (tile zone, west of bar); bar stools | O: R01 R02 U01 U05 · C | H | Both removed for the wedding (C). The communal table is no longer modelled (C, 2026-10-17); bar stools stay as a toggle, hidden by default: 5 at the front, 6 on each side (C, 2026-10-17). |

## 3. Image ledger

| ID | Vantage → facing | Main floor? | Primary use |
|---|---|---|---|
| R01 | Stair top (mezzanine level, SE) → NW | Yes | Overall relationships, ceiling, bar, floors |
| R02 | Stair top → NW, steeper | Yes | Bar footprint, glazing count, floor boundary |
| R03 | Eye level, west of bar → N/NW | Yes | Materials, chandelier, back bar, glazing grid |
| R04 | Eye level, centre → W/SW | Yes | Garage doors, tile grid, green wall + EXIT, chair scale |
| R05 | Eye level → E | Yes | Street window, curtains, birdcage, brick pier |
| R06 | Eye level → N | Yes | Banquettes + painting, candle mood |
| R07 | Eye level → N/NE | Yes | Pop-art wall, brick dado, back-bar edge |
| R08 | Eye level, centre → N | Yes | Wedding long tables beside bar (navy linen) |
| R09 | Eye level → S | Yes | Street windows, LED stair, mezzanine soffit, EXIT |
| R10 | Eye level → NE/E | Yes | Banquettes, birdcage, street windows |
| R11 | Seated near stair railing → NW | Yes | Railing, bar line of sight |
| R12, R13, R14, R16, R17 | Close-ups | Yes | Tabletop, linen, candle, glass references only |
| R15 | High (mezzanine) → N/NE, older | Yes | Corroboration; artwork differs from today |
| U01 | Stair top → NW (day) | Yes | Same as R02; bar seating sides |
| U02 | High → N (wedding evening) | Yes | Event styling over bar; stair platform at left |
| U03 | Stair top → NW (winter) | Yes | Duplicate of R01 vantage |
| U04 | Eye level → W (night) | Yes | Glazing at night, long-table rows |
| U05 | High, over communal table → N/NW | Yes | Horseman painting location, single garage door |
| UV01 | Mezzanine edge → N (evening) | Yes | Whole north side from the south |
| UV02 | Tile zone → S (day), then wine wall | Yes | Mezzanine, stair, kitchen pass, east windows |
| F01 | Plan | Yes | Topology only; not to scale |
| X01–X04 | Terrace | **No** | Excluded from geometry. X05 link broken. |

## 4. Dimension hypotheses (all inferred, editable)

| Quantity | Range | Conf. | Basis |
|---|---|---|---|
| Main room width W–E × depth N–S | ≈ 16 × 14.3 m (range 14–18 × 12.5–16) | L | From F01 proportions if its 8-seat tables are ≈ 3.5 m; south wall at the F01 kitchen line. Kitchen + corridor beyond add ≈ 2 m. |
| Main ceiling (timber deck) | 6.5–8 m | L | Ceiling well above mezzanine level in R01/UV02 |
| Mezzanine floor height | 3.5–4.2 m | L | Headroom over kitchen pass in UV02 |
| Mezzanine projection into the main room | ≈ 0–1 m | L | Sits above kitchen + corridor (C). |
| Garage door (each) | 3.2–3.8 m W × 3.6–4.2 m H | M | ≈6 panes × 0.55–0.65 m |
| Street windows | 2–2.5 m W × 5–6 m H | L | Curtain drops vs chairs |
| Bar island | 4–5 m (W side) × 3–4 m | L–M | Stool count × ~0.6 m pitch |
| Bar counter height | 1.05–1.10 m | M | Stools vs counter |

Sense checks only: published indoor capacity ~150–170 seated; 3,200 ft² (~297 m²) historical claim. Neither constrains the model.

## 5. Corrections to the original handover

- Ceiling is much higher than the 3.6–5.4 m placeholder.
- The platform with steps seen in U02 is the mezzanine stair (C). Separately, the floor along the east street windows, right of the bar, is raised a bit (C).
- Kitchen is behind the south wall (kitchen pass = opening); the mezzanine is above the kitchen and entrance corridor; dance floor and sweetheart table are in the full-height room (C).
- Wine wall exists near the street windows.
- Paintings rotate; they are décor, not fixed architecture.
- F01 seats 60; the plan is for ~75 guests with tables of up to 14 (C).

## 6. Open items

1. Raised floor height and exact step positions along its edge.
2. Stair run length and where it turns at the east wall.
3. West wall south of the garage doors (green wall extent, EXIT location).
4. Venue table sizes (lengths for 8–14 seats).
5. Any measurement (room length, width, bar length) would replace §4 ranges.
