"""
给主角绑骨骼并加上行走 / 待机动画（Tripo3D）。

用法（Key 只从环境变量读取）：
  export TRIPO_API_KEY=tsk_xxx
  # tasks.json 里的 "a" 是生成主角模型的 Tripo 任务 ID
  python3 tripo_rig.py check          # 检查能否绑骨
  python3 tripo_rig.py rig biped      # 绑骨
  python3 tripo_rig.py anim preset:walk preset:idle   # 重定向动画，下载 anim.glb
压缩（蒙皮网格不能简化）：
  gltf-transform optimize anim.glb models/player.glb --texture-size 512 --texture-compress webp --simplify false --compress meshopt
游戏里按动画名播放：walk（移动时）、idle（停下时）。
"""
import json, os, sys, time, urllib.request, urllib.error
API = "https://api.tripo3d.ai/v2/openapi"; KEY = os.environ["TRIPO_API_KEY"]
def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
        headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:400]); raise
def wait(tid, label, limit=600):
    t0 = time.time()
    while time.time() - t0 < limit:
        d = call("GET", "/task/" + tid)["data"]
        if d["status"] in ("success", "failed", "cancelled", "banned", "expired", "unknown"):
            print(label, d["status"], json.dumps(d.get("output"), ensure_ascii=False)[:600], flush=True); return d
        time.sleep(8)
    print(label, "timeout"); return None
step = sys.argv[1]
ids = json.load(open("tasks.json"))
if step == "check":
    r = call("POST", "/task", {"type": "animate_prerigcheck", "original_model_task_id": ids["a"]}); print(r)
    ids["check"] = r["data"]["task_id"]; json.dump(ids, open("tasks.json", "w")); wait(ids["check"], "prerigcheck")
elif step == "rig":
    body = {"type": "animate_rig", "original_model_task_id": ids["a"], "out_format": "glb"}
    if len(sys.argv) > 2: body["rig_type"] = sys.argv[2]
    r = call("POST", "/task", body); print(r)
    ids["rig"] = r["data"]["task_id"]; json.dump(ids, open("tasks.json", "w")); wait(ids["rig"], "rig")
elif step == "anim":
    anims = sys.argv[2:] or ["preset:walk", "preset:idle"]
    body = {"type": "animate_retarget", "original_model_task_id": ids["rig"], "out_format": "glb", "animations": anims, "bake_animation": True}
    r = call("POST", "/task", body); print(r)
    ids["anim"] = r["data"]["task_id"]; json.dump(ids, open("tasks.json", "w"))
    d = wait(ids["anim"], "retarget")
    if d and d["status"] == "success":
        u = (d.get("output") or {}).get("model")
        if u: urllib.request.urlretrieve(u, "anim.glb"); print("saved anim.glb", os.path.getsize("anim.glb") // 1024, "KB")
