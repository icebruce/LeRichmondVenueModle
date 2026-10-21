# Richmond Studio — Project Status

**Current stage:** Steps 1, 2, 3a, 3b and 4 merged (PR #1–#4, #6, #8–#14); step 4 is the polish from the owner's test on laptop and phone (2026-10-17), as PRs 4A–4G. See **Next steps** below. Site: `richmondatudio.vercel.app` (Vercel project name as created).
**Wedding:** 2026-11-21 · ~75 guests (may change) · **Target:** steps 1–2 usable by ~2026-11-01, freeze ~2026-11-10.

## Steps

| Step | Delivers | Requirements | Gate | State |
|---|---|---|---|---|
| 0 | Docs restructure, `.claude` agents/skills/hooks, lo-fi mockup with venue map | — | Owner approves mockup | Done |
| 1 | Tooling scaffold; recognizable evening venue; three cameras; tables/chairs/dance floor/DJ; counts; F01 scenario; local scenarios + JSON; deployed preview | VEN-01..04, CAM-01..03, CAM-05, LGT-01..03, LAY-01..07, LAY-09..11, SCN-01, SCN-08, SCN-09, ACC-02, PLT-01..03, LIB-01, LIB-02 (oval-back), LIB-03 (basic), LIB-11, LIB-12 | Owner recognizes the room; layout usable | Done (merged 2026-10-16) |
| 2 | Shared login + cloud scenarios, conflicts, notes, compare; people; décor presets; advisories; layout export | ACC-01, SCN-02..07, PPL-01..03, DEC-01..05, LAY-08, LAY-12, VEN-05, EXP-01..02, LIB-02..06 (step-2 parts) | Both partners use it on laptop and phone | Done (merged 2026-10-16) |
| 3a | Library completion: cake, gift and station tables; plants; lights; floral installations; signs; event pieces; lounge armchair and loveseat; Sit here view | LIB-01, LIB-02, LIB-06 (step-3 parts), LIB-07, LIB-08, LIB-09 (all but the owner's print), LIB-10, LIB-11, LIB-12, CAM-04 | Owner approves the pieces and Sit here on the preview | Done (merged 2026-10-16) |
| 3b | Inspiration import; custom model requests; framed print from the owner's photo | IMP-01..07, REQ-01..04, LIB-09 (print) | Owner imports a real centrepiece; one custom request delivered | Merged 2026-10-16; gate open |
| 4A | Behaviour fixes: 0.70 m per guest, dance area outline, lights up to the ceiling, communal table toggle removed, automatic request status, refusals as toasts, no pull-to-refresh | LIB-01, LIB-08, LAY-04, LAY-09, LAY-12, REQ-02 | Checks and reviews pass | Merged (PR #8) |
| 4B | Venue revision: bar, garage doors, west wall, platform and stair, sample plan re-fit | VEN-01, VEN-04, LAY-09, LAY-11, LAY-12 | Fidelity review; owner recognizes the room | Merged (PR #9) |
| 4C | Navigation: desktop rail + wide panel (option 1), Room and Plans sections, checks popover, selection toolbar; phone controls, sheet gestures, back | PLT-02, PLT-04, LAY-08, SCN-01..06 | UX review | Merged (PR #10) |
| 4D | One library: search, thumbnails, Yours, drag into the room | LAY-01, LIB-13, IMP-06, REQ-01..02 | UX review | Merged (PR #11) |
| 4E | Style: summary rows and pickers; candle mix (up to 3 kinds with counts), laid out clear of the settings | DEC-01..05, LIB-05, SCN-08, PLT-03 | UX review; phone budget | Merged (PR #12) |
| 4F | Light height handle in 3D | LIB-08 | UX review | Merged (PR #13) |
| 4G | Owner feedback, round 2: phone sheet scrolls at half; venue revision (platform, stair, south wall, garage doors); candle settings per kind and per group | PLT-02, VEN-01, VEN-04, LAY-11, DEC-02, LIB-05 | UX and fidelity review; owner approves the candle mock-up | Merged (PR #14; owner approved on the preview, 2026-10-17) |

## Decisions

- Main floor only; mezzanine front edge allowed solely as DJ option 3 spot (owner-approved).
- No measurements will be supplied; dimensions are inferred and edited in data by Claude (ADR-7).
- F01 venue plan is a sample; tables seat up to 14. No seating chart.
- Desktop and phone, two partners, one shared password; async collaboration with conflict detection (ADR-3, ADR-4).
- Hosted on Vercel free plan; repository stays public; no third-party images in Git (ADR-6).
- Visual target: atmospheric and close, not photoreal; dollhouse cutaway style per owner samples; evening candlelight default, daylight toggle.
- Lighting: hybrid from visual stage V2: the fixed room baked in Blender, movables live (owner, 2026-10-17; ADR-2, LGT-03). Until then, live lighting.
- Docs structure and tooling chosen on their merits; WeddingRunbookPlanner was a reference only.
- Pull request per step with Vercel preview for owner review.
- Visual upgrade (look and performance) is a separate track in `VISUAL_STATUS.md`, finishing before the freeze; no visual merges after 2026-11-07 (owner, 2026-10-16; supersedes PR #7). Plan v3 (owner, 2026-10-18): stages V0–V7 with validation per stage, hybrid baked room light, an asset quality bar (low-poly allowed, never broken) and people last within a fixed people budget; path-traced stills stay out.
- Library: ~90 items across tables, chairs, linens, tableware, candles, florals, plants, lights, signs, event pieces; custom pieces added later through in-app requests built by Claude (owner-approved 2026-10-15).
- Stair has two flights (owner, 2026-10-16): entrance landing east to a turn landing at the east wall, then back west up to a head landing on the mezzanine edge; the raised floor's south step moved west beside it.
- Main chandelier is a dense cluster of short brass cylinders with bare bulbs (owner, 2026-10-16).
- Phone sheet peek is 164 pt (owner, 2026-10-16; DESIGN_GUIDE §3.2).
- Stair direction (owner, 2026-10-16): first flight rises toward the street-window (east) wall, the second turns back inward toward the mezzanine. **Superseded 2026-10-17**, see below.
- Advisory text uses its own darker amber token (`--advisory-ink`) for contrast; `--advisory` stays for dots and outlines (2026-10-16).
- Runners lie along long tables and across round ones (not on cocktail tables); their ends hang outside the tablecloth (2026-10-16).
- LIB-03 "drapery panels" is a placeable drapery backdrop (fabric panels on a frame), e.g. behind the sweetheart table; runners also run across round tables (owner confirmed, 2026-10-16).
- Step 3 ships as two PRs: 3a library completion + Sit here, 3b inspiration import + custom model requests (owner, 2026-10-16).
- Imported photos are stored in Upstash with the scenarios, shrunk to ≤ 500 KB first; no new service (owner, 2026-10-16).
- Step-3 pieces (plants, lights, floral installations, signs, event pieces, cake and gift tables) are data plus small generators drawn with the shared instanced primitives; hanging and ceiling pieces never block the floor. Lights glow through emissive bulbs and soft beams, not real lamps (phone budget). The framed print from the owner's photo moves to 3b (needs photo storage).
- Sit here: select a table → "Sit here" → tap a chair; the view sits at 1.2 m facing the table, look-around only; "Stand up" or Esc returns (owner-approved 2026-10-16; CAM-04 row updated). The library category chips, seat targets and seated bar are approved too.
- Floral installations take a flower type like table arrangements; on installations it changes bloom size, leaves and leaf colour, never adds blooms (budget) (owner, 2026-10-16).
- Step 3a merged (PR #3, 2026-10-16).
- Step-3 pieces are built to their catalogue size (`sizeM`); plant species proportions are data. A hanging or projected piece over a table gives the first click to the table; with the table selected, the next click reaches the piece (2026-10-16).
- Step 3b is a second PR on its own branch, stacked on 3a (owner, 2026-10-16).
- Exact 3D (GLB) import is deferred; exact models come through custom requests that Claude builds (owner, 2026-10-16).
- Imports: the photo picks the closest built-in model by proportions, real height and colour; results are labelled Material, Approximate 3D or Photo preview; imported items are shared, never edited after saving, and only removed from the lists. Prints and photo previews show the couple's photo; "Sign or print" makes a framed print on an easel (2026-10-16).
- Custom requests: the requests token is read-only (spec REQ-03). Status is automatic: "Requested", then "Ready" once a built-in entry carries the request id; nobody sets it by hand (owner, 2026-10-17; replaces the 2026-10-16 "In progress" set by the couple).
- Lounge armchair and loveseat (LIB-02 step 3) are placeable pieces in a "Lounge" library category, not table chairs (2026-10-16).
- Phone compare: the two halves stack above the sheet; the half-height sheet stays at peek while comparing (2026-10-16).
- Tablecloth length, place settings, menu cards and table numbers apply to every table; linens, runners, candles, florals, chairs, chargers and napkins can differ per table (2026-10-16).
- Reference views (Venue panel) show the room at eye level with full walls and ceiling; the dollhouse cutaway applies only to orbiting (2026-10-16).
- New items are added at the centre of the current view.
- Owner test feedback (2026-10-17), all owner-approved:
  - Rectangular tables allow 0.70 m of edge per guest (was 0.75).
  - The dance floor is a dance area: a subtle outline on the floor, resizable, no finishes.
  - The communal high table toggle is removed (the table is gone for the wedding); bar stools stay as a toggle: 5 at the front, 6 on each side.
  - Hanging and ceiling lights hang from 2.2 m to just under the ceiling; a 3D handle raises and lowers them (4F).
  - Custom request status is automatic (Requested → Ready).
  - Refused changes always show a toast with the reason.
  - Venue: bar ≈ 3.6 m front × ≈ 5.5 m long (modelled ≈ 3.4 × 5.7 m so the 12-seat tables keep ≈ 1.2 m to the doors and ≈ 1 m to the bar), its front moves south so bar front to kitchen wall is ≈ 6.3–6.5 m; west wall = two garage doors ≈ 6.3 m each with a 0.6 m divider, starting at the north end, a small wall at the south end; no green panel or exit door on the west wall; the platform runs up to the stair with no gap and its only entrance is beside the bar; the stair's first flight starts ≈ 2 m right of the entrance, runs east to the street wall and turns 90° right up to the mezzanine; railings stay metal.
  - Sample plan: 12-seat tables (6 per side) beside the garage doors, perpendicular to them, with ≈ 1 m walkways.
  - Navigation (desktop option 1): a labelled rail on the left (Room · Add · Style · Guests · Plans) with a 400 px panel (360–520 px, collapsible); Compare becomes Plans (switch, new, duplicate, rename, history, compare, notes, export, files, delete); the plan name stays small in the desktop toolbar and is off the phone screen.
  - Phone: camera menu, lighting and reset in a top-right stack with an undo/redo stack under it; the sheet steps down by swipe to closed; system back steps out of menus; no pull-to-refresh; Style pickers work at half height; adding drops the sheet to peek with the piece selected.
  - Add vs Style: Add places objects; Style dresses tables. One search in Add; table dressing found there offers "Use on tables".
  - Add: "Can't find it?" opens Yours, where a custom model can be requested from scratch (no item behind it); on desktop a picture can be dragged into the room and lands exactly where it is dropped, or is refused with the reason.
  - Candle mix: up to 3 kinds per table, each with a count, arranged automatically.
- Owner feedback, round 2 (2026-10-17):
  - Phone sheet: at half height its content scrolls; only the grabber opens it full. From peek, a swipe up on the content still opens half.
  - Candles: sizes for each kind in cm (pillars and floating vases a height each, a width; tapers and their holder; votives, hurricanes and lanterns; one Candelabra with 1, 3 or 5 arms in place of the 3- and 5-arm pieces, which stay only so older plans and imports still show); with two or more candles, Shuffle (or tallest in the middle) and a rotation of the group in 15° steps; they follow Apply to. The count stays on the Candles page. Mock-up `docs/mockups/candles.html` approved; in-app hints kept to one short line (owner).
  - Venue (supersedes "bar front to kitchen wall ≈ 6.3–6.5 m" and "garage doors ≈ 6.3 m"): the raised floor's straight railing after its step 1.7 → 1.1 m, so the platform and the stair move 0.6 m north; the south (kitchen) wall moves 1.4 m north (bar front to kitchen wall ≈ 5.05 m, room ≈ 16 × 12.9 m, entrance landing ≈ 1.0 m); both garage doors ≈ 5.6 m, keeping the 0.9 m small wall at the south end; the mezzanine edge, DJ option 3, the cameras and the sample plan move with the wall.
  - Phone back (supersedes "never leaves the app"): steps back through everything open, latest first (menus, dialogs, Add › Yours steps, compare, walking or Sit here, checks, selection, pages, the sheet a height at a time); with nothing open, a "Leave Richmond Studio?" dialog with the save state, Stay first. History is only added after a tap, so browsers keep it.
  - DJ option 2 beside the kitchen pass, for now.
- Venue layout confirmed by owner (2026-10-15): raised floor east of the bar; entrance corridor + stair landing in the SE; kitchen behind the south wall with the pass as an opening; mezzanine above kitchen + corridor; sweetheart table against the south wall; communal high table and bar stools removed.

## Next steps (2026-10-16)

Where things stand:

- **Step 3b** merged (PR #4, 5665b3b).
- Open items closed (2026-10-16): a request's photos upload only when the request is sent, so an abandoned form leaves nothing in the cloud (REQ-01); evening visual baseline with every light type (LIB-08).
- `LIBRARY_REQUESTS_TOKEN` is set in Vercel and in the Claude environment; verified from here: `GET /api/library-requests` with the token answers 200 (cloud store configured), no requests yet.

To do, in order:

1. First real custom request (req-f6462824, "Candles") read with the token and built: `candle-sand-trio`, three glass cylinders of candle sand (20 / 25 / 30 cm, owner's sizes) on a eucalyptus ring with baby's breath. Owner: review the PR preview and merge; the request then shows "Ready" (REQ-03 acceptance).
2. Owner: on the deployed site, save a scenario (first shared save exercises Upstash scripting) and check an import on the second device. Claude cannot sign in, so these stay owner checks.
3. Owner gate for step 3: import a real centrepiece; the custom request delivered.
4. Step 4 (owner feedback of 2026-10-17): merged as PR #8–#13 (2026-10-17). Owner checks on a real phone: no pull-to-refresh, the back gesture steps out of layers, the sheet swipes down a step at a time, cloud saves; visual sign-off of the Add library, Style pages and light handle (marked pending in DESIGN_GUIDE). Freeze around 2026-11-10.
5. Visual track (`VISUAL_STATUS.md`, plan v3): V0 built in PR #16 (on-demand rendering, shadows drawn once, constant light set, no shader compiles on switches, graphics tiers with Auto, `?perf` and benchmark scenes, asset pipeline and checks). Owner: approve the graphics setting mock-up, read `?perf` on the laptop, iPhone 16 and Galaxy S24, merge; then V1. V1 (room model and surfaces) and V2 (baked room light, evening and daylight, contact shadows; `npm run bake`) built on top, one PR each after #16 merges; V1 (#17) and V2 (#18) merged and approved (2026-10-18): dollhouse lens 20°, back bar off the wall with the restroom corridor half behind it, west wall dado like the back-bar wall, the fidelity review's heights. Owner: V3 to V6 one PR each, stop before V7. V3 (bar and back bar, bar flowers VEN-06) built. Owner (2026-10-19): the evening light is too flat and the graphics setting shows no change, so a light rework (V2b) comes before V4; Meshy approved for chairs, flowers, plants, chandeliers and other quality gains. V3 merged (#19). V2b (warmer, darker evening; contact occlusion baked into the room and its fixed furniture; outline contact shadows for tables, chairs and décor) in #20, approved by the owner (2026-10-19). V4 (draped cloths, lap cloths in points at a rectangle's corners, Meshy chairs on High, High triangle budget 2.0 M) merged (#21). V5 (Meshy blooms and plants, plants on phones too, tableware, number cards, candle pools, Photo mode; phone draw-call budget 155) merged (#22). V6 (chandeliers, scroll-panel railings, curtains, sill greenery; terrace canopy and fixed figs dropped, terrace light points kept at night) merged (#23). V7 (people) built 2026-10-21: a man and a woman (Meshy, 96 of 180 credits) in four poses each, close-ups approved by the owner, recoloured per guest, one draw call for all guests, light and see-through in the overview. Owner: review the room on the preview and merge. Meshy-generated models may be committed (owner, 2026-10-18).

## Step 1 quality (2026-10-16)

- Tests: 39 unit, 14 browser (desktop + phone), 4 visual baselines; all 33 step-1 must-haves traced (`npm run check:trace`).
- Scene budget, measured: 119 draw calls / 143k triangles (desktop tier), 106 / 76k (phone tier); budgets 250 / 1.5 M and 150 / 600 k. Measured without people (step 2).
- Reviews run: UX (Apple-level bar), venue fidelity against R01/R03/R09/UV01/UV02, spec/code. First round: UX 3 blockers, spec 3 blockers, fidelity borderline. Fixed this round: phone sheet and top bar, selection and drag feedback, 44 px targets, panel-aware framing; linen white/ivory and floor/lap length; data-driven library (generators, options-driven inspector, phone versions); alignment snapping; walk collisions in the domain (bar, tables, railing, venue furniture); exact reference-view cameras; toast Undo only undoes its own step; saved scenarios kept when unreadable and never overwritten by `?fresh`.
- Venue changes from the fidelity review: garage doors side by side (0.6 m pier); south wall dark green to 3.8 m; bar shortened to z 7.2; 4th street window; red-brick dado on north and east walls; honey deck, darker beams; brighter back bar; tiered brass chandelier.
- Second fidelity round (verdict before it: borderline): R03, R09 and UV01 cameras re-aimed; ceiling 7.2 → 6.5 m and garage-door heads 3.9 → 4.4 m (ratio M, split between the two L); one steel girder and one duct removed; bar south edge → 6.4 m (about square); wine wall moved to the back bar's east end; west EXIT beside garage-south with green panelling to it; deeper mezzanine fascia; street windows off-white, three panes wide; lit kitchen behind the pass.
- A polished build is not proof of fidelity: the owner's recognition check on the preview is the gate.

## Step 2 quality (2026-10-16)

- Reviews: UX 2 blockers / 11 majors, spec 2 blockers / 5 majors; all fixed. Highlights: compare panes beside the panel with their own names and counts; aisle advisories outline the real gap with a "≈ 0.7 m" label, live while dragging; plan export at 300 dpi with ≥ 8 pt text; atomic saves and deletes on the server (two saves of one revision can no longer both win); login limit counted before the password check; a lost create reply, a new device's untouched venue sample and deletes over a partner's newer save are handled; checks count shown venue furniture (LAY-12).
- Budget test now uses the heaviest décor (tall arrangements, 5-arm candelabra, chiffon runners, full settings with napkins, menus and numbers) on 15 round tables with 150 guests.

## Verified vs inferred

See `references/venue_evidence_matrix.md` (§2 features, §4 dimension ranges, §5 corrections to the original handover).

## Open items

- Raised floor height; stair tread count. The EXIT door and tufted banquettes the fidelity review read at the west end of the green south wall (R04, owner photo 1) are not modelled for now (owner, 2026-10-18).
- The stair and mezzanine balustrades are plain iron bars; the photos show scrolled iron panels (look only).
- Fidelity (2026-10-17, look only): done in visual stage V1: the mezzanine overhang over the entrance, lime tread glow, a dimmer kitchen pass.
- Sample plan (4G): with the south wall 1.4 m north, the dance area moves in front of the bar, 3.9 × 3.1 m (≈ 12 m², just above the ≈ 11.8 m² suggested for 75 guests), clear of the kitchen pass and the corridor, ≈ 0.75 m from the bar front (the bar stools, when shown, take that walkway); the sweetheart table stays against the south wall at x 3.0, beside DJ option 1. Plans already saved keep their pieces; any now past the wall show "outside the room — move it". Confirm at the visual review.
- Camera presets are approximate; R01, R03 and R09 were re-aimed in 4B (R01 now from the stair turn). Re-aim if the owner does not recognize them.
- Phone: tap-and-hold drag, two-finger twist and the joystick need a check on a real phone (pointer handling is tested in software only).
- Upstash scripting (`EVAL` with `cjson`) is used for atomic saves; verify on the first real preview save after setup.
- Main chandelier position (z) still unconfirmed.
- Advisory checks on the venue sample plan (estimates, 2026-10-17): the garage-door tables pass; the raised-floor tables have aisles of 0.4–0.8 m (setting 1.0 m), and the DJ at option 1 stands within 1.2 m of the glass doors. Worth confirming spacing with the venue.
- Venue (fidelity review, 2026-10-17, round 2): DJ option 2 moved beside the kitchen pass, west of it, facing the dance area (owner, "for now"); it reaches into the pass clearance (check ≈ 0.1 m) when chosen. The last street window (z 10.0–11.7) sits partly behind the turn landing (owner OK, 2026-10-17). Buff-brick piers and velvet curtains in R09 still read as red brick and timber (look only).
- Venue: table sizes for 8–14 seats.
- Request req-f6462824 was sent with 60 × 130 cm; owner chose 20 / 25 / 30 cm cylinders with greenery as part of the piece (2026-10-16).
- Videos V01/V02 and the Google Maps 360 tour remain uninspected (blocked from the cloud session).
- Cloud setup done by the owner (2026-10-16): Upstash, APP_PASSWORD, SESSION_SECRET, LIBRARY_REQUESTS_TOKEN. Token read verified from here; the first shared save and an import seen on the second device are owner checks (Claude cannot sign in).
- Phone draw calls in the dressed-room test: 153 of 155 (V6; 151 in V5; the budget was 150 until the owner moved the Meshy plants onto phones, 2026-10-20). Each piece with words or a photo, and each plant type, adds one draw call; watch it if many are placed.
- Manual gates for step 3: IMP-01 paste, drag-and-drop and the iOS Safari camera (only the file picker is tested in Chromium); REQ-03 one real request delivered through a PR; the owner's photo on a placed print seen on the preview (LIB-09 is tested at domain level and through a placed photo preview).
- Crop frame (DESIGN_GUIDE §4) pending owner approval.
- Owner checks on a real phone after step 4: no pull-to-refresh, system back steps out of menus, sheet swiping.

## Media ingestion (2026-10-15)

- 17 MAIN photos retrieved and reviewed in the cloud session (not committed). X05 link is broken.
- Owner-supplied stills U01–U05, clips UV01–UV02 and plan F01 reviewed (not committed).
- Collector scripts: `scripts/collect_venue_media.py`, `scripts/extract_video_frames.py`.
