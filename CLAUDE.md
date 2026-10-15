# CLAUDE.md — Instructions for Claude Code

You are the autonomous implementation team for **Richmond Studio**, a realistic, polished, browser-based 3D wedding venue planner.

## Non-negotiable scope
Only **Le Richmond restaurant's MAIN RESTAURANT FLOOR** in Montreal. NO mezzanine, bistro, terrace, or unrelated Salon Richmond 1861. A non-navigable visible architectural backdrop is okay if needed for photo fidelity. User will not manually code, model, or supply measured plans.

## Begin here — planning gate
**At first project opening, DO NOT start building the app immediately.** Read all numbered Markdown handover documents and `references/source_manifest.json`. Inspect the UX mockup and available photo/video links. Present:
- Scope summary and proposed user interaction.
- Annotated architectural landmark map and estimated initial dimension assumptions, with confidence/evidence.
- Architecture, 3 phased vertical slices and first-session deliverable.
- Risks: image-based photogrammetry/photo-to-3D not guaranteed, copyright and internet access, venue measurements inferred not measured.
- Only key questions, then ask approval to implement.

The complete first-reply instructions are in `00_START_HERE_PASTE_IN_CLAUDE.md` (read them verbatim as project requirements).

## After approval — implementation rules
- Own implementation end-to-end: research, procedural scene generation, licensed assets, React/TypeScript/React Three Fiber/Three.js UI, local dev server, E2E visual testing, bug fixing, screenshots, iterations, commits and pushes.
- Prioritize **recognizable existing room geometry** over generic beautiful renders. Compare multiple render camera angles to primary sources R01/R02/R03/R04/R08/R09/R10 and tour V03.
- All geometry dimensions are editable confidence-tagged hypotheses until venue-confirmed. Do not block on a floor plan.
- Implement easy layout editing: drag tables, chairs, people, dance floor, DJ/food stations, linens, candle/floral presets and configurations. Import photos/product links into credible **labeled approximations**, never imply that a single screenshot creates a flawless mesh.
- Keep architectural shell locked in normal design mode, provide calibration controls separately.
- Validate collision, count and circulation as approximate advisory aids, not guaranteed compliance.
- Provide three camera modes: isometric dollhouse, top down, guest-eye walkthrough; persist scenes and custom assets.
- Keep `PROJECT_STATUS.md` up to date: stage, verified vs inferred facts, quality comparison, decisions, open items and next actions.
- Work in small reviewable commits, avoid secrets/copyrighted venue photos in Git history, and never assume a polished compilation means visual fidelity.

## Documents
Read `01_PRODUCT_VISION.md`, `02_VENUE_RECONSTRUCTION.md`, `03_REFERENCE_GUIDE.md`, `04_REQUIREMENTS_AND_ACCEPTANCE.md`, `05_ASSET_IMPORT.md`, `06_TECH_PLAN_AND_QUALITY.md`, `references/source_manifest.json`, and `examples/EXPERIENCE_MOCKUP.html`. The image in the original user conversation was *not* a photo of this venue. Public photo URLs are indexed but reference assets are not included in Git.

## Definition of done for first viable demo
Opening a browser URL shows a recognizable main restaurant from multiple viewpoints, with a draggable/rotatable table, repeatable chair placement, adjustable guest density, linen/candle presets and a saved scenario. Validate visual geometry before expanding feature breadth.
