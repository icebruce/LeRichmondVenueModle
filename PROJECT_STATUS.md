# Richmond Studio — Project Status

**Current stage:** Step 0 — docs, `.claude` setup and lo-fi mockup done; **waiting for owner approval of the mockup and venue map.** No app code yet.
**Wedding:** 2026-11-21 · ~75 guests (may change) · **Target:** steps 1–2 usable by ~2026-11-01, freeze ~2026-11-10.

## Steps

| Step | Delivers | Requirements | Gate | State |
|---|---|---|---|---|
| 0 | Docs restructure, `.claude` agents/skills/hooks, lo-fi mockup with venue map | — | Owner approves mockup | In review |
| 1 | Tooling scaffold; recognizable evening venue; three cameras; tables/chairs/dance floor/DJ; counts; F01 scenario; local scenarios + JSON; deployed preview | VEN-01..04, CAM-01..03, CAM-05, LGT-01..03, LAY-01..07, LAY-09..11, SCN-01, SCN-08, SCN-09, ACC-02, PLT-01..03 | Owner recognizes the room; layout usable | Not started |
| 2 | Shared login + cloud scenarios, conflicts, notes, compare; people; décor presets; advisories; layout export | ACC-01, SCN-02..07, PPL-01..03, DEC-01..05, LAY-08, LAY-12, VEN-05, EXP-01..02 | Both partners use it on laptop and phone | Not started |
| 3 | Inspiration import; Sit here view; polish; performance | IMP-01..07, CAM-04 | Owner imports a real centrepiece | Not started |

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

## Verified vs inferred

See `references/venue_evidence_matrix.md` (§2 features, §4 dimension ranges, §5 corrections to the original handover).

## Open items

- Raised east strip: extent, height and step positions (evidence matrix §6).
- Venue: table sizes for 8–14 seats; whether the communal high table and bar stools stay.
- Videos V01/V02 and the Google Maps 360 tour remain uninspected (blocked from the cloud session).
- Image storage for imports: Upstash vs Vercel Blob, decided in step 3 from measured limits.

## Media ingestion (2026-10-15)

- 17 MAIN photos retrieved and reviewed in the cloud session (not committed). X05 link is broken.
- Owner-supplied stills U01–U05, clips UV01–UV02 and plan F01 reviewed (not committed).
- Collector scripts: `scripts/collect_venue_media.py`, `scripts/extract_video_frames.py`.
