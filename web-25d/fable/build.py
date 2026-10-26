"""把 src/ 下的文件和 models/*.glb 拼成单个自包含 HTML：../fable.html"""
import base64
import json
import pathlib

root = pathlib.Path(__file__).parent
src = root / "src"
models_dir = root / "models"

# Tripo3D 生成并压缩后的模型，文件名即物件 id（如 sofa.glb）
models = {}
if models_dir.exists():
    for f in sorted(models_dir.glob("*.glb")):
        models[f.stem] = base64.b64encode(f.read_bytes()).decode("ascii")
model_js = "const MODEL_DATA = " + json.dumps(models) + ";"

# 界面图片：fable/ui/*.webp|png|jpg，文件名即 key（如 device.webp → UI_IMG.device）
ui_dir = root / "ui"
mime = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg"}
ui_imgs = {}
if ui_dir.exists():
    for f in sorted(ui_dir.iterdir()):
        if f.suffix in mime:
            ui_imgs[f.stem] = f"data:{mime[f.suffix]};base64," + base64.b64encode(f.read_bytes()).decode("ascii")
model_js += "\nconst UI_IMG = " + json.dumps(ui_imgs) + ";"

order = ["three.bundle.js", "badge.js", "scene.js", "models.js", "data.js", "npc.js", "ui.js", "puzzles.js", "main.js", "rules.js", "pc.js"]
parts = [model_js] + [(src / f).read_text(encoding="utf-8") for f in order]
scripts = "\n".join(f"<script>\n{p}\n</script>" for p in parts)
shell = (src / "shell.html").read_text(encoding="utf-8")
out = root.parent / "fable.html"
out.write_text(shell.replace("__SCRIPTS__", scripts), encoding="utf-8")
print("wrote", out, f"{out.stat().st_size / 1e6:.2f} MB", "models:", ", ".join(models) or "无", "| ui:", ", ".join(ui_imgs) or "无")
