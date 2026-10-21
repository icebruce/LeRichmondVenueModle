"""Small Meshy API client (the proxy injects the key). Stops on any API error.

python meshy.py preview <name> <prompt-file> [polycount] [prop|posed]  -> starts a preview task, prints its id
                                                     (prop: an object; posed: a figure in the prompt's pose,
                                                     not Meshy's A-pose)
python meshy.py refine <name> <preview_id> <texture-prompt-file>
python meshy.py remesh <task_id> <polycount>           -> a lighter version of a finished task (5 credits)
python meshy.py rig <name> <refine_id> <height_m>
python meshy.py animate <rig_id> <action_id>
python meshy.py wait <kind> <id> <out_dir> <name>   kind: text3d | remesh | rig | anim ; downloads GLB + thumbnail
"""
import json
import os
import sys
import time
import urllib.request

API = "https://api.meshy.ai/openapi"
KEY = os.environ.get("MESHY_API_KEY", "injected")


def call(method, path, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"API {e.code}: {e.read().decode()[:500]}")


def fetch(url, path):
    with urllib.request.urlopen(url, timeout=300) as r, open(path, "wb") as f:
        f.write(r.read())


cmd = sys.argv[1]
if cmd == "preview":
    prompt = open(sys.argv[3]).read().strip()
    assert len(prompt) <= 600, f"prompt too long: {len(prompt)}"
    prop = "prop" in sys.argv[4:]
    posed = "posed" in sys.argv[4:]
    r = call("POST", "/v2/text-to-3d", {
        "mode": "preview",
        "prompt": prompt,
        "art_style": "realistic",
        "should_remesh": True,
        "topology": "triangle",
        "target_polycount": int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 30000,
        "symmetry_mode": "on",
        **({} if prop or posed else {"pose_mode": "a-pose"}),
    })
    print(r.get("result"))
elif cmd == "refine":
    tp = open(sys.argv[4]).read().strip()
    r = call("POST", "/v2/text-to-3d", {"mode": "refine", "preview_task_id": sys.argv[3], "enable_pbr": True, "texture_prompt": tp[:600]})
    print(r.get("result"))
elif cmd == "remesh":
    r = call("POST", "/v1/remesh", {"input_task_id": sys.argv[2], "target_polycount": int(sys.argv[3]), "topology": "triangle", "target_formats": ["glb"]})
    print(r.get("result"))
elif cmd == "rig":
    r = call("POST", "/v1/rigging", {"input_task_id": sys.argv[3], "height_meters": float(sys.argv[4])})
    print(r.get("result"))
elif cmd == "animate":
    r = call("POST", "/v1/animations", {"rig_task_id": sys.argv[2], "action_id": int(sys.argv[3])})
    print(r.get("result"))
elif cmd == "wait":
    kind, tid, out, name = sys.argv[2:6]
    path = {
        "text3d": f"/v2/text-to-3d/{tid}",
        "remesh": f"/v1/remesh/{tid}",
        "rig": f"/v1/rigging/{tid}",
        "anim": f"/v1/animations/{tid}",
    }[kind]
    while True:
        t = call("GET", path)
        st = t.get("status")
        if st in ("SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"):
            break
        time.sleep(10)
    if st != "SUCCEEDED":
        sys.exit(f"task {tid} {st}: {json.dumps(t.get('task_error'))}")
    os.makedirs(out, exist_ok=True)
    if kind in ("text3d", "remesh"):
        fetch(t["model_urls"]["glb"], os.path.join(out, f"{name}.glb"))
        if t.get("thumbnail_url"):
            fetch(t["thumbnail_url"], os.path.join(out, f"{name}-thumb.png"))
    elif kind == "anim":
        res = t.get("result", {})
        url = res.get("animation_glb_url")
        if not url:
            sys.exit("no animation GLB in result: " + json.dumps(res)[:500])
        fetch(url, os.path.join(out, f"{name}.glb"))
    else:
        res = t.get("result", {})
        url = res.get("rigged_character_glb_url")
        if not url:
            sys.exit("no rigged GLB in result: " + json.dumps(res)[:500])
        fetch(url, os.path.join(out, f"{name}.glb"))
    print("saved", name, "| credits balance:", call("GET", "/v1/balance").get("balance"))
