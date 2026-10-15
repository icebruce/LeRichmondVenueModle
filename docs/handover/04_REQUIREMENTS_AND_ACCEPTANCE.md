# Product requirements & acceptance tests

## P0 — Required MVP (first usable tool)

### Venue & camera
- One realistic, recognizable, calibrated-ish 3D scene of **main restaurant floor ONLY**, based on references manifest. Model fixed floor/levels/bar/walls/windows/ceiling/lighting and key furniture/materials. Set optimistic but honest expectations of fidelity.
- Dollhouse/isometric orbit, flat 2D plan, guest-eye walkthrough, camera presets (entrance, window dining, bar, dance floor) with smooth switching; hide/clip obstructing walls or ceiling in dollhouse view.
- Night/evening and day lighting modes with believable exposure and shadowing. All major decorative lights visually present even if expensive real-time light sources are approximated.

### Event layout manipulation
- Object palette: round 4/6/8/10-person tables, 6–12-person long/banquet tables, chairs, standing cocktail tables, food stations, DJ console, configurable rectangular dance floor, backdrop, décor props.
- Click object to select; drag to move on appropriate floor level; rotate, duplicate, delete; snap-to-grid optional (small grid increments); display metric dimensions, object count, exact guest seat count.
- Furniture should be removable/rearrangeable without changing locked architecture. Prevent furniture falling through floor or clipping into raised platforms on drag. Provide an `undo/redo` history.
- Guest count slider or control changes **actual visible 3D humans** (seated/standing blend) using reasonably diverse neutral silhouettes with correct scale and collision avoidance. Display seats, seated people, standing people and remaining seats separately. Random distribution reproducible per seed. Guest silhouettes not individual identity modeling.
- Create / duplicate / rename / delete / restore named scenarios and persist on refresh. Export/import layouts as JSON.
- Advisory clearance heat/footprint overlays and warnings on overlap, blocked door/step, too-narrow aisles; thresholds can be changed. Never label these as legally compliant or not.

### Styling
- One-click presets for linens: white, ivory, champagne, black, bare natural wood; options apply to selected or all compatible tables.
- Candle presets: none, short votive, mixed pillar, tall taper; group on table with automatic layout and quantity.
- Florals: none, low cluster, tall arrangement, greenery; appropriate shadows and believable proportions. At least 2 chair finishes and a subtle elegant evening lighting preset.
- For a selected table, adjustment uses a compact inspector; bulk changes use an `Apply to all tables` toggle.

### Premium usability
- Room view dominates the screen. Minimal sidebar navigation: Venue, Layout, People, Décor, Assets, Compare; contextual inspector rather than permanent tools everywhere.
- Place common items via drag from library or click-to-add, rotate with visible handle, adjust size with a slider or fields (not vertex editing).
- Clear empty/loading/error states, `reset camera`, help hints, sensible labels, keyboard support for undo/redo/delete, smooth camera with no nausea.
- 30–60fps target on representative modern desktop at modest object counts; graceful lower-detail mode when heavy.

## P1 — After MVP is credible
- **Reference asset import** from file drop/screenshot/pasted URL/product web page: see `05_ASSET_IMPORT.md`.
- Moodboard drawer with imported images, preview and drag to room. Hybrid approximation modes: material, 2.5D cutout/billboard, parametric scene object, existing GLB/GLTF.
- Saved camera comparisons, duplicate scene variation, side-by-side snapshots, photo-match source-to-render comparison, image export.
- Import/export source geometry estimates/assumptions, optional adjust calibration view.
- Better guests: seated gestures, mild variation, light clothing palette, group clusters and density maps.

## P2 — Only if useful
- Fully automated image-to-3D using authenticated licensed model generation endpoint (not a magic guarantee); video flythrough export; cloud sharing; advanced seating name assignments; VR. Avoid building these before basic configurator works.

## Behavior examples (acceptance checks)
1. Open 3D room; identify central bar, black-framed windows, wood beams, floor-zone differences and short main-floor steps.
2. Select a round table, rotate 90°, move from dining zone to appropriate clear patch, duplicate it. It does not pass through fixed bar/wall. Undo works.
3. Increase people from 20 to 70; number of 3D people changes and seated-vs-standing counts stay logical; view remains usable.
4. Switch all tablecloths from white to champagne and candle preset from no candles to warm votives; geometry/material updates without losing placements.
5. Move and resize the dance floor; object overlay warns if it overlaps bar, wall, stairs or furniture.
6. Save named `Layout A`, change arrangement, save `Layout B`, refresh browser, both remain with correct objects/styles, switch cleanly.
7. Paste a product URL or drop screenshot of a floral centerpiece; preview image appears, user selects approximate dimensions (e.g. 40cm x 60cm) and display mode; a reusable item appears in catalog and can be positioned on tables. UI honestly says **2D reference/approximate 3D/true imported 3D**.
8. Walk at eye level through aisle and around bar; human and furniture scale feels realistic. No collision/through-wall camera defects under normal navigation.
9. Check night scene; candles glow pleasantly and render remains performant without excessive washout or flicker.
10. Open architecture menu: no editable/playable mezzanine, bistro or terrace.

## Not accepted
- Generic plain rectangular white-room placeholder considered “finished”; 3D camera only with no manipulable objects; AI-generated flat composite pictures masquerading as navigable 3D; fixed hard-coded furniture positions; disappearing saves; magic link-to-3D promises; fake capacity compliance; accidentally modeling the terrace.