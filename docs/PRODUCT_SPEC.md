# Richmond Studio — Product Specification

**Status:** Source of truth for behaviour · **Version:** 1.0 · **Date:** 2026-10-15
**Look and feel:** `DESIGN_GUIDE.md` (wins on look) · **How it is built:** `ARCHITECTURE.md`

---

## 1. Context

A private web app for one couple to plan their wedding reception at **Restaurant Le Richmond, 377 Rue Richmond, Montreal** on **2026-11-21**, for about **75 guests** (the number may change). Both partners use it, on laptop and phone, from one shared link.

The job: decide **where things go** (tables, dance floor, DJ, stations), **how full it feels**, and **how it looks** (linens, candles, florals, chairs), then save alternatives, compare them and hand a clear plan to the venue.

Useful window: now until about 2026-11-10. Anything that does not help a decision before then is out.

## 2. Scope

**In:** Le Richmond's main restaurant floor, including the raised floor strip along the east street windows; the mezzanine stair and mezzanine front edge as visible, non-walkable architecture; the terrace seen through the glass as a dark backdrop.

**Out:** the mezzanine as a usable floor (one exception: a fixed DJ spot on its front edge, `LAY-11`), the terrace, the bistro, the kitchen interior, guest seating chart (names to seats), RSVP, budgets, vendor management.

Le Richmond is **not** Salon Richmond 1861.

## 3. Product principles

1. **Recognizable over pretty.** If it does not read as Le Richmond, nothing else matters.
2. **Honest numbers.** Dimensions are estimates. Every fit or clearance message is advisory and says so. Nothing claims code or fire-safety compliance.
3. **One tap for common actions.** Add, move, rotate, duplicate, delete, apply to all, save.
4. **Undo instead of "Are you sure?".**
5. **Phone is a first-class viewer and a capable editor;** precision editing is best on desktop.

## 4. Quality target (visual)

- **Atmospheric, close to the venue, not photoreal.** Recognizable from the photo R01 viewpoint.
- **Evening with candlelight is the default.** Daylight is one tap away.
- **Dollhouse view** in the style of an isometric architectural cutaway (owner-supplied DreamHouse3D samples, described in `DESIGN_GUIDE.md` §9), adapted to a tall room.
- **People** are simple neutral figures, not lifelike humans.

## 5. Requirements

Priority: **M** = must, by the step shown · **S** = should · **C** = could. Steps are defined in `PROJECT_STATUS.md`.

Each requirement has an ID. Tests name the ID they cover (`TEST_STRATEGY.md` §2).

### 5.1 Venue — VEN

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| VEN-01 | M | 1 | The fixed room is modelled from `data/venue_geometry.json`: walls, glazed garage doors, street windows, brick, timber ceiling and steel beams, U-shaped bar and back bar, floors (tile / wood), raised east strip, mezzanine edge and stair, kitchen pass, entrance, chandeliers, paintings, banquettes, wine wall. | From the default dollhouse view and from the R01, R03, R09 viewpoints, the owner identifies the room as Le Richmond. |
| VEN-02 | M | 1 | Fixed architecture cannot be selected, moved or deleted in normal use. | Clicking a wall, the bar or the stair never selects it. |
| VEN-03 | M | 1 | No walkable or editable mezzanine, terrace or bistro. | Walk mode cannot leave the main floor; nothing can be placed outside it except at `LAY-11`. |
| VEN-04 | M | 1 | The raised east strip is a separate level with a visible step edge. Items placed on it sit at its height. | A table dragged onto the strip rises to the strip level; one straddling the edge is refused. |
| VEN-05 | S | 2 | Paintings are swappable décor (current artwork by default). | Owner can hide or swap each painting. |

### 5.2 Cameras — CAM

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| CAM-01 | M | 1 | **Dollhouse**: orbiting 3/4 view, ceiling hidden, walls facing the camera cut low automatically, far walls full height. Default angle matches photo R01 (from south-east looking north-west). | Orbiting a full turn always shows the interior; no wall blocks the view. |
| CAM-02 | M | 1 | **Top-down**: orthographic plan for placing. | Tables keep their true proportions; labels readable. |
| CAM-03 | M | 1 | **Walk**: eye height 1.65 m; keyboard + mouse on desktop, touch joystick + drag-to-look on phone; cannot pass through walls, bar or tables. | Walking from the entrance to the dance floor and around the bar works without clipping. |
| CAM-04 | S | 3 | **Sit here**: tap any chair to see the room from that seat. | View is at seated eye height (1.2 m) facing the table centre. |
| CAM-05 | M | 1 | Camera changes animate smoothly (≤ 600 ms); a Reset view control always exists. | No jump cuts; reset returns to the default angle. |

