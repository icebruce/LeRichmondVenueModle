# Richmond Studio — Product Specification

**Status:** Source of truth for behaviour · **Version:** 1.0 · **Date:** 2026-10-15
**Look and feel:** `DESIGN_GUIDE.md` (wins on look) · **How it is built:** `ARCHITECTURE.md`

---

## 1. Context

A private web app for one couple to plan their wedding reception at **Restaurant Le Richmond, 377 Rue Richmond, Montreal** on **2026-11-21**, for about **75 guests** (the number may change). Both partners use it, on laptop and phone, from one shared link.

The job: decide **where things go** (tables, dance area, DJ, stations), **how full it feels**, and **how it looks** (linens, candles, florals, chairs), then save alternatives, compare them and hand a clear plan to the venue.

Useful window: now until about 2026-11-10. Anything that does not help a decision before then is out.

## 2. Scope

**In:** Le Richmond's main restaurant floor, including the raised floor east of the bar; the mezzanine stair and mezzanine front edge as visible, non-walkable architecture; the terrace seen through the glass as a dark backdrop.

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
- **People** are stylised figures with mannequin heads, not lifelike humans: a man and a woman, seated with hands on the table or standing, each guest with their own outfit, skin and hair colours (V7).

## 5. Requirements

Priority: **M** = must, by the step shown · **S** = should · **C** = could. Steps are defined in `PROJECT_STATUS.md`.

Each requirement has an ID. Tests name the ID they cover (`TEST_STRATEGY.md` §2).

### 5.1 Venue — VEN

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| VEN-01 | M | 1 | The fixed room is modelled from `data/venue_geometry.json`: walls, glazed garage doors, street windows, brick, timber ceiling and steel beams, U-shaped bar and back bar, floors (tile / wood), raised floor east of the bar with its step edge and railing, mezzanine edge, stair from the entrance landing, south wall with kitchen pass opening, entrance corridor opening, chandeliers, paintings, banquettes, wine wall. | From the default dollhouse view and from the R01, R03, R09 viewpoints, the owner identifies the room as Le Richmond. |
| VEN-02 | M | 1 | Fixed architecture cannot be selected, moved or deleted in normal use. | Clicking a wall, the bar or the stair never selects it. |
| VEN-03 | M | 1 | No walkable or editable mezzanine, terrace or bistro. | Walk mode cannot leave the main floor; nothing can be placed outside it except at `LAY-11`. |
| VEN-04 | M | 1 | The raised floor east of the bar is a separate level with a visible step edge and railing. Items placed on it sit at its height. | A table dragged onto the strip rises to the strip level; one straddling the edge is refused. |
| VEN-05 | S | 2 | Paintings are swappable décor (current artwork by default). | Owner can hide or swap each painting. |
| VEN-06 | S | 4 | The two bar flowers (tall glass vases of white blossom branches, R02) stand on the bar top; the couple can slide each along the bar or hide both. Saved with the plan. | Owner hides them, shows them and slides one; the change is saved and undoes in one step. |

### 5.2 Cameras — CAM

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| CAM-01 | M | 1 | **Dollhouse**: orbiting 3/4 view, ceiling hidden, walls facing the camera cut low automatically, far walls full height. Default angle matches photo R01 (from south-east looking north-west). | Orbiting a full turn always shows the interior; no wall blocks the view. |
| CAM-02 | M | 1 | **Top-down**: orthographic plan for placing. | Tables keep their true proportions; labels readable. |
| CAM-03 | M | 1 | **Walk**: eye height 1.65 m; keyboard + mouse on desktop, touch joystick + drag-to-look on phone; cannot pass through walls, bar or tables. | Walking from the entrance to the dance area and around the bar works without clipping. |
| CAM-04 | S | 3 | **Sit here**: select a table, choose "Sit here", then tap one of its chairs to see the room from that seat. | View is at seated eye height (1.2 m) facing the table centre. |
| CAM-05 | M | 1 | Camera changes animate smoothly (≤ 600 ms); a Reset view control always exists. | No jump cuts; reset returns to the default angle. |

