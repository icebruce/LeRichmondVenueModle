# Richmond Studio — Project Status

**Current stage:** Step 1 built and reviewed (2026-10-16); review fixes applied; awaiting the owner's recognition check on the Vercel preview. Step 2 not started.
**Wedding:** 2026-11-21 · ~75 guests (may change) · **Target:** steps 1–2 usable by ~2026-11-01, freeze ~2026-11-10.

## Steps

| Step | Delivers | Requirements | Gate | State |
|---|---|---|---|---|
| 0 | Docs restructure, `.claude` agents/skills/hooks, lo-fi mockup with venue map | — | Owner approves mockup | Done |
| 1 | Tooling scaffold; recognizable evening venue; three cameras; tables/chairs/dance floor/DJ; counts; F01 scenario; local scenarios + JSON; deployed preview | VEN-01..04, CAM-01..03, CAM-05, LGT-01..03, LAY-01..07, LAY-09..11, SCN-01, SCN-08, SCN-09, ACC-02, PLT-01..03, LIB-01, LIB-02 (oval-back), LIB-03 (basic), LIB-11, LIB-12 | Owner recognizes the room; layout usable | Built; at owner gate |
| 2 | Shared login + cloud scenarios, conflicts, notes, compare; people; décor presets; advisories; layout export | ACC-01, SCN-02..07, PPL-01..03, DEC-01..05, LAY-08, LAY-12, VEN-05, EXP-01..02, LIB-02..06 (step-2 parts) | Both partners use it on laptop and phone | Not started |
| 3 | Library completion (plants, lights, signs, event pieces, richer florals); inspiration import; custom model requests; Sit here view; polish | LIB-06..10, IMP-01..07, REQ-01..04, CAM-04 | Owner imports a real centrepiece; one custom request delivered | Not started |

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
- Reference views (Venue panel) show the room at eye level with full walls and ceiling; the dollhouse cutaway applies only to orbiting (2026-10-16).
- New items are added at the centre of the current view.
- Venue layout confirmed by owner (2026-10-15): raised floor east of the bar; entrance corridor + stair landing in the SE; kitchen behind the south wall with the pass as an opening; mezzanine above kitchen + corridor; sweetheart table against the south wall; communal high table and bar stools removed.

## Step 1 quality (2026-10-16)

- Tests: 39 unit, 14 browser (desktop + phone), 4 visual baselines; all 33 step-1 must-haves traced (`npm run check:trace`).
- Scene budget, measured: 119 draw calls / 143k triangles (desktop tier), 106 / 76k (phone tier); budgets 250 / 1.5 M and 150 / 600 k. Measured without people (step 2).
- Reviews run: UX (Apple-level bar), venue fidelity against R01/R03/R09/UV01/UV02, spec/code. First round: UX 3 blockers, spec 3 blockers, fidelity borderline. Fixed this round: phone sheet and top bar, selection and drag feedback, 44 px targets, panel-aware framing; linen white/ivory and floor/lap length; data-driven library (generators, options-driven inspector, phone versions); alignment snapping; walk collisions in the domain (bar, tables, railing, venue furniture); exact reference-view cameras; toast Undo only undoes its own step; saved scenarios kept when unreadable and never overwritten by `?fresh`.
- Venue changes from the fidelity review: garage doors side by side (0.6 m pier); south wall dark green to 3.8 m; bar shortened to z 7.2; 4th street window; red-brick dado on north and east walls; honey deck, darker beams; brighter back bar; tiered brass chandelier.
- A polished build is not proof of fidelity: the owner's recognition check on the preview is the gate.

## Verified vs inferred

See `references/venue_evidence_matrix.md` (§2 features, §4 dimension ranges, §5 corrections to the original handover).

## Open items

- Raised floor height and step positions; stair run and turn (evidence matrix §6).
- Stair: fidelity review (medium confidence) reads R09/UV02 as a second flight turning at the east-wall landing back west to the mezzanine front at 3.8 m. Not adopted: the owner described the stair climbing from the landing to the wall. Ask the owner at the step 1 gate.
- Camera presets R01/UV01 are approximate; re-aim if the owner does not recognize them.
- Phone: tap-and-hold drag and the joystick need a check on a real phone (pointer handling is tested in software only).
- Venue: table sizes for 8–14 seats.
- Videos V01/V02 and the Google Maps 360 tour remain uninspected (blocked from the cloud session).
- Image storage for imports: Upstash vs Vercel Blob, decided in step 3 from measured limits.

## Media ingestion (2026-10-15)

- 17 MAIN photos retrieved and reviewed in the cloud session (not committed). X05 link is broken.
- Owner-supplied stills U01–U05, clips UV01–UV02 and plan F01 reviewed (not committed).
- Collector scripts: `scripts/collect_venue_media.py`, `scripts/extract_video_frames.py`.
