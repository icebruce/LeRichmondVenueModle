#!/usr/bin/env python3
"""Optional, private, best-effort photo cache. Respect site terms and rights.
Only downloads manifest entries with zone MAIN; never terrace references or videos.
Usage: python helpers/cache_reference_photos.py
"""
import json
import pathlib
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / "references/source_manifest.json").read_text(encoding="utf-8"))
target = ROOT / "references/PRIVATE_LOCAL_PHOTO_CACHE"
target.mkdir(parents=True, exist_ok=True)
for photo in manifest["photos"]:
    if photo["zone"] != "MAIN":
        continue
    ext = pathlib.Path(photo["url"].split("?")[0]).suffix.lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        continue
    path = target / (photo["id"] + ext)
    if path.exists():
        continue
    try:
        request = urllib.request.Request(photo["url"], headers={"User-Agent":"Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=15) as response:
            if not response.headers.get("Content-Type","").startswith("image/"):
                raise ValueError("Not an image")
            payload = response.read(10_000_001)
            if len(payload) > 10_000_000:
                raise ValueError("Image too large")
            path.write_bytes(payload)
        print("OK", path.name)
    except (OSError,ValueError,urllib.error.URLError) as error:
        print("FAILED",photo["id"],str(error))
    time.sleep(0.4)
