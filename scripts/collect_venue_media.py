#!/usr/bin/env python3
"""Best-effort, rights-aware automatic collection of publicly accessible venue media.

Run by Claude Code (not the user):
  python scripts/collect_venue_media.py
  python scripts/collect_venue_media.py --photos-only
  python scripts/collect_venue_media.py --videos-only

Uses direct photo URLs in source_manifest.json and optional yt-dlp for videos
only when you have permission to save those videos. No cookies, paywall, or DRM bypass.
Downloaded content goes to gitignored folders. Google Maps 360 is NOT a video file.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urlparse

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "references" / "source_manifest.json"
PRIVATE = ROOT / "references" / "private_media"
PHOTO_DIR = ROOT / "references" / "PRIVATE_LOCAL_PHOTO_CACHE"
RAW_DIR = PRIVATE / "raw"
HEADERS = {"User-Agent": "RichmondStudioReferenceResearch/1.0"}
PHOTO_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def read_bytes(url: str, max_size: int = 12_000_000) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError("Only HTTPS source URLs are supported")
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=25) as response:
        ctype = response.headers.get("content-type", "")
        if not ctype.startswith("image/"):
            raise ValueError(f"Expected image content, got {ctype or 'unknown'}")
        data = response.read(max_size + 1)
        if len(data) > max_size:
            raise ValueError("Image too large")
        return data


def collect_photos(manifest: dict, report: list[dict]) -> None:
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    for photo in manifest.get("photos", []):
        if photo.get("zone") != "MAIN":
            continue
        url = photo["url"]
        ext = pathlib.Path(urlparse(url).path).suffix.lower()
        if ext not in PHOTO_SUFFIXES:
            report.append({"id":photo["id"],"type":"photo","status":"unsupported","url":url})
            continue
        dest = PHOTO_DIR / f"{photo['id']}{ext}"
        if dest.exists() and dest.stat().st_size > 0:
            state = "already_present"
            info = ""
        else:
            try:
                dest.write_bytes(read_bytes(url))
                state = "downloaded"
                info = ""
            except (urllib.error.URLError, OSError, ValueError) as exc:
                state = "failed"
                info = str(exc)[:320]
        report.append({"id":photo["id"],"type":"photo","status":state,
                       "url":url,"local_path":str(dest.relative_to(ROOT)) if dest.exists() else None,
                       "error":info})
        print(f"{photo['id']}: {state}" + (f" ({info})" if info else ""))


def ytdlp_available() -> bool:
    try:
        import yt_dlp  # noqa: F401
        return True
    except ImportError:
        return shutil.which("yt-dlp") is not None


def ytdlp_cmd() -> list[str]:
    try:
        import yt_dlp  # noqa: F401
        return [sys.executable, "-m", "yt_dlp"]
    except ImportError:
        return ["yt-dlp"]


def collect_videos(manifest: dict, report: list[dict], authorized: bool) -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    supported_domains = ("youtube.com", "www.youtube.com", "youtu.be",
                         "www.instagram.com", "instagram.com", "vimeo.com")
    for video in manifest.get("videos_and_tours", []):
        id_ = video["id"]
        url = video["url"]
        host = (urlparse(url).hostname or "").lower()
        if id_ == "V03" or "google.com" in host:
            report.append({"id":id_, "type":"360_tour","status":"needs_separate_source",
                "url":url,"note":"Google Maps is an interactive tour, not a video. "
                "Use an owner-provided 360 export or properly licensed Maps API; "
                "do not misrepresent outdoor Street View as interior."})
            print(f"{id_}: Google Maps 360 cannot be downloaded as a video")
            continue
        if host not in supported_domains:
            report.append({"id":id_,"type":"video","status":"unsupported","url":url})
            continue
        if not authorized:
            report.append({"id":id_,"type":"video","status":"permission_not_confirmed",
                           "url":url,"note":"Pass --authorized-media only when the user "
                           "has rights or permission to save local references."})
            print(f"{id_}: permission to save video not confirmed")
            continue
        if not ytdlp_available():
            report.append({"id":id_,"type":"video","status":"missing_dependency","url":url,
                "note":"Claude can install with python -m pip install yt-dlp"})
            print(f"{id_}: yt-dlp unavailable")
            continue
        marker = RAW_DIR / f"{id_}_source"
        preexisting = list(RAW_DIR.glob(f"{id_}_source.*"))
        if preexisting:
            report.append({"id":id_,"type":"video","status":"already_present","url":url,
                "local_path":str(preexisting[0].relative_to(ROOT))})
            continue
        cmd = ytdlp_cmd() + [
            "--no-playlist", "--no-progress", "--no-overwrites",
            "--no-part", "--restrict-filenames",
            "--socket-timeout", "25", "--retries", "1",
            "--format", "bv*+ba/b",
            "--merge-output-format", "mp4",
            "--output", str(marker) + ".%(ext)s",
            url,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
            matches = list(RAW_DIR.glob(f"{id_}_source.*"))
            if result.returncode != 0 or not matches:
                raise RuntimeError((result.stderr or result.stdout)[-600:])
            report.append({"id":id_,"type":"video","status":"downloaded","url":url,
                           "local_path":str(matches[0].relative_to(ROOT))})
            print(f"{id_}: downloaded")
        except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
            report.append({"id":id_,"type":"video","status":"blocked","url":url,
                           "error":str(exc)[-500:]})
            print(f"{id_}: blocked/unavailable; ask owner for file")


def maybe_extract_frames(report: list[dict]) -> None:
    usable = [item for item in report if item["type"] == "video"
              and item["status"] in ("downloaded", "already_present")]
    if not usable:
        return
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        print("Video downloaded but ffmpeg/ffprobe not installed; Claude can install.")
        return
    tool = ROOT / "scripts" / "extract_video_frames.py"
    proc = subprocess.run([sys.executable, str(tool)], capture_output=True,
                          text=True, timeout=500)
    print(proc.stdout[-3000:])
    if proc.returncode != 0:
        print("Frame extraction failed:", proc.stderr[-700:])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--photos-only", action="store_true")
    group.add_argument("--videos-only", action="store_true")
    parser.add_argument("--authorized-media", action="store_true",
        help="User confirms rights/permission to save the linked videos as private references.")
    args = parser.parse_args()

    source = json.loads(MANIFEST.read_text(encoding="utf-8"))
    PRIVATE.mkdir(parents=True, exist_ok=True)
    report: list[dict] = []
    if not args.videos_only:
        collect_photos(source, report)
    if not args.photos_only:
        collect_videos(source, report, args.authorized_media)
        maybe_extract_frames(report)

    log = {
        "collected_at":datetime.now(timezone.utc).isoformat(),
        "authorized_videos":args.authorized_media,
        "scope":"main restaurant floor only; extracted video frames are NOT yet classified",
        "results":report,
    }
    dest = PRIVATE / "collection_report.json"
    dest.write_text(json.dumps(log,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    counts = {name:sum(1 for item in report if item["status"] == name)
              for name in sorted(set(x["status"] for x in report))}
    print("Summary:",json.dumps(counts))
    print("Detailed report:",dest.relative_to(ROOT))
    print("Do NOT commit private media to a public GitHub repository.")


if __name__ == "__main__":
    main()
