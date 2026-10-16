# Venue reconstruction — evidence, spatial hypotheses, dimensional reasoning

## Identity and boundaries
**Restaurant Le Richmond**, 377 Rue Richmond, Montreal. **NOT Salon Richmond 1861** (an unrelated event hall) and not Le Richmond Bistro. The model covers the principal indoor **ground restaurant floor only**. The main floor may contain subtle level changes and stairs. The **upper mezzanine** itself is OUT, regardless of whether a photo was taken from it. The terrace is OUT, though its large black-framed glazing/garage-style doors can be shown in the wall.

## What is visibly supported by the curated source images
- **Central bar / focal counter**: prominent multi-sided/angular light counter top with darker base, bar stools, bottles and back-bar shelving. Strong sources: R01, R02, R03, R07, R14.
- **Large dark-framed glazed bays** separating main room from outside terrace, grid mullions: R03, R04, R17. **Exterior garden in these photos is NOT the room to reconstruct.**
- **Dark timber / plank ceiling** with large exposed timber beams, black industrial steel trusses/ducts and dark cylinder pendants: R01, R02, R03.
- **Distinct flooring**: dark sizable square tile/panels with contrasting seams near bar/window side, and dark wood planking in adjacent dining zones: R01, R02, R03, R04, R08. Infer exact partition by reconciling multiple angles.
- **Railing, short level changes and steps**, located near the bar and adjoining raised seating zone. The photos show a small run of steps and railings. Do not assume these are the upstairs mezzanine; map independently: R01, R02, R11.
- **Tall street-facing windows, drapery, painted/brick wall and cage-like chandeliers**, plus dining banquettes: R05, R06, R09, R10.
- **Distinctive decorative lights**: exposed-bulb clustered chandelier above/around bar and larger suspended cage chandeliers in dining zones: R01, R02, R03, R04.
- **Art/brick backdrop** near bar: large color portrait painting and dark upholstered seating: R03, R07, R14.
- **Real wedding arrangement evidence**: tables may be long wood or white-clothed, mixed chair types, candles/florals of variable height, closely spaced banquet configurations: R06, R07, R08, R09, R10, R13, R16. These are variable configurations, not fixed architecture.

## Critical disambiguation
- Terrace wedding pictures are prominent on the official wedding gallery. X01–X05 are **out-of-scope spatial references**. Particularly dangerous: terrace ceiling twinkle lights, hanging planters, trees, retractable roof and brick patio. Do NOT model them as restaurant interiors.
- A raised area or staircase on the restaurant's ground floor is not the same as the mezzanine; include first-level architectural edges needed for accuracy, but don't create a second navigable floor.
- Mixed image dates (2023–2025) may show renovations, venue reset, temporary event installations. Where conflicts exist, prioritize the most recent clear architecture images (R01, R02) and corroborate in V03/other indoor photos.

## Dimension inference mandate
The user has explicitly authorized **intelligent estimates from visual references** rather than waiting for drawings. Claude must own this and must avoid repeatedly asking for measurements. Procedure:
1. Construct a **reference-shot ledger**: each photo's likely camera area, facing direction, approximate lens/FOV, known spatial features, possible contradictions. Group overlapping scenes.
2. Identify **scale anchors**, with reasonable everyday ranges and assumptions: interior doors ~0.8–1.0m wide x ~2.0–2.2m high; chair seat height ~0.44–0.48m; standard table height ~0.73–0.76m; bar counter height ~1.0–1.15m; handrail ~0.9–1.1m; standing adults nominal ~1.65–1.8m; repeat floor-tile/window modules. These are *assumptions*, not measured venue values.
3. Infer projected vanishing points, tile/window repeat rhythm and camera position. Estimate lengths as intervals, not precise facts. Use cross-photos to triangulate 3D positions. Where useful, perform interactive image registration: adjust a 3D camera to match the photo and minimize perspective/silhouette mismatch.
4. Use historical references to ~**3,200 sq ft (~297 m²)** loft-style space as a loose sense check only; provenance and ambiguity make it unsuitable as a fixed constraint on the main restaurant floor. **Neither main-floor area nor exact ceiling height is known.**
5. Start a **parameterized, plausible room** and refine based on images. If numerical initial values are needed before calibration, use low-confidence broad starting *ranges*, NOT assertions: ground-floor bounding rectangle ~13–17 m across x ~17–23 m deep; ceiling ~3.6–5.4 m; bar footprint ~3.3–5.8 m x ~2.8–5.0 m; short raised platform ~0.25–0.75 m high. These are deliberately wide placeholders. They are not verified, and the final room need not be rectangular.
6. Fit relative geometry/landmarks first. Use screenshot side-by-side comparisons from matching approximate camera angles and iterate. Save chosen meter-scale parameters to one `venue_geometry.json` and each value's confidence/provenance.
7. Provide a **Calibration** panel for rare corrections (overall width/depth, ceiling, bar, window bays, stairs/step rise) and show estimated-vs-verified metadata. Changing overall scale must resize anchored objects consistently and warn when layouts may need review.
8. Never compute official capacity from image count. Do not imply the scene guarantees legal circulation, service clearance, accessibility or fire exits. Spatial warnings are planning aids that need venue validation.

## Uncertainty log starter
| Feature | Evidence | Initial confidence | Why |
|---|---|---|---|
| Venue identity and location | Official website | High | Official listing |
| Central bar exists, dominant visual anchor | R01, R02, R03 | High | Repeated geometry |
| Distinct tile and wood floor finishes | R01, R02, R03 | High | Multiple viewpoints |
| Short level changes/railings | R01, R02, R11 | High for presence / Medium for layout | Perspective distortion |
| Full room footprint | Partial photos and historic size claim | Low | No dimensioned plan |
| Bar length and width | Chairs/counter photos | Low–Medium | Occlusion / lens distortion |
| Ceiling height | Doors, fixtures and photos | Low | Photographic perspective |
| Venue furniture for this specific wedding | Wedding gallery varied | Low | Configurable, requires actual package |
| Intended dance floor and food station positions | User requirements | Unknown | Explore as alternatives |

## First reconstruction acceptance
- Recognizable bar/glazed wall/wood ceiling/brick features in a credible composition.
- Raised main-floor area and transitions visualized; no terrace or mezzanine as playable zone.
- Show at least **4 real-photo vs render** comparisons with focal features aligned, and an explicit record of any uncertain scale.
- Distinguish `fixedArchitecture` (mostly locked) from `eventItems` (drag/edit) and `optionalFurniture` (visibility presets).