### 5.3 Lighting — LGT

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| LGT-01 | M | 1 | Evening mode (default): warm low light, glowing chandeliers and back bar, candle glow on tables, terrace glass dark with faint fairy-light hints. | Side-by-side with R08 the mood reads as similar. |
| LGT-02 | M | 1 | Daylight mode for clarity, one tap away. | Toggle switches in ≤ 1 s without losing state. |
| LGT-03 | M | 1 | Live browser lighting only. Pre-computed lighting is a later option (`ARCHITECTURE.md` ADR-2). | — |

### 5.4 Layout — LAY

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| LAY-01 | M | 1 | Catalogue: rectangular tables 4–14 seats (length follows seat count), round tables 4–10, sweetheart table (2), cocktail table, dance floor (resizable), DJ booth, food station, cake table, gift/card table. | Each item can be added from the catalogue in one tap. |
| LAY-02 | M | 1 | Select, drag, rotate (handle + 15° snap; free with modifier), duplicate, delete. Multi-select on desktop. | Works with mouse and touch. |
| LAY-03 | M | 1 | Chairs are placed automatically around a table from its seat count. Changing seats re-arranges them. | A 12-seat rectangle shows 5 + 5 + 1 + 1 (sides + ends) or 6 + 6 (no ends), owner's choice per table. |
| LAY-04 | M | 1 | Items cannot overlap fixed architecture or each other; the move is refused with a visible cue, not silently clamped. | Dragging a table into the bar shows a red outline and returns it on release. |
| LAY-05 | M | 1 | Snapping to a 10 cm grid and to alignment with nearby tables; can be turned off. | — |
| LAY-06 | M | 1 | Undo / redo for every change (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, toolbar buttons). | 50 steps deep at minimum. |
| LAY-07 | M | 1 | Live counts: tables, seats, guests, guests without a seat, dance floor area. | Counts update on every change. |
| LAY-08 | M | 2 | Advisory checks with editable thresholds: aisle width between chair backs (default 1.0 m), clearance at entrance, stair, kitchen pass and glazed doors (default 1.2 m), dance floor size vs guest count (default 0.45 m² per dancer, 35% dancing). Wording always says "advisory". | Narrowing an aisle below the threshold highlights it and names the issue. |
| LAY-09 | M | 1 | The venue sample plan (F01) is available as a starting scenario. | Loads 3×8, 1×10, 3×8, sweetheart, dance floor, DJ option 1. |
| LAY-10 | M | 1 | Tables are numbered automatically; numbers can be edited. | Numbers show in top-down view and in the export. |
| LAY-11 | M | 1 | DJ can be placed at three named spots, including the mezzanine front edge (option 3), or freely on the floor. | DJ option 3 sits on the mezzanine edge and is not walkable. |
| LAY-12 | S | 2 | Existing venue furniture (communal high table, bar stools) can be shown or hidden per scenario. | Hidden items free their floor area for the checks. |

### 5.5 People — PPL

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| PPL-01 | M | 2 | Guest count control (0–200, default 75). Guests fill seats first; the rest stand in open areas, never on the dance floor during dinner phase. | 75 guests with 60 seats shows 60 seated + 15 standing and "15 without a seat". |
| PPL-02 | M | 2 | Placement is reproducible for the same layout and count. | Reloading shows the same people in the same places. |
| PPL-03 | M | 2 | 150 people + 15 tables stays smooth on a 2022+ laptop and phone (`ARCHITECTURE.md` §7 budgets). | — |