### 5.3 Lighting — LGT

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| LGT-01 | M | 1 | Evening mode (default): warm low light, glowing chandeliers and back bar, candle glow on tables, terrace glass dark with faint fairy-light hints. | Side-by-side with R08 the mood reads as similar. |
| LGT-02 | M | 1 | Daylight mode for clarity, one tap away. | Toggle switches in ≤ 1 s without losing state. |
| LGT-03 | M | 1 | Hybrid lighting (owner, 2026-10-17): the fixed room's light from the venue's own fixtures, direct and bounced, is pre-computed in Blender into light maps (evening and daylight); everything movable and every placed light stays live. Built in visual stage V2 (`VISUAL_STATUS.md`); until then live lighting only (`ARCHITECTURE.md` ADR-2). | CI fails when the light maps do not match the venue data; a mismatched bake at load falls back to live lighting. |

### 5.4 Layout — LAY

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| LAY-01 | M | 1 | Add any library item (`LIB`) in one tap; rectangular table length follows its seat count. | Each step-1 library item can be added and placed. |
| LAY-02 | M | 1 | Select, drag, rotate (handle + 15° snap; free with modifier), duplicate, delete. Multi-select on desktop. | Works with mouse and touch. |
| LAY-03 | M | 1 | Chairs are placed automatically around a table from its seat count. Changing seats re-arranges them. | A 12-seat rectangle shows 5 + 5 + 1 + 1 (sides + ends) or 6 + 6 (no ends), owner's choice per table. |
| LAY-04 | M | 1 | Items cannot overlap fixed architecture or each other; the move is refused with a visible cue, not silently clamped. | Dragging a table into the bar shows a red outline and returns it on release. |
| LAY-05 | M | 1 | Snapping to a 10 cm grid and to alignment with nearby tables; can be turned off. | — |
| LAY-06 | M | 1 | Undo / redo for every change (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, toolbar buttons). | 50 steps deep at minimum. |
| LAY-07 | M | 1 | Live counts: tables, seats, guests, guests without a seat, dance area size (m²). | Counts update on every change. |
| LAY-08 | M | 2 | Advisory checks with editable thresholds: aisle width between chair backs (default 1.0 m), clearance at entrance, stair, kitchen pass and glazed doors (default 1.2 m), dance area size vs guest count (default 0.45 m² per dancer, 35% dancing). Wording always says "advisory". A saved piece the room no longer fits (after a venue revision) keeps its place and is listed first (owner, 2026-10-17). | Narrowing an aisle below the threshold highlights it and names the issue. |
| LAY-09 | M | 1 | The venue sample plan (F01) is available as a starting scenario. | Loads 3×12 by the garage doors (6 a side, across the room; owner, 2026-10-17), 1×10 and 3×8 on the raised floor, sweetheart table against the south (kitchen) wall, dance area, DJ option 1; bar stools hidden. |
| LAY-10 | M | 1 | Tables are numbered automatically; numbers can be edited. | Numbers show in top-down view and in the export. |
| LAY-11 | M | 1 | DJ can be placed at three named spots, including the mezzanine front edge (option 3), or freely on the floor. | DJ option 3 sits on the mezzanine edge and is not walkable. |
| LAY-12 | S | 2 | The venue's bar stools can be shown or hidden per scenario; hidden by default (owner: removed for the wedding). The communal high table is gone for the wedding and is not modelled (owner, 2026-10-17). | Hidden stools free their floor area for the checks. |

### 5.5 People — PPL

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| PPL-01 | M | 2 | Guest count control (0–200, default 75). Guests fill seats first; the rest stand in open areas, never on the dance area during dinner phase. | 75 guests with 60 seats shows 60 seated + 15 standing and "15 without a seat". |
| PPL-02 | M | 2 | Placement is reproducible for the same layout and count. | Reloading shows the same people in the same places. |
| PPL-03 | M | 2 | 150 people + 15 tables stays smooth on a 2022+ laptop and phone (`ARCHITECTURE.md` §7 budgets). | — |

### 5.6 Décor — DEC

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| DEC-01 | M | 2 | Linens: white, ivory, champagne, black, navy, bare wood. Apply to one table, selected tables or all. | One tap applies to all; placements unchanged. |
| DEC-02 | M | 2 | Candles: none, or a mix of up to three kinds with a count each (1–8 per table), arranged for the table: along the centre of long tables, in a ring on round ones (owner, 2026-10-17), on the table top and clear of the place settings; candles with no room are left off and the Style page says on how many tables. Each kind has its own sizes in cm (pillars and floating vases a height each, a taper's holder, a candelabra's arms); with two or more candles the order can be shuffled and the group turned 0–180° (owner, 2026-10-17). Lit by default in evening mode. | Candles glow in evening and are visible but unlit-looking in daylight; "1 pillar + 3 tapers" shows four candles. |
| DEC-03 | M | 2 | Florals: none, low cluster, bud vases, tall arrangement, greenery runner. | Heights are realistic (low ≤ 30 cm, tall 80–120 cm). |
| DEC-04 | M | 2 | Chairs: any chair in the library (default: venue oval-back). | Swap per table or all. |
| DEC-05 | S | 2 | Per-table override and "apply this table's style to all". | — |

