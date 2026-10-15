# Richmond Studio — Project Status

**Current stage:** Phase 0 — planning. References reviewed; plan under owner review. No app code yet.
**Wedding:** 2026-11-21 · ~75 guests (may change) · **Target:** layout + décor usable by ~2026-11-01, freeze ~2026-11-10.

## Milestones
- [ ] Step 0 — Docs/`.claude`/tooling restructure; lo-fi mockup (venue map + 7 screens + layout export) approved by owner.
- [ ] Step 1 — Recognizable evening venue, three cameras, tables/chairs/dance floor/DJ 1–3, seat counter, 75-guest scenario, deployed.
- [ ] Step 2 — Shared login, scenarios + notes, people, linen/candle/floral presets, layout export.
- [ ] Step 3 — Image upload → décor item, "Sit here" view, polish, performance.

## Decisions
- Main restaurant floor only. Mezzanine front edge allowed solely as a non-walkable DJ option 3 spot.
- Dimensions are inferred, confidence-tagged and editable by Claude in data; no measurements will be supplied.
- F01 venue plan is a sample: tables may seat up to 14. No seating chart (guest names) for now.
- Used on desktop and phone by the owner and their partner; hosted on Vercel (free plan).
- Repository stays public for now: reference images are not committed; observations live in `references/venue_evidence_matrix.md`.
- Quality target: atmospheric and close to the venue, not photoreal.
- The WeddingRunbookPlanner repo is a reference only; setup choices are made for this project on their merits.

## Verified vs inferred
See `references/venue_evidence_matrix.md` (§2 features, §4 dimension ranges, §5 corrections to the handover).

## Open items
- Owner: are tile and wood floors flush; what the "sample 3 rendering" visual reference is.
- Venue: table sizes for 8–14 seats; whether the communal high table and bar stools stay.
- Videos V01/V02 and the Google Maps 360 tour remain uninspected (blocked from the cloud session).

## Media ingestion (2026-10-15)
- 17 MAIN photos retrieved and reviewed in the cloud session (not committed). X05 link is broken.
- Owner-supplied stills U01–U05, clips UV01–UV02 and plan F01 reviewed (not committed).
- Collector scripts: `scripts/collect_venue_media.py`, `scripts/extract_video_frames.py`.
