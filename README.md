# Richmond Studio — Le Richmond 3D Wedding Configurator

**Claude Code ready.** This repository contains the researched handover and UX concepts for an AI-built, realistic interactive 3D configurator of **Le Richmond's main restaurant floor only**. The mezzanine, bistro, and terrace are explicitly out of scope.

## Start in Claude Code Desktop

1. In Claude Code Desktop, open **Code**, select **Clone repository** (or clone with GitHub Desktop), and choose `https://github.com/icebruce/LeRichmondVenueModle`.
2. Open the cloned project folder in Claude Code.
3. Paste this message: **"Read CLAUDE.md and the full project handover. Inspect the references you can access. Propose the technical plan, architecture, dimensional assumptions and first 3D milestone. Do not begin major implementation until we refine and approve the plan."**
4. After agreeing on the plan, authorize Claude to build, test, commit and push code to the same repo.

Claude is expected to do the coding and modeling. You do not need to install Blender, write code, or provide a precise floor plan just to start.

## Automatic visual reference collection (preferred)

Claude should first follow [AUTO_MEDIA_COLLECTION.md](references/AUTO_MEDIA_COLLECTION.md). It can run `python scripts/collect_venue_media.py --photos-only` to attempt retrieval of all 17 main-floor photographs. When the right to download is confirmed, it can use the video collector for V01/V02 and extract viewable frames automatically. It records results in a machine-readable report and keeps media out of Git. These tools are **prepared, but no photos or actual video files have been fetched or committed by this handover**. Google Maps 360 is interactive and needs separate access; do not treat it as a downloadable MP4.

## If video links are blocked

The video and Google Maps links in the source register are not the actual media. See [Offline video + 360 workflow](references/VIDEO_360_OFFLINE_WORKFLOW.md) for the simple plan: user obtains or screen-records the video/360 tour where permitted, and **Claude** extracts screenshots, filters out terrace/mezzanine, organizes evidence, and uses the images to reconstruct the main room. The helper [extract_video_frames.py](scripts/extract_video_frames.py) prepares time-indexed contact sheets and manifests for Claude.

**Local vs Remote:** Private videos dropped into `references/private_media/raw/` work in a **local** Claude Code checkout; they do not magically appear in a Remote session. For Remote, supply a curated, authorized set of screenshots to the remote environment or a private repo. This is a public repo at the time of setup: do not push copyrighted videos/screenshots or private guest images here.

## Essential files
- [CLAUDE.md](CLAUDE.md) — root-level instructions automatically available to Claude Code in project context.
- [00_START_HERE_PASTE_IN_CLAUDE.md](00_START_HERE_PASTE_IN_CLAUDE.md) — original detailed kickoff brief.
- [01_PRODUCT_VISION.md](01_PRODUCT_VISION.md) — goals and experience.
- [02_VENUE_RECONSTRUCTION.md](02_VENUE_RECONSTRUCTION.md) — inferred geometry and scale confidence.
- [03_REFERENCE_GUIDE.md](03_REFERENCE_GUIDE.md) — curated photo/video/tour links.
- [04_REQUIREMENTS_AND_ACCEPTANCE.md](04_REQUIREMENTS_AND_ACCEPTANCE.md) — prioritized features and acceptance.
- [05_ASSET_IMPORT.md](05_ASSET_IMPORT.md) — screenshot/link import workflow.
- [06_TECH_PLAN_AND_QUALITY.md](06_TECH_PLAN_AND_QUALITY.md) — implementation and QA.
- [references/source_manifest.json](references/source_manifest.json) — structured photo/video register.
- [references/VISUAL_SOURCE_BOARD.html](references/VISUAL_SOURCE_BOARD.html) — browser visual reference index (requires access to third-party URLs).
- [examples/EXPERIENCE_MOCKUP.html](examples/EXPERIENCE_MOCKUP.html) — static interactive concept; not a venue model.
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — planned milestone/status checkpoints.

**Media note:** Third-party venue photos/videos are linked, not copied, due to rights and access restrictions. The original ZIP also contained optional binary illustrations (an isometric house inspiration image and a UX preview screenshot), which are *not part of this GitHub text-first handover*. The UX HTML and full venue reference board are included. If desired, provide the original inspiration image as an additional reference in Claude Code later.

## Research caveats
Photos span multiple arrangements/seasons. The official wedding gallery includes terrace images, flagged as exclusions. There is no verified dimensioned plan: Claude should infer editable, confidence-tagged geometric estimates from cross-photo architectural cues. Neither advertised capacity nor visuals alone establish venue/fire-code compliance.

## Repository stage
**Research + product specification — no actual 3D application has been built yet.** Claude should plan first, obtain your approval, then begin development. No proprietary venue media is bundled in the public repository.
