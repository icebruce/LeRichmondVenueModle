# Richmond Studio — Project Status

**Current stage:** Steps 1 and 2 merged (PR #1, PR #2; owner-approved 2026-10-16). Step 3 built as two PRs: 3a (PR #3, CI green, awaiting owner review) and 3b (draft PR #4 stacked on 3a, reviews still to run). See **Next steps** below. Cloud saving needs the owner's one-time Vercel setup (README; not done yet).
**Wedding:** 2026-11-21 · ~75 guests (may change) · **Target:** steps 1–2 usable by ~2026-11-01, freeze ~2026-11-10.

## Steps

| Step | Delivers | Requirements | Gate | State |
|---|---|---|---|---|
| 0 | Docs restructure, `.claude` agents/skills/hooks, lo-fi mockup with venue map | — | Owner approves mockup | Done |
| 1 | Tooling scaffold; recognizable evening venue; three cameras; tables/chairs/dance floor/DJ; counts; F01 scenario; local scenarios + JSON; deployed preview | VEN-01..04, CAM-01..03, CAM-05, LGT-01..03, LAY-01..07, LAY-09..11, SCN-01, SCN-08, SCN-09, ACC-02, PLT-01..03, LIB-01, LIB-02 (oval-back), LIB-03 (basic), LIB-11, LIB-12 | Owner recognizes the room; layout usable | Done (merged 2026-10-16) |
| 2 | Shared login + cloud scenarios, conflicts, notes, compare; people; décor presets; advisories; layout export | ACC-01, SCN-02..07, PPL-01..03, DEC-01..05, LAY-08, LAY-12, VEN-05, EXP-01..02, LIB-02..06 (step-2 parts) | Both partners use it on laptop and phone | Done (merged 2026-10-16) |
| 3a | Library completion: cake, gift and station tables; plants; lights; floral installations; signs; event pieces; lounge armchair and loveseat; Sit here view | LIB-01, LIB-02, LIB-06 (step-3 parts), LIB-07, LIB-08, LIB-09 (all but the owner's print), LIB-10, LIB-11, LIB-12, CAM-04 | Owner approves the pieces and Sit here on the preview | In review |
| 3b | Inspiration import; custom model requests; framed print from the owner's photo | IMP-01..07, REQ-01..04, LIB-09 (print) | Owner imports a real centrepiece; one custom request delivered | In review |

## Decisions

- Main floor only; mezzanine front edge allowed solely as DJ option 3 spot (owner-approved).
- No measurements will be supplied; dimensions are inferred and edited in data by Claude (ADR-7).
- F01 venue plan is a sample; tables seat up to 14. No seating chart.
- Desktop and phone, two partners, one shared password; async collaboration with conflict detection (ADR-3, ADR-4).
- Hosted on Vercel free plan; repository stays public; no third-party images in Git (ADR-6).
- Visual target: atmospheric and close, not photoreal; dollhouse cutaway style per owner samples; evening candlelight default, daylight toggle.
- Live browser lighting only for now; pre-computed lighting only if the step 1 render falls short (ADR-2).
- Docs structure and tooling chosen on their merits; WeddingRunbookPlanner was a reference only.
- Pull request per step with Vercel preview for owner review.
- Library: ~90 items across tables, chairs, linens, tableware, candles, florals, plants, lights, signs, event pieces; custom pieces added later through in-app requests built by Claude (owner-approved 2026-10-15).
- Stair has two flights (owner, 2026-10-16): entrance landing east to a turn landing at the east wall, then back west up to a head landing on the mezzanine edge; the raised floor's south step moved west beside it.
- Main chandelier is a dense cluster of short brass cylinders with bare bulbs (owner, 2026-10-16).
- Phone sheet peek is 164 pt (owner, 2026-10-16; DESIGN_GUIDE §3.2).
- Stair direction (owner, 2026-10-16): first flight rises toward the street-window (east) wall, the second turns back inward toward the mezzanine — as modelled.
- Advisory text uses its own darker amber token (`--advisory-ink`) for contrast; `--advisory` stays for dots and outlines (2026-10-16).
- Runners lie along long tables and across round ones (not on cocktail tables); their ends hang outside the tablecloth (2026-10-16).
- LIB-03 "drapery panels" is a placeable drapery backdrop (fabric panels on a frame), e.g. behind the sweetheart table; runners also run across round tables (owner confirmed, 2026-10-16).
- Step 3 ships as two PRs: 3a library completion + Sit here, 3b inspiration import + custom model requests (owner, 2026-10-16).
- Imported photos are stored in Upstash with the scenarios, shrunk to ≤ 500 KB first; no new service (owner, 2026-10-16).
- Step-3 pieces (plants, lights, floral installations, signs, event pieces, cake and gift tables) are data plus small generators drawn with the shared instanced primitives; hanging and ceiling pieces never block the floor. Lights glow through emissive bulbs and soft beams, not real lamps (phone budget). The framed print from the owner's photo moves to 3b (needs photo storage).
- Sit here: select a table → "Sit here" → tap a chair; the view sits at 1.2 m facing the table, look-around only; "Stand up" or Esc returns. Differs from CAM-04's "tap any chair" (chairs are too small to tap reliably from the default view); awaiting owner confirmation before the spec row changes.
- Step-3 pieces are built to their catalogue size (`sizeM`); plant species proportions are data. A hanging or projected piece over a table gives the first click to the table; with the table selected, the next click reaches the piece (2026-10-16).
- Step 3b is a second PR on its own branch, stacked on 3a (owner, 2026-10-16).
- Exact 3D (GLB) import is deferred; exact models come through custom requests that Claude builds (owner, 2026-10-16).
- Imports: the photo picks the closest built-in model by proportions, real height and colour; results are labelled Material, Approximate 3D or Photo preview; imported items are shared, never edited after saving, and only removed from the lists. Prints and photo previews show the couple's photo; "Sign or print" makes a framed print on an easel (2026-10-16).
- Custom requests: the requests token is read-only (spec REQ-03); the couple sets "In progress" in the app, and "In library" shows once a built-in entry carries the request id (2026-10-16).
- Lounge armchair and loveseat (LIB-02 step 3) are placeable pieces in a "Lounge" library category, not table chairs (2026-10-16).
- Phone compare: the two halves stack above the sheet; the half-height sheet stays at peek while comparing (2026-10-16).
- Tablecloth length, place settings, menu cards and table numbers apply to every table; linens, runners, candles, florals, chairs, chargers and napkins can differ per table (2026-10-16).
- Reference views (Venue panel) show the room at eye level with full walls and ceiling; the dollhouse cutaway applies only to orbiting (2026-10-16).
- New items are added at the centre of the current view.
- Venue layout confirmed by owner (2026-10-15): raised floor east of the bar; entrance corridor + stair landing in the SE; kitchen behind the south wall with the pass as an opening; mezzanine above kitchen + corridor; sweetheart table against the south wall; communal high table and bar stools removed.

## Next steps (handover, 2026-10-16)

Where things stand:

- **PR #3, step 3a** (branch `ccr-32f95f5c-e6p10x`). CI green; Vercel preview ready.
  - Two UX and spec review rounds done.
  - Waits on the owner: approve the visuals and confirm the three items under Open items (Sit here flow, new UI patterns, flower types on installations).
- **Step 3b** (branch `ccr-32f95f5c-e6p10x-3b`, stacked on 3a). Draft PR #4; retarget it to `main` once #3 merges. Full suite: 30 browser tests pass locally.
  - Built: IMP-01..07, REQ-01..04 and the LIB-09 print.
  - Tests: 100 unit tests; browser tests include the import flow and a two-device share of an import and a request. 65/65 must-haves for steps 1–3 traced.
  - Not done yet: the UX and spec reviews (both stopped on a usage limit) and DoD screenshots. Screenshots were captured once, but not reviewed.

To do, in order:

1. Run the `ux-reviewer` and `spec-reviewer` on 3b. Fix their blockers and majors, rerun `npm run check`, `npm run build` and the full Playwright suite, push, then mark the 3b PR ready.
2. Owner: merge PR #3 after review, then retarget the 3b PR to `main`.
3. Owner: the one-time cloud setup (Upstash, `APP_PASSWORD`, `SESSION_SECRET`), plus `LIBRARY_REQUESTS_TOKEN` in Vercel and in the Claude environment (README). Then verify on the preview:
   - the first shared save (Upstash scripting);
   - an import seen on the second device;
   - one real custom request delivered through a PR (REQ-03 acceptance).
4. Owner gate for step 3: import a real centrepiece; one custom request delivered.
5. After step 3: freeze around 2026-11-10. No step 4 is planned; remaining work is the open items below and polish from owner feedback.

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

- Raised floor height and step positions; stair run and turn (evidence matrix §6).
- Camera presets R01/UV01 are approximate; re-aim if the owner does not recognize them.
- Phone: tap-and-hold drag, two-finger twist and the joystick need a check on a real phone (pointer handling is tested in software only).
- Upstash scripting (`EVAL` with `cjson`) is used for atomic saves; verify on the first real preview save after setup.
- Main chandelier position (z) still unconfirmed.
- Advisory checks on the venue sample plan (estimates): aisles between chair backs of 0.4–0.8 m in both rows at 8 per table (setting 1.0 m), and the DJ at option 1 within 1.2 m of the west exit door. Worth confirming spacing and the exit door position with the venue.
- Venue: table sizes for 8–14 seats.
- Videos V01/V02 and the Google Maps 360 tour remain uninspected (blocked from the cloud session).
- Owner's one-time cloud setup (Upstash + APP_PASSWORD + SESSION_SECRET) not done yet; sharing of imports and requests is tested against the local API until then. REQ-03's acceptance (one real request delivered through a PR) also needs `LIBRARY_REQUESTS_TOKEN` set in Vercel and in the Claude environment.
- Owner to confirm: the Sit here flow above (CAM-04); the three new UI patterns (DESIGN_GUIDE §4: category chips, seat targets, seated bar).
- Floral installations (arch, wall, pedestal, hanging) take a colour palette but not a flower type yet; table florals do (LIB-06). Raise with the owner whether installations need flower types.
- Phone draw calls in the dressed-room test leave about 11 calls of headroom under 150; each piece with words adds one. Re-measure in 3b.
- LIB-08 "visible effect in evening mode" is checked by unit test (bulbs, beams, glows) and by the evening screenshots in the PR; no evening visual baseline yet.

## Media ingestion (2026-10-15)

- 17 MAIN photos retrieved and reviewed in the cloud session (not committed). X05 link is broken.
- Owner-supplied stills U01–U05, clips UV01–UV02 and plan F01 reviewed (not committed).
- Collector scripts: `scripts/collect_venue_media.py`, `scripts/extract_video_frames.py`.
