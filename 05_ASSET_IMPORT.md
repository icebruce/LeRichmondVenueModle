# Décor asset intake — realistic, frictionless, honest about limitations

## User story
I see a chandelier/centerpiece/candle holder/linen/chair in a web image or product listing. I want to screenshot or paste the link, have Claude identify what I care about, and then drop an appropriate visual approximation into Le Richmond's 3D scene to see how the room feels. I shouldn't need Blender or to download a GLB myself.

## Design: a simple 4-step wizard
1. **Add reference**: drag/drop PNG/JPEG/WEBP, paste from clipboard, or paste a URL. Preview and title. Product-page fetch may fail due CORS, bot blocks, authentication or copyright: on failure request screenshot/image upload (not shell/API hacking).
2. **Understand it**: classify `tablecloth`, `material`, `votive`, `taper candle`, `flowers`, `chair`, `table`, `lamp`, `backdrop`, `station`, `other`. Extract dominant colors, silhouette, approx proportions, and whether object belongs on table/floor/wall/ceiling. Offer category override.
3. **Choose rendering approach** (default chosen automatically but visible):
   - `MATERIAL`: sample/approximate color or pattern. Ideal for linens and fabrics; no 3D model required. Show user-supplied image swatch.
   - `PARAMETRIC_3D`: build reusable realistic 3D combinations from procedural library. Ideal for cylinder vases, candle groupings, basic floral clusters, table runners, round/long tables, simple chair silhouettes. Most practical initial path.
   - `IMAGE_CARD / 2.5D CUTOUT`: display photo as a small flat image/decal or transparent sprite aligned in scene; visibly labeled "reference preview". It will look wrong from certain sides, but gives fast layout impression.
   - `NATIVE_3D`: if user supplies GLB/GLTF, import and normalize scale/orientation/materials; this is the only true ready-made all-angle model in MVP.
   - `AI_3D_GENERATED` optional future service: use a licensed external 3D-generation API if connected, with user approval, cost estimate, and quality check. **Not required for MVP**.
4. **Place & reuse**: one click to place on chosen surface; drag/rotate/scale, change size in cm, duplicate/apply to all tables; save asset to personal catalog and reference the original image/link in metadata.

## A concrete example
Paste screenshot of a cream tablecloth -> classification: linen -> sample ivory/warm undertone + approximate fabric roughness -> apply to selected table/all tables. No geometry reconstruction required.

Paste link/photo of a tall 3-arm candlestick -> classification: candle holder -> choose `Parametric 3D` -> generate metal holder and warm candles ~50cm high, let user modify height, assign to central table point -> use physically plausible emissive effect. Reference picture shown alongside inspector; user knows model is a close approximation, not exact.

Paste screenshot of an elaborate asymmetric floral centerpiece -> classification: flowers -> generate layered silhouette using a realistic reusable flower/foliage asset set, with extracted palette and size. If no good 3D assets, give fast `2.5D preview` fallback. Label match: approximate. Never promise that a single photo reconstructs back side correctly.

Paste a product listing for a distinctive upholstered chair -> `Parametric chair` approximation or pick closest locally available licensed GLB; height/width user-editable. Reference image remains in asset inspector. Exact reproduction not guaranteed.

## Data schema guidance (illustrative)
```json
{
  "id": "asset_candle_014",
  "title": "Amber hurricane candle",
  "category": "candle",
  "inputType": "image|url|glb",
  "sourceUrl": "user_supplied_url_or_null",
  "imagePath": "user_upload_local_reference",
  "renderMode": "parametric_3d",
  "fidelity": "approximation",
  "dimensionsMeters": {"width": 0.16, "depth": 0.16, "height": 0.34},
  "palette": ["#CAA96D", "#E5DDCE"],
  "anchors": ["tabletop"],
  "provenance": "user_reference",
  "modelConfig": {"glassTint":"amber","flame":"warm"}
}
```

## Engineering guardrails
- A screenshot is **not** a true 3D asset. Never quietly generate a hollow billboard and imply it is full 3D.
- For local-only MVP, browser uploads + IndexedDB for image Blob/project storage; URLs/provenance as text. Longer-term backend optional; no API keys committed.
- Image ingestion: EXIF orientation, bounded pixels/size, sandbox external content, validation, error states, no automatic untrusted HTML execution, no scraping behind authentication/paywalls.
- If direct network import blocked, graceful manual drop fallback. Respect licensing/attribution and keep the project's source photos as research references, not shipped app textures unless permitted.
- Save source-image and generated approximation independently. User can change fidelity/render method later without losing placement.
- Build image-to-style extraction only as far as available runtime capabilities permit. An explicitly provided Claude vision description manually transformed into asset parameters is a valid early implementation; do not secretly depend on a paid API.

## Acceptance bar
User can drag/drop one image and paste one public link, create reusable parametric prop or linen material, drag it to a table, edit cm size, save scene, reload and find it intact. Clear fallback for blocked external URL. No Blender needed.