### 5.7 Library — LIB

The library is the single catalogue of everything placeable. Built-in items are adjustable models built in code (**P**) or CC0 models adapted to one consistent scale and look (**CC0**). Imported and custom items join the same library.

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| LIB-01 | M | 1 | **Tables** (P): rectangle 4–14 seats, round 4–10, wood farm table, sweetheart, cocktail high-top; step 3 adds cake, gift/card, buffet/station. **Event pieces** step 1: dance area (a subtle outline on the floor, resizable; no floor is laid — owner, 2026-10-17), DJ booth. Rectangle length allows ≈ 0.70 m of table edge per guest (owner, 2026-10-17). | Each placeable from the library in one tap. |
| LIB-02 | M | 1–2 | **Chairs** (P/CC0): venue oval-back (step 1), wood cross-back, white & gold, chiavari gold/silver/clear (step 2); lounge armchair, loveseat (step 3). | — |
| LIB-03 | M | 1–2 | **Linens** (P): tablecloth lap or floor length in any colour (step 1: white, ivory); runners velvet/chiffon/greenery, napkins, drapery panels (step 2). | — |
| LIB-04 | M | 2 | **Tableware** (P): chargers gold/silver/glass, plates, glassware set, cutlery, menu card, table number holder; instanced. | 15 fully set tables stay within budgets. |
| LIB-05 | M | 2 | **Candles** (P/CC0): votives, pillars (a height each), tapers + candlesticks, candelabra (1, 3 or 5 arms), hurricanes, floating candles, lanterns. Glow in evening. | — |
| LIB-06 | M | 2–3 | **Florals** (P): low mound, bud vases, tall arrangement on stand, compote, garland runner (step 2); hanging installation, arch, flower wall, pedestal (step 3). Flower types (table arrangements and installations): rose, peony, hydrangea, ranunculus, baby's breath, eucalyptus, pampas, blossom branches; colours chosen per arrangement. | Read correctly at table distance; generic up close is acceptable. |
| LIB-07 | M | 3 | **Plants** (CC0/P): fiddle-leaf fig, olive tree, kentia palm, monstera, fern, blossom tree. | — |
| LIB-08 | M | 3 | **Lights** (P/CC0): fairy/string lights, Edison strands, uplights with colour, pin spots, crystal chandelier, disco ball, DJ lights, projected monogram with custom text. Hanging and ceiling lights hang from 2.2 m up to just under the ceiling; once selected, a line drops from the light to the floor with its height, and in the 3D view on desktop a handle under the light raises or lowers it. | Visible effect in evening mode; dragging the handle changes the height in 0.1 m steps within its limits, as one undo step. |
| LIB-09 | M | 3 | **Signs and prints** (P): framed print or poster from the owner's image, welcome sign on easel, seating chart board, neon sign with custom text, table numbers. | Owner image renders on the print; text is editable. |
| LIB-10 | S | 3 | **More event pieces** (P): stage/riser, DJ booth fronts, backdrop, photo booth, food/dessert stations, bar module. | — |
| LIB-11 | M | 1 | Every item has: thumbnail, true metric size, size presets, placement rule (table / floor / wall / ceiling / hanging), a phone-weight version, source and licence; automated checks keep size, detail and licence within bounds. | Catalogue check fails CI on a missing field or a budget breach. |
| LIB-12 | M | 1 | Items are data-driven: adding an item is a catalogue entry plus a model or a preset of an existing model; no UI code changes. | Documented in the `library-item` skill. |
| LIB-13 | M | 4 | One library (Add, owner 2026-10-17): search across every category; pictures in a grid; table dressing found by search can be used on every table from there; "Yours" holds imports, ready custom models and requests; "Can't find it?" leads to a photo import or a custom request; on desktop a piece can be dragged into the room. | A search for a candle shows "Use on tables"; a piece dropped on the floor lands there. |

### 5.8 Inspiration import — IMP

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| IMP-01 | M | 3 | Add an image from the phone camera or photo library, by desktop drag-and-drop, or by paste. | Works on iOS Safari and desktop Chrome/Safari. |
| IMP-02 | M | 3 | Choose what it is (library family: linen, candle, vase/centrepiece, florals, chair, table, plant, light, sign/print, other). | — |
| IMP-03 | M | 3 | Crop to the object. | — |
| IMP-04 | M | 3 | Set real size in cm (width, height). | — |
| IMP-05 | M | 3 | The app suggests the closest library model in that family from the photo's colours and proportions; the owner can switch model and adjust its options. Results are labelled: *Material* (fabric), *Approximate 3D* (adjusted library model), *Photo preview* (photo standing at real size, for anything without a fitting model), *Exact 3D model* (imported GLB). | A photo preview is never labelled as 3D. |
| IMP-06 | M | 3 | Saved items join the shared library, placeable and reusable, applicable to all tables. | Survives reload and is visible to the partner. |
| IMP-07 | M | 3 | A pasted product link is stored as the item's source only; the app does not fetch web pages. | — |

### 5.9 Custom model requests — REQ

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| REQ-01 | M | 3 | "Request a custom model" from any imported item or library item, or from scratch in Add › Yours (owner, 2026-10-17): photos, real size, placement, notes. Stored privately in the app. | Request visible to both partners. |
| REQ-02 | M | 3 | Request status is automatic: Requested → Ready (once the built item is in the library), with a button to place or use it. Nobody sets it by hand (owner, 2026-10-17). | — |
| REQ-03 | M | 3 | Claude can read open requests with a read-only token (`LIBRARY_REQUESTS_TOKEN`, never in Git) or from photos attached in chat, build the item per the `library-item` skill, and deliver it through a pull request with a preview link. | A test request goes from Requested to Ready through one pull request. |
| REQ-04 | M | 3 | Reference photos in requests are never committed; only the models Claude builds are. | — |

### 5.10 Scenarios and collaboration — SCN

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

### 5.11 Export — EXP

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| EXP-01 | M | 2 | Export the layout for the venue as PNG and PDF: top-down plan, table numbers, seats per table, totals, legend, date, note "approximate dimensions, for discussion". | Readable when printed on Letter paper. |
| EXP-02 | M | 2 | Save the current view as an image. | — |

### 5.12 Access and platforms — ACC / PLT

| ID | Pri | Step | Requirement | Acceptance |
|---|---|---|---|---|
| ACC-01 | M | 2 | One shared password protects the app. Session lasts 30 days per device. | Wrong password is rate-limited. |
| ACC-02 | M | 1 | Not indexed by search engines. | `noindex` header present. |
| PLT-01 | M | 1 | Desktop Chrome, Safari, Edge (last 2 versions); iOS Safari 17+; Android Chrome. | — |
| PLT-02 | M | 1 | Phone: everything works; the layout adapts (bottom tab bar, bottom sheet, camera / light / reset and undo / redo stacked top right). The system back gesture steps back through the app (menus, dialogs, pages, the selection, the sheet a height at a time, walking) and, with nothing open, asks before leaving (owner, 2026-10-17); the sheet swipes down a step at a time to closed; at half height its content scrolls and only its head (grabber, counts line) opens it full; no pull-to-refresh (owner, 2026-10-17). | Usable one-handed for viewing, presets, upload and dragging. |
| PLT-03 | M | 1 | Quality adapts to the device; phones load a lighter scene. | — |
| PLT-04 | M | 4 | Desktop: a labelled rail (Room, Add, Style, Guests, Plans) beside a wide panel, resizable 360–520 px and collapsible; one toolbar row; a selection shows a toolbar beside it and its details open inside the current section (owner, 2026-10-17, `DESIGN_GUIDE.md` §3.1). | Choosing a section always shows it; Details has a way back. |
| PLT-05 | S | V0 | Graphics setting per device (Room › This device › Graphics): Auto (default; adapts to keep the room smooth), High, Balanced, Battery saver (phones only). Tiers change polish only, never lighting mood or models (owner-approved mock-up `docs/mockups/graphics.html`, 2026-10-18). | A choice applies at once and is kept on that device. |

## 6. Non-goals

Photoreal rendering; exact replicas from a single photo (exact pieces come through custom requests, `REQ`); automatic paid image-to-3D (could be proposed later with cost); real-time co-editing; seating chart; capacity or code compliance; mezzanine/terrace/bistro planning.

## 7. Open questions

Tracked in `PROJECT_STATUS.md`.
