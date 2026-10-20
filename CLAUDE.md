# Richmond Studio — working rules for Claude

Private web app for planning a wedding reception (2026-11-21, ~75 guests) at **Restaurant Le Richmond, 377 Rue Richmond, Montreal**: 3D venue, layout, décor, scenarios, shared by two partners on laptop and phone. Claude does all research, modelling, coding, testing and commits; the owner approves decisions and visuals.

## Scope guard (non-negotiable)

- Main restaurant floor only. Mezzanine = visible edge + stair, not a floor (only exception: DJ option 3 spot). Terrace = a backdrop through the glass (bright by day, dark at night with faint string-light points; owner 2026-10-19, 2026-10-20), never modelled. No bistro. Not Salon Richmond 1861.
- Terrace images (X01–X05) never inform geometry.
- Dimensions are estimates with confidence; never present them as measured. Layout checks are advisory; never claim code or capacity compliance.

## Source of truth — read the relevant doc before changing anything

| Topic | Doc (wins on its topic) |
|---|---|
| Behaviour, requirement IDs, acceptance | `docs/PRODUCT_SPEC.md` |
| Look, interaction, copy, review checklist | `docs/DESIGN_GUIDE.md` + `docs/mockups/` |
| Structure, layers, data model, budgets, ADRs | `docs/ARCHITECTURE.md` |
| Venue reconstruction method | `docs/VENUE_MODEL.md` + `references/venue_evidence_matrix.md` |
| Tests and traceability | `docs/TEST_STRATEGY.md` |
| Plan, stage, decisions, open items | `PROJECT_STATUS.md` |
| Visual upgrade track (look, performance tiers) | `VISUAL_STATUS.md` + `docs/visual/` |

`docs/handover/` is archived history, not a source of truth. If docs conflict or a spec is unclear, stop and ask; do not guess. Update a spec only for a real decision (new behaviour, contract or visual rule), stating the decision, not the reasoning trail.

## Coding standards

- Smallest maintainable implementation that fully meets the spec. No speculative abstraction, no duplication, no dead code.
- Respect the layer rules in `ARCHITECTURE.md` §3 (`src/domain` is pure). All scenario changes go through commands (undo for free).
- Validate only at real boundaries (venue data load, scenario import, API). TypeScript strict; no `any`.
- New runtime dependency = justification in the PR + entry in `ARCHITECTURE.md` §1.
- UI uses design tokens only; match the mockups; flag any new pattern before building it.

## Definition of done for a change

1. Requirement IDs named in the commit/PR; tests titled with those IDs.
2. Typecheck, lint, unit tests pass (enforced by the pre-commit hook); e2e/visual pass in CI.
3. Visible changes: screenshots at desktop 1440×900 and phone 390×844, reviewed by the `ux-reviewer` agent; venue changes also by `fidelity-reviewer`.
4. `PROJECT_STATUS.md` updated when a step's state, a decision or an open item changes.

## Workflow

- Small, reviewable commits on the working branch; one pull request per step with the Vercel preview link; the owner approves visuals before merge.
- Never commit third-party images, videos or guest photos (repo is public). Reference photos: `python scripts/collect_venue_media.py --photos-only` into gitignored folders. Blocked platforms (YouTube, Instagram, Google Maps 360): do not retry or bypass; ask the owner for screenshots or recordings (`references/VIDEO_360_OFFLINE_WORKFLOW.md`).
- No secrets in Git. Paid services or accounts are proposed to the owner before use.

## Commands

Defined in `package.json` once scaffolded (step 1): `npm run dev`, `npm run check` (typecheck + lint + unit), `npm run test:e2e`, `npm run test:visual`, `npm run build`.
