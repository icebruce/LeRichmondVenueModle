#!/usr/bin/env python3
"""Turn locally supplied wedding/360° clips into Claude-readable frame galleries.

Run via Claude Code in a LOCAL checkout:
  python scripts/extract_video_frames.py
Requires ffmpeg and ffprobe on PATH. Source files never leave the computer.
This tool does NOT identify whether frames show the main restaurant floor.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def run(args: list[str]) -> str:
    proc = subprocess.run(args, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout).strip()[-1400:])
    return proc.stdout


def get_duration(path: Path) -> float | None:
    try:
        result = json.loads(run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "json", str(path),
        ]))
        return float(result["format"]["duration"])
    except (KeyError, ValueError, OSError, RuntimeError):
        return None


def safe_slug(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", name).strip("_")[:90] or "clip"


def build_gallery(name: str, frames: list[dict]) -> str:
    cards = []
    for frame in frames:
        rel = html.escape(frame["image"], quote=True)
        label = html.escape(frame["id"])
        ts = frame.get("time_seconds")
        time_note = f"~{ts:.1f}s" if ts is not None else "Still image"
        cards.append(
            f'<figure><img src="{rel}" loading="lazy" alt="{label}">'
            f'<figcaption>{label} · {time_note} · unreviewed</figcaption></figure>'
        )
    body = "\n".join(cards)
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>{html.escape(name)} | evidence frames</title>'
        '<style>body{font:14px system-ui;background:#f5f5f2;color:#252525;'
        'padding:24px;margin:auto;max-width:1500px}h1{font-size:25px}'
        '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(225px,1fr));'
        'gap:14px}figure{margin:0;background:#fff;padding:8px;border-radius:9px}'
        'img{width:100%;height:185px;object-fit:contain;background:#eee}'
        'figcaption{padding:8px 3px;color:#666;font-size:12px}</style></head>'
        f'<body><h1>{html.escape(name)}</h1>'
        '<p>Claude: classify every frame as main_floor, excluded or uncertain '
        'in frames_manifest.json before using the images for geometry.</p>'
        f'<div class="grid">{body}</div></body></html>'
    )


def process_item(source: Path, output_root: Path, target_step: float, max_frames: int) -> None:
    name = safe_slug(source.stem)
    target = output_root / name
    frames_dir = target / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    duration: float | None = None
    interval: float | None = None
    if source.suffix.lower() in VIDEO_EXTS:
        duration = get_duration(source)
        interval = max(target_step, (duration or 0) / max_frames)
        for old in frames_dir.glob("*.jpg"):
            old.unlink()
        run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
            "-i", str(source),
            "-vf", f"fps=1/{interval:.6f},scale=1280:-2",
            "-q:v", "3", "-frames:v", str(max_frames),
            str(frames_dir / "frame_%04d.jpg"),
        ])
        images = sorted(frames_dir.glob("*.jpg"))
    else:
        destination = frames_dir / source.name
        shutil.copy2(source, destination)
        images = [destination]

    if not images:
        print(f"WARNING: no frames extracted from {source}")
        return

    frames = []
    for i, file in enumerate(images):
        seconds = round(i * interval, 2) if interval is not None else None
        frames.append({
            "id": f"{name}_{i + 1:04d}",
            "image": f"frames/{file.name}",
            "time_seconds": seconds,
            "status": "unreviewed",
            "reason": "",
            "camera_location_hypothesis": "",
            "camera_direction_hypothesis": "",
            "architecture_landmarks": [],
            "dimension_clues": [],
            "notes": "",
        })

    manifest = {
        "source_file": source.name,
        "source_url": "",
        "duration_seconds": duration,
        "sampling_interval_seconds": interval,
        "coverage": "Unverified; frame classification REQUIRED",
        "venue_scope": "MAIN RESTAURANT FLOOR ONLY",
        "frames": frames,
    }
    (target / "frames_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (target / "index.html").write_text(build_gallery(name, frames), encoding="utf-8")
    print(f"Created {len(frames)} visual references: {target}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-dir", type=Path,
        default=ROOT / "references" / "private_media" / "raw",
        help="Local video files and tour screenshots"
    )
    parser.add_argument(
        "--output-dir", type=Path,
        default=ROOT / "references" / "private_media" / "processed",
        help="Private, gitignored generated frame collections"
    )
    parser.add_argument("--every-seconds", type=float, default=1.0)
    parser.add_argument("--max-frames", type=int, default=120)
    args = parser.parse_args()
    if args.every_seconds <= 0 or args.max_frames <= 0:
        parser.error("--every-seconds and --max-frames must be positive")
    sources = sorted(
        p for p in args.input_dir.iterdir() if p.is_file()
        and p.suffix.lower() in VIDEO_EXTS | IMAGE_EXTS
    ) if args.input_dir.exists() else []
    if not sources:
        print(f"No source files in {args.input_dir}; place videos/screenshots there.")
        return
    if any(p.suffix.lower() in VIDEO_EXTS for p in sources):
        for binary in ("ffmpeg", "ffprobe"):
            if not shutil.which(binary):
                raise SystemExit(f"Missing {binary}. Ask Claude to install it.")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for source in sources:
        try:
            process_item(source, args.output_dir, args.every_seconds, args.max_frames)
        except (OSError, RuntimeError) as exc:
            print(f"FAILED {source.name}: {exc}")


if __name__ == "__main__":
    main()
