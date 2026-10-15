# Automated media collection — Claude Code operating instructions

The user should NOT have to make individual screenshots, crop frames, classify images, write code or operate ffmpeg.

## Do this before asking the user for video screenshots

1. Read `references/source_manifest.json` and verify scope: **main restaurant floor only**.
2. Run `python scripts/collect_venue_media.py --photos-only` in an environment with internet access. It downloads up to **17 specifically curated direct photographs** into `references/PRIVATE_LOCAL_PHOTO_CACHE/` (gitignored). If access fails, report which URLs are blocked. Do not assume a failed reference was inspected.
3. For V01/V02 wedding videos, check access, permission and platform terms. If authorized to save local research copies, install `yt-dlp` and `ffmpeg` as needed, then run `python scripts/collect_venue_media.py --videos-only --authorized-media`. Downloads go into `references/private_media/raw/`, and the existing `scripts/extract_video_frames.py` creates time-indexed frame contact sheets and manifests.
4. Inspect ALL extracted frames, keeping only those that definitely depict the main restaurant floor. Reject terrace, upstairs mezzanine, bistro and shots not reliably identifiable. Mark frames in each `frames_manifest.json` and record significant viewpoints/architectural landmarks.
5. Inspect `references/private_media/collection_report.json` for errors. If YouTube requires authentication, rate-limits, or restricts downloading, **do not bypass** protections. Ask the venue/producer for a downloadable source if important. Public platform thumbnail URLs are not a substitute for the video.
6. For V03 Google Maps 360, the URL identifies an interactive experience, NOT a video file. Do not try generic video-download software or present ordinary outdoor Street View as the restaurant interior. Prefer an actual 360/panorama export from the venue or another licensed source. Official Google Maps APIs may require authorization/billing and may not expose that contributed interior panorama.
7. Assess whether the photo references alone are sufficient to build an early geometry model. Do NOT delay the entire build because a platform blocks videos.

## Claude Remote vs Local

- **Local:** Downloaded images/videos remain in gitignored project folders. Claude can use them directly in that checkout.
- **Remote:** A remote cloud checkout can fetch public media itself if outbound network access and platform permissions allow. Untracked/generated files might not persist across fresh remote environments. For persistence, selectively use Git-tracked, rights-cleared reference stills or obtain explicit original-media permission and a private long-term location. Never silently publish venue/copyrighted videos in a public repository.
- Users can turn on private repository visibility in GitHub Settings. This helps access control but does NOT automatically grant reuse rights to the original media.

## Completion reporting

Give the user a small source inventory with *successful / blocked / unverified* counts. Distinguish directly obtained photographs, successfully extracted video keyframes, and merely linked references. If 360 cannot be programmatically retrieved, mention it as an optional enhancement, not an excuse to stall.

## CLI

```bash
python scripts/collect_venue_media.py --photos-only
python -m pip install yt-dlp
python scripts/collect_venue_media.py --videos-only --authorized-media
```

Only use `--authorized-media` after the user confirms they have permission or appropriate rights to download those source videos. Claude should perform this setup itself when the user approves it.

The original manual capture fallback remains at [VIDEO_360_OFFLINE_WORKFLOW.md](VIDEO_360_OFFLINE_WORKFLOW.md). It is **not** the preferred first action.
