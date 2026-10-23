"""
极乐迪斯科（Disco Elysium）风格的公寓家具与杂物，用 Tripo3D 文生模型批量生成。

用法（Key 只从环境变量读取）：
  export TRIPO_API_KEY=tsk_xxx
  python3 tripo_de.py              # 生成 ASSETS 里还没生成过的
  python3 tripo_de.py sofa tub     # 只生成 / 重生指定的
原始模型存 models_raw_de/（不进仓库），压缩后写到 models/<id>.glb。
压缩需要 gltf-transform（GLTF_TRANSFORM 环境变量可指定路径）。
"""
import json, os, pathlib, subprocess, sys, time, urllib.request, urllib.error

API = "https://api.tripo3d.ai/v2/openapi"
ROOT = pathlib.Path(__file__).parent
RAW = ROOT / "models_raw_de"
OUT = ROOT / "models"
MAX_INFLIGHT = 8

# 极乐迪斯科的美术：油画笔触的手绘贴图、写实比例、破旧、褪色，东欧 70 年代公寓
STYLE = ("realistic proportions, painterly hand-painted texture with visible oil paint brush strokes, "
         "Disco Elysium art style, worn shabby 1970s Eastern European apartment, faded muted colors, "
         "grime, scratches and stains, single isolated object, no floor, no ground plane, no base")
NEG = "cartoon, chibi, toy, plastic, glossy, clean, new, text, watermark, multiple objects, floor, ground, base, platform"

ASSETS = {
    # ---- 替换原有的剧情家具（保持原尺寸和用途）----
    "sofa": "an old sagging green velvet three-seat sofa with worn armrests and a crumpled blanket",
    "bed": "an unmade single bed with a rusty iron frame, a stained mattress and tangled grey sheets",
    "tub": "an old freestanding cast iron clawfoot bathtub, chipped white enamel, rust stains",
    "tv": "a 1970s wood-cased CRT television set on a low wooden cabinet with a dark glass screen",
    "planner": "a tall old rounded refrigerator, yellowed cream enamel, dented, chrome handle",
    "shoes": "a low wooden shoe cabinet with peeling varnish and a few worn leather shoes on top",
    "mirror": "a bathroom sink with a small wall mirror above it, cracked tiles splashback, old taps",
    "console": "a grey metal electrical control cabinet with dials, switches and warning stickers, rusted",
    "broadcast": "an old 1960s valve radio transmitter with big knobs and a mesh speaker, wooden case",
    "server": "a battered grey metal filing machine with a paper tape printer and a red indicator lamp",
    # ---- 新增布景（极乐迪斯科式的杂乱）----
    "de_radiator": "an old cast iron ribbed radiator, peeling cream paint, rust at the bottom",
    "de_armchair": "a worn mid-century armchair with mustard yellow upholstery and wooden legs",
    "de_armchair2": "a battered brown leather armchair with cracked leather and a sunken seat",
    "de_ceilfan": "a ceiling fan with four wooden blades and a brass motor housing, dusty",
    "de_rug": "a faded worn persian rug with red and ochre patterns, frayed edges, lying flat",
    "de_reeltape": "a vintage reel-to-reel tape recorder on a wooden sideboard with records",
    "de_laundry": "a messy pile of crumpled clothes, sheets and pillows on the floor",
    "de_bottles": "a cluster of empty glass liquor bottles and a tipped over bottle on the floor",
    "de_bookshelf": "a narrow wooden wall bookshelf with old books, a small plant and clutter",
    "de_desk": "an old wooden writing desk with scattered papers, a desk lamp and an ashtray",
    "de_walllamp": "a small vintage wall sconce lamp with a white glass cone shade",
    "de_floorlamp": "a tall vintage floor lamp with a fabric drum shade, slightly bent pole",
    "de_coatrack": "a wall-mounted wooden coat rack with hooks, a hat and a hanging coat",
    "de_debris": "a pile of broken bricks, plaster chunks and dust on the floor",
    "de_boiler": "an old rusty cylindrical water boiler with pipes and a pressure gauge",
    "de_chairs": "a stack of three old folding metal cafe chairs leaning together",
    # ---- 储物间（参考极乐迪斯科截图：堆起来的旧家具、床单、倒地吊扇、人体模型腿）----
    # 元组 = (prompt, negative_prompt)：成堆的物件不能用默认的 "multiple objects" 负面词
    "st_armpile": ("two battered brown leather armchairs stacked, the top armchair flipped upside down "
                   "resting on the seat of the bottom one, cracked faded leather, sagging cushions", "PILE"),
    "st_linen": ("a large messy heap of crumpled grey-white bed sheets, a stained duvet and three "
                 "white pillows dumped on the floor", "PILE"),
    "st_fan": "a broken ceiling fan lying on its side on the floor, four long wooden blades, one blade bent, brass motor housing, dangling wire",
    "st_door": "an old wooden interior door panel lying flat, peeling pale grey-blue paint, water stains, no handle",
    "st_mannequin": ("a pair of detached wooden artist mannequin legs lying on the floor, tan varnished wood, "
                     "hip joint and knees, one leg crossed over the other", "PILE"),
    "st_tools": "a dented old grey-green metal tool cabinet, one door hanging half open, a crowbar and rusty tools inside, peeling paint",
    "st_radiator": "a tall old cast iron column radiator, cream paint peeling, rust at the valves, standing on short feet",
    # ---- 吊灯（替换原来的几何吊灯，只放在部分房间）----
    "lamp_pendant": "an old enamel pendant ceiling lamp hanging from a short cord, dented dark green metal dome shade, warm glowing bulb, dusty",
    "lamp_bulb": "a single bare incandescent light bulb hanging from a long twisted black cord with a cracked bakelite socket, glowing",
    # ---- 替换剩下的白膜（程序方块）物件 ----
    "lamp": "a tall 1960s brass standard floor lamp with a pleated cream fabric shade, round heavy base, tarnished",
    "notice": "a small worn square wooden dining table with four tapered legs, scratched varnish, a coffee ring stain",
    "robot": "a round robot vacuum cleaner, scuffed dark grey plastic, a teal indicator light on top, low and flat",
    "waste": "a dented metal kitchen pedal bin with a lid, cream enamel, rust spots",
    "ac": "a slim wide wall-mounted split air conditioner indoor unit, long horizontal white rounded plastic casing yellowed with age, a thin louvre slot along the bottom, very shallow depth",
    "pothos": "a pothos plant with long trailing vines in a cracked terracotta pot",
    "water": "an automatic plant watering machine, a tall translucent plastic water tank on a small pump base with a thin hose",
    "speaker": "a 1970s wooden hi-fi loudspeaker cabinet with a fabric grille, a small cylindrical smart speaker sitting on top",
    "curtain": "a single heavy faded dark green velvet curtain panel hanging straight down in folds, frayed hem",
    "locker": "a small old grey steel locker cabinet with a padlock on the door, dented, peeling paint",
    "dock": "a small upright charging base for a robot vacuum, a low rectangular grey plastic block with a sloped front ramp and two metal charging contacts, a short power cord, no vacuum",
    "status": "a small wall-mounted apartment intercom panel with a dark rectangular screen, old beige plastic, a speaker grille",
    "counter": "a long old kitchen counter with lower cabinets and a steel sink, worn wood-grain laminate top, chipped doors",
    "cel_sofa": "an old sagging mustard yellow fabric sofa with a stained red blanket thrown over one arm",
    "cel_junk": ("a pile of damp cardboard boxes, a wooden crate and bundles of old newspapers tied with string", "PILE"),
}
# 成堆的物件：去掉 "multiple objects"
NEG_PILE = NEG.replace("multiple objects, ", "")


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + os.environ["TRIPO_API_KEY"], "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()[:300]}")