### 5.6 Décor — DEC

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| DEC-01 | M | 2 | Linens: white, ivory, champagne, black, navy, bare wood. Apply to one table, selected tables or all. | One tap applies to all; placements unchanged. |
| DEC-02 | M | 2 | Candles: none, votives, mixed pillars, tall tapers, floating candles in tall glass. Lit by default in evening mode. | Candles glow in evening and are visible but unlit-looking in daylight. |
| DEC-03 | M | 2 | Florals: none, low cluster, bud vases, tall arrangement, greenery runner. | Heights are realistic (low ≤ 30 cm, tall 80–120 cm). |
| DEC-04 | M | 2 | Chairs: venue oval-back upholstered (default), wood cross-back, white-and-gold oval-back. | Swap per table or all. |
| DEC-05 | S | 2 | Per-table override and "apply this table's style to all". | — |

### 5.7 Inspiration import — IMP

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| IMP-01 | M | 3 | Add an image from the phone camera or photo library, by desktop drag-and-drop, or by paste. | Works on iOS Safari and desktop Chrome/Safari. |
| IMP-02 | M | 3 | Choose what it is: fabric/linen, candle or holder, vase or centrepiece, florals, chair, other. | — |
| IMP-03 | M | 3 | Crop to the object. | — |
| IMP-04 | M | 3 | Set real size in cm (width, height). | — |
| IMP-05 | M | 3 | The app makes, by type: a **material** (fabric), an **adjustable 3D template** coloured from the photo (candles, vases, centrepieces, florals, chairs), or a **photo preview** standing at real size (other). A **GLB file** imports as an exact model. Every item shows its label: *Material*, *Approximate 3D*, *Photo preview* or *Exact 3D model*. | A photo preview is never labelled as 3D. |
| IMP-06 | M | 3 | Saved items go to a shared catalogue, placeable on tables or floor, reusable, applicable to all tables. | Survives reload and is visible to the partner. |
| IMP-07 | M | 3 | A pasted product link is stored as the item's source only; the app does not fetch web pages. | — |

### 5.8 Scenarios and collaboration — SCN

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| SCN-01 | M | 1 | Create, duplicate, rename, delete scenarios. | Deleting offers undo for 10 s. |
| SCN-02 | M | 2 | Scenarios save to the cloud automatically and are shared between both partners. | Changes on the laptop appear on the phone after reload. |
| SCN-03 | M | 2 | If the partner saved a newer version, saving warns and offers: keep mine, take theirs, or save mine as a copy. Nothing is overwritten silently. | — |
| SCN-04 | S | 2 | Version history per scenario with restore. | — |
| SCN-05 | M | 2 | Notes on each scenario, with author (partner A / B) and time. | — |
| SCN-06 | M | 2 | Compare two scenarios side by side from the same camera, with their counts. | — |
| SCN-07 | S | 2 | Scenarios can be tagged as an evening phase (Dinner, Party). | — |
| SCN-08 | M | 1 | Export / import a scenario as a JSON file. | Round trip restores it exactly. |
| SCN-09 | M | 1 | Work is never lost on refresh or connection loss (local draft until saved). | — |

### 5.9 Export — EXP

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| EXP-01 | M | 2 | Export the layout for the venue as PNG and PDF: top-down plan, table numbers, seats per table, totals, legend, date, note "approximate dimensions, for discussion". | Readable when printed on Letter paper. |
| EXP-02 | M | 2 | Save the current view as an image. | — |

### 5.10 Access and platforms — ACC / PLT

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| ACC-01 | M | 2 | One shared password protects the app. Session lasts 30 days per device. | Wrong password is rate-limited. |
| ACC-02 | M | 1 | Not indexed by search engines. | `noindex` header present. |
| PLT-01 | M | 1 | Desktop Chrome, Safari, Edge (last 2 versions); iOS Safari 17+; Android Chrome. | — |
| PLT-02 | M | 1 | Phone: everything works; the layout adapts (bottom tab bar, bottom sheet inspector). | Usable one-handed for viewing, presets, upload and dragging. |
| PLT-03 | M | 1 | Quality adapts to the device; phones load a lighter scene. | — |

## 6. Non-goals

Photoreal rendering; exact replicas from a single photo; automatic image-to-3D (could be proposed later with cost); real-time co-editing; seating chart; capacity or code compliance; mezzanine/terrace/bistro planning.

## 7. Open questions

Tracked in `PROJECT_STATUS.md`.
