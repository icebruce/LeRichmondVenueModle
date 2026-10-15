# Offline Video & 360° Evidence Workflow

**Problem:** Claude Code may not be able to load Instagram, YouTube, Google Maps 360° tours or embedded players. A URL is not equivalent to visual evidence. Do not pretend to have inspected a blocked video.

**Goal:** Transfer usable visual evidence to Claude while keeping the reconstruction strictly on the **MAIN RESTAURANT FLOOR** of Le Richmond. Ignore the mezzanine, bistro, terrace, exterior and unrelated Richmond venues.

## First choice: automatic retrieval by Claude Code

Before asking the user to record anything, follow `references/AUTO_MEDIA_COLLECTION.md` and try the collector at `scripts/collect_venue_media.py`. It handles photo URLs automatically and, when permitted and accessible, downloads wedding clips and builds contact sheets. Only use this manual fallback for blocked or inaccessible sources.

## Fallback workflow — user has no modeling/coding tasks

1. **Capture the videos** by asking Le Richmond or the video owner for downloadable copies, using an official download option where available, or making a permitted screen recording of videos they can view in their own browser. Do not bypass logins, paywalls, DRM or site restrictions.
2. **For Google Maps 360°**, create a slow screen recording while rotating around each *main restaurant* indoor viewpoint. Pause briefly at major landmarks (central bar, window wall, raised main-floor dining area, stairs/railings, entrance). If video recording fails, take 4–8 overlapping screenshots from each viewpoint; keep the camera position and zoom stable within each set.
3. Name files with matching IDs (e.g., `V01_wedding2022.mp4`, `V02_trailer.mp4`, `V03_360_bar.mp4`, `V03_360_raised_dining.mp4`). A screenshot named `V03_bar_E.jpg` is also acceptable.
4. **To work with Claude Code Local:** drop media into `references/private_media/raw/` in your cloned project. Tell Claude to run `python scripts/extract_video_frames.py`. Claude should inspect, classify, explain findings and update the 3D model. The user need not run the script.
5. **To work with Claude Code Remote:** local files are NOT automatically available. Supply the recordings/screenshots in a way the remote session can actually access, such as uploading suitable image references as attachments (where supported), or after switching the repository to **PRIVATE** and confirming rights to share, committing a curated subset of video frames to `references/venue_keyframes/`. Claude can then use the image files in the remote checkout. A plain URL or an ignored local folder is insufficient. Avoid pushing original video files.

## Video-to-image processing (Claude does this)

Run `python scripts/extract_video_frames.py` from repo root with `ffmpeg` + `ffprobe` installed.
- Input: `references/private_media/raw/`.
- Output: `references/private_media/processed/<clip>/frames/*.jpg`, a per-video `index.html` contact sheet and `frames_manifest.json`.
- Uniform sampling across the *whole* clip at approximately 1 frame per second; maximum 120 frames/video, adapting to longer duration.
- Claude must examine frames and change each manifest item's `status` from `unreviewed` to one of `main_floor`, `excluded`, `uncertain` with a short reason. Frame classification cannot be inferred from file name alone.
- Claude should manually extract additional frames around useful but brief camera transitions using `ffmpeg -ss TIMESTAMP -i INPUT -frames:v 1 ...` if sampling missed something.
- Claude should record approximate camera/viewpoint, room landmarks, relevant structural details, and whether fixtures are permanent or event-specific.
- Only **main_floor** frames should inform the main room's geometry. Other footage may be used exclusively as style reference when explicitly labeled as such.

## 360° still-photo fallback

If a 360° tour cannot be recorded, screenshot in order. Use names:
`V03_node01_bar_forward.jpg`, `V03_node01_bar_right.jpg`, `V03_node01_bar_back.jpg`, `V03_node01_bar_left.jpg`; and repeat for `node02_raised_dining`, etc.

For each node, capture a simple observation: approximate camera position (bar / entrance / window / dining), direction relative to visible landmarks, what can be seen, and whether the area is definitely on the main restaurant floor.

## Reconstruction deliverables for Claude

Produce `references/venue_evidence_matrix.md` containing:
- Source ID, image filename (and approximate timestamp where from video), confidence that it is MAIN FLOOR.
- Camera location/direction hypothesis and landmark labels.
- Fixed geometry visible (bar shape, floor transition, railing, columns, window spacing, ceiling fixtures).
- Cross-reference pairs (same landmark from different views).
- Dimension estimate **as a range and confidence**, not an invented measured value.
- Missing viewpoints / conflicts / likely temporary décor.

Generate photo-to-render comparisons at approximately matching viewpoints, and refine the room model until recognizable. Distinguish ***observed***, ***inferred*** and ***unknown***. Do not construct the mezzanine, bistro or terrace.

## Copyright, privacy and repository safety

Videos and screenshots from others may be copyrighted. Do not redistribute source footage publicly without authorization. This repo was **PUBLIC** at setup; confirm repository visibility and rights before committing images, videos, or guest photos. `references/private_media/` is deliberately ignored by Git and is available only to **local** Claude sessions on that same device. The handover records URLs for provenance without republishing videos.
