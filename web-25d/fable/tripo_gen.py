"""
用 Tripo3D API 批量生成游戏模型，并压缩成适合内联进网页的 GLB。

用法：
  export TRIPO_API_KEY=tsk_xxx
  python3 tripo_gen.py              # 生成所有缺失的模型
  python3 tripo_gen.py sofa tub     # 只生成 / 重生指定物件
  python3 tripo_gen.py --force      # 全部重生
之后运行 python3 build.py 重新打包 fable.html。

- 同时最多 MAX_INFLIGHT 个任务（Tripo 有并发上限）
- 原始模型存 models_raw/，压缩后存 models/，预览图存 previews/
- 压缩依赖 npx @gltf-transform/cli（贴图 512、网格简化、meshopt）
- API Key 只从环境变量读取，不会写进任何文件
"""
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.tripo3d.ai/v2/openapi"
ROOT = pathlib.Path(__file__).parent
RAW = ROOT / "models_raw"
OUT = ROOT / "models"
PREV = ROOT / "previews"
MAX_INFLIGHT = 8

# 参考图风格：Blender / 皮克斯式卡通渲染，圆润厚实，复古侦探事务所配色
STYLE = ("stylized 3D game asset in Pixar and Blender cartoon style, soft rounded chunky shapes, "
         "slightly exaggerated proportions, hand-painted textures, vintage 1960s detective office mood, "
         "palette of walnut brown, muted teal green, olive and brass, worn and lived-in, "
         "single isolated object, no ground plane, no floor, no base, no pedestal")
NEG = "text, letters, watermark, multiple objects, floor, ground, base, platform, rug, carpet, realistic photo, low quality"

ASSETS = {
    # ---- 角色 ----
    # 2026-10-22 换成短发戴毛线帽的 Q 版女生（参考图 models_src/player_ref.png，原图是长发，这里要求短发）
    "player": "a chibi cartoon girl character, very big head and small body, short straight black bob haircut with blunt bangs "
              "ending at the chin, no long hair, a chunky brown ribbed knit beanie hat, big sleepy half-lidded eyes, "
              "small silver hoop earring, white collared shirt with rolled-up sleeves under a brown cable-knit sweater vest, "
              "olive green cargo shorts with side pockets, slouchy tan leg warmers, chunky mustard yellow sneakers, "
              "standing relaxed facing forward, arms slightly away from the body, full body",
    "npc_qing": "a cute floating smart home AI orb, warm amber glass sphere with a glowing brass halo ring around it, friendly",
    "npc_echo": "an old dusty 1970s mainframe control cabinet with a single big red glowing camera eye, dented teal metal, cables",
    # ---- 剧情物件（重做） ----
    "sofa": "a three-seat sage green tufted fabric sofa with wooden legs, mid-century, slightly sagging cushions",
    "tv": "a retro mustard yellow CRT television with antenna on a low walnut media console",
    "bed": "a single bed with a dark walnut frame, rumpled cream sheets, one pillow and a folded teal blanket",
    "planner": "a tall rounded retro smart refrigerator, pale mint green, chrome handle, small screen on the door",
    "tortoise": "a small ceramic tortoise figurine with a cracked green glazed shell",
    "tub": "a white enamel clawfoot bathtub with brass feet and a brass control panel on the rim, filled with pale water",
    "crate": "a small old wooden crate with an ink bottle and a quill pen on top",
    "mirror": "a tall rectangular wall mirror with a thick dark walnut frame, hanging vertically, just the framed mirror",
    "console": "a chunky retro sci-fi control desk with three angled green CRT monitors and many chunky buttons",
    "server": "a row of three tall dark teal metal server cabinets with louvered vents and small blinking lights",
    "broadcast": "a vintage emergency broadcast radio transmitter in a wooden case, big analog dial, long antenna",
    "door": "a closed dark walnut apartment door standing upright, brass round knob, small red lock light, thin slab",
    "shoes": "a low wide walnut shoe bench with one pair of old brown leather oxford shoes on top",
    # ---- 装饰道具（新增） ----
    "deco_board": "a large cork evidence board with pinned photos, sticky notes, newspaper clippings connected by red string",
    "deco_lamp": "a green glass banker's desk lamp with brass stand",
    "deco_plant": "a potted monstera plant in a terracotta pot, big leaves",
    "deco_filing": "a dark grey metal four-drawer filing cabinet with one drawer half open and papers sticking out",
    "deco_phone": "a vintage black rotary telephone",
    "deco_sidetable": "a small round walnut side table with three tapered legs",
    "deco_coatrack": "a wooden standing coat rack with a grey fedora hat and a beige trench coat hanging on it",
    "deco_bin": "a small wire mesh wastebasket full of crumpled paper balls",
    "deco_chair": "a wooden swivel office chair with a teal green leather seat cushion and curved armrests",
    "deco_boxes": "a stack of three grey cardboard document archive boxes with labels",
    "deco_laundry": "a wicker laundry basket with a towel draped over the edge",
    "deco_stool": "a small round wooden bathroom stool",
    "deco_umbrella": "a brass umbrella stand holding two black umbrellas",
    "deco_clock": "a round vintage wall clock with a walnut frame, roman numerals",
    "deco_cardboard": "a messy stack of four old taped cardboard moving boxes",
    "deco_shelf": "a rusty metal utility shelf with paint cans, a toolbox and jars",
    "deco_fan": "a vintage oscillating electric desk fan with metal cage, mint green",
    "deco_typewriter": "a black vintage typewriter with a sheet of paper in it",
}