def submit(asset_id):
    v = ASSETS[asset_id]
    prompt, neg = (v[0], NEG_PILE if v[1] == "PILE" else v[1]) if isinstance(v, tuple) else (v, NEG)
    return call("POST", "/task", {
        "type": "text_to_model",
        "prompt": f"{prompt}, {STYLE}",
        "negative_prompt": neg,
        "texture": True, "pbr": False, "texture_quality": "detailed", "face_limit": 8000,
    })["data"]["task_id"]


def compress(raw, asset_id):
    gt = os.environ.get("GLTF_TRANSFORM") or "gltf-transform"
    dst = OUT / f"{asset_id}.glb"
    subprocess.run([gt, "optimize", str(raw), str(dst), "--texture-size", "512", "--texture-compress", "webp",
                    "--simplify", "true", "--simplify-ratio", "0.6", "--compress", "meshopt"], check=True, capture_output=True)
    print(f"[{asset_id}] {raw.stat().st_size // 1024} KB -> {dst.stat().st_size // 1024} KB", flush=True)


def main():
    RAW.mkdir(exist_ok=True); OUT.mkdir(exist_ok=True)
    print("余额", call("GET", "/user/balance")["data"], flush=True)
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    todo = [k for k in (args or ASSETS) if k in ASSETS and (args or not (RAW / f"{k}.glb").exists())]
    print("待生成", len(todo), todo, flush=True)
    # 已提交的任务 ID 存盘：进程中断后重跑会接着下载，不会重复扣积分
    TASKS = RAW / "tasks.json"
    saved = json.loads(TASKS.read_text()) if TASKS.exists() else {}
    inflight = {k: saved[k] for k in todo if k in saved}
    queue, failed = [k for k in todo if k not in inflight], {}
    def persist():
        cur = json.loads(TASKS.read_text()) if TASKS.exists() else {}
        cur.update(inflight); TASKS.write_text(json.dumps(cur, indent=1))
    t0 = time.time()
    LIMIT = float(os.environ.get("TRIPO_LIMIT", "3000"))   # 每次运行最多等多久（秒），中断后重跑会接着下载
    while (queue or inflight) and time.time() - t0 < LIMIT:
        while queue and len(inflight) < MAX_INFLIGHT:
            k = queue.pop(0)
            try:
                inflight[k] = submit(k); persist(); print("提交", k, inflight[k], flush=True)
            except Exception as e:
                failed[k] = str(e); print("提交失败", k, e, flush=True)
        time.sleep(10)
        for k, tid in list(inflight.items()):
            d = call("GET", "/task/" + tid)["data"]
            if d["status"] == "success":
                out = d.get("output") or {}
                url = out.get("model") or out.get("pbr_model") or out.get("base_model")
                raw = RAW / f"{k}.glb"
                urllib.request.urlretrieve(url, raw)
                if out.get("rendered_image"):
                    urllib.request.urlretrieve(out["rendered_image"], RAW / f"{k}.webp")
                try:
                    compress(raw, k)
                except Exception as e:
                    failed[k] = "compress: " + str(e)
                del inflight[k]
            elif d["status"] in ("failed", "cancelled", "banned", "expired", "unknown"):
                failed[k] = d["status"]; del inflight[k]; print("失败", k, d["status"], flush=True)
    print("完成；失败：", failed, "；未完成：", list(inflight), flush=True)
    print("余额", call("GET", "/user/balance")["data"], flush=True)


if __name__ == "__main__":
    main()