def call(method, path, body=None):
    key = os.environ.get("TRIPO_API_KEY")
    if not key:
        sys.exit("请先设置环境变量 TRIPO_API_KEY")
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read() or b"{}")
        except Exception:
            return {"code": e.code, "message": str(e)}
    except Exception as e:  # 网络抖动
        return {"code": -1, "message": str(e)}


def submit(asset_id):
    return call("POST", "/task", {
        "type": "text_to_model",
        "prompt": f"{ASSETS[asset_id]}, {STYLE}",
        "negative_prompt": NEG,
        "texture": True,
        "pbr": False,
        "texture_quality": "detailed",
        "face_limit": 8000,
    })


def compress(raw, asset_id):
    dst = OUT / f"{asset_id}.glb"
    gt = os.environ.get("GLTF_TRANSFORM") or "gltf-transform"
    subprocess.run([gt, "optimize", str(raw), str(dst),
                    "--texture-size", "512", "--texture-compress", "webp",
                    "--simplify", "true", "--simplify-ratio", "0.6", "--compress", "meshopt"],
                   check=True, capture_output=True)
    print(f"[{asset_id}] 压缩 {raw.stat().st_size // 1024} KB -> {dst.stat().st_size // 1024} KB", flush=True)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    for d in (RAW, OUT, PREV):
        d.mkdir(exist_ok=True)
    print("Tripo API 余额：", call("GET", "/user/balance").get("data"), flush=True)
    todo = args or [k for k in ASSETS if force or not (RAW / f"{k}.v2").exists()]
    todo = [k for k in todo if k in ASSETS]
    print("待生成：", len(todo), todo, flush=True)

    inflight, done, failed = {}, [], {}
    queue = list(todo)
    t0 = time.time()
    while (queue or inflight) and time.time() - t0 < 3600:
        while queue and len(inflight) < MAX_INFLIGHT:
            aid = queue[0]
            res = submit(aid)
            if res.get("code") == 0:
                inflight[aid] = res["data"]["task_id"]
                queue.pop(0)
                print(f"[{aid}] 提交 {inflight[aid]}", flush=True)
            elif res.get("code") == 2000:  # 并发上限，等等再提交
                break
            else:
                failed[aid] = res
                queue.pop(0)
                print(f"[{aid}] 提交失败 {res}", flush=True)
            time.sleep(0.6)
        time.sleep(6)
        for aid, tid in list(inflight.items()):
            st = (call("GET", f"/task/{tid}") or {}).get("data") or {}
            status = st.get("status")
            if status == "success":
                out = st.get("output") or {}
                url = out.get("model") or out.get("pbr_model") or out.get("base_model")
                raw = RAW / f"{aid}.glb"
                try:
                    urllib.request.urlretrieve(url, raw)  # 链接会过期，拿到就存
                    img = out.get("rendered_image")
                    if img:
                        urllib.request.urlretrieve(img, PREV / f"{aid}.webp")
                    (RAW / f"{aid}.v2").write_text(tid)
                    compress(raw, aid)
                    done.append(aid)
                except Exception as e:
                    failed[aid] = str(e)
                    print(f"[{aid}] 下载/压缩失败 {e}", flush=True)
                inflight.pop(aid)
            elif status in ("failed", "cancelled", "banned", "expired", "unknown"):
                failed[aid] = status
                inflight.pop(aid)
                print(f"[{aid}] 任务 {status}", flush=True)
        print(f"… 进行中 {len(inflight)} / 排队 {len(queue)} / 完成 {len(done)}", flush=True)
    print("完成：", done, flush=True)
    print("失败：", failed, flush=True)
    print("余额：", call("GET", "/user/balance").get("data"), flush=True)


if __name__ == "__main__":
    main()
