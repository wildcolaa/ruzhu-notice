import sys, numpy as np, cv2
from PIL import Image
up, out, prev = sys.argv[1], sys.argv[2], sys.argv[3]
dev = cv2.cvtColor(np.asarray(Image.open(up + '/device_src.png').convert('RGB')), cv2.COLOR_RGB2BGR)
H, W = dev.shape[:2]
lum = dev.mean(axis=2).astype(np.float32)
bg = cv2.medianBlur(lum.astype(np.uint8), 21).astype(np.float32)
diff = np.abs(lum - bg)

# ---- 1. 擦掉旋钮指针和英文丝印 ----
mask = np.zeros((H, W), np.uint8)
def area(x0, y0, x1, y1, thr=6, grow=3):
    m = np.zeros((H, W), np.uint8)
    sub = (diff[y0:y1, x0:x1] > thr).astype(np.uint8)
    m[y0:y1, x0:x1] = sub
    m = cv2.dilate(m, np.ones((2 * grow + 1, 2 * grow + 1), np.uint8))
    mask[:] |= m
# 旋钮指针：旋钮是圆对称的，用同半径、上下各转 24° 处的像素取平均来补，比普通修补自然
cx, cy = 269.0, 598.0
pm = np.zeros((H, W), np.uint8)
pm[580:612, 140:224] = (diff[580:612, 140:224] > 4).astype(np.uint8)
pm = cv2.dilate(pm, np.ones((9, 9), np.uint8))
ys, xs = np.where(pm > 0)
r = np.hypot(xs - cx, ys - cy); th = np.arctan2(ys - cy, xs - cx)
acc = np.zeros((len(xs), 3), np.float32)
for dth in (np.radians(24), -np.radians(24)):
    sx = np.clip(np.round(cx + r * np.cos(th + dth)).astype(int), 0, W - 1)
    sy = np.clip(np.round(cy + r * np.sin(th + dth)).astype(int), 0, H - 1)
    acc += dev[sy, sx].astype(np.float32)
dev = dev.copy(); dev[ys, xs] = (acc / 2).astype(np.uint8)
# 边缘再轻轻融合
edge = cv2.dilate(pm, np.ones((5, 5), np.uint8)) - cv2.erode(pm, np.ones((5, 5), np.uint8))
blur = cv2.GaussianBlur(dev, (5, 5), 0); dev[edge > 0] = blur[edge > 0]
lum = dev.mean(axis=2).astype(np.float32)
bg = cv2.medianBlur(lum.astype(np.uint8), 21).astype(np.float32)
diff = np.abs(lum - bg)
area(370, 852, 516, 878)                      # MONO 和括号线
area(376, 920, 494, 939)                      # IN OUT MIX
area(26, 922, 92, 938)                        # RADIAN LAB
fixed = cv2.inpaint(dev, mask, 6, cv2.INPAINT_TELEA)
# 补回面板颗粒，避免修补处太光滑
rng = np.random.default_rng(7)
grain = float(np.std(lum[790:840, 200:340] - cv2.GaussianBlur(lum, (0, 0), 3)[790:840, 200:340]))
noise = rng.normal(0, grain, (H, W, 1)).astype(np.float32)
m3 = (mask > 0)[..., None]
fixed = np.where(m3, np.clip(fixed.astype(np.float32) + noise, 0, 255), fixed).astype(np.uint8)
# ACTIVE 字和灯在黑色玻璃区：直接涂成周围的黑
blk = fixed[480:503, 455:520].reshape(-1, 3)
fixed[481:503, 457:518] = np.median(blk[blk.sum(1) < 40], axis=0) if (blk.sum(1) < 40).any() else 0

# ---- 2. 拼横版机身：上方宽屏，下方控制条；旋钮凸台仍然压进屏幕下沿 ----
P = 26                      # 外框
Wn, Hn = 1200, 750          # 内部尺寸
PT = 470                    # 屏幕下沿（控制条顶）
OFF = 512 - PT              # 原图里屏幕下沿在 y=512
KX, KY = 760, 556           # 新旋钮圆心（内部坐标）
src = fixed.astype(np.float32)
# 原图左侧 10..90 列的逐行颜色：屏幕黑 → 下沿高光 → 面板
prof = src[:, 10:90].mean(axis=1)
ref = src[560:620, 10:90].reshape(-1, 3).mean(axis=0)
CH, CW = Hn + 2 * P, Wn + 2 * P
canvas = np.zeros((CH, CW, 3), np.float32)
for y in range(CH):
    yi = y - P
    if yi >= PT - 18:
        canvas[y] = prof[min(src.shape[0] - 1, max(0, yi + OFF))]
    else:
        canvas[y] = ref * (1.07 - 0.03 * (y / CH))
# 外框只在屏幕外围：屏幕区域内先填黑，下沿用原图的高光轮廓
canvas[P:P + PT - 18, P:P + Wn] = 0
for y in range(P + PT - 18, P + PT + 22):
    pass   # 已由 prof 覆盖（含黑→高光→面板）
# 外框在屏幕下沿以下就是面板本身：左右两侧 x<P、x>P+Wn 的下沿段改成面板色
for y in range(P + PT - 18, P + PT + 6):
    canvas[y, :P] = ref * 1.04; canvas[y, P + Wn:] = ref * 1.04
# 轻微的左上光照
gx = np.linspace(1.03, 0.97, CW)[None, :, None]; gy = np.linspace(1.02, 0.98, CH)[:, None, None]
lit = canvas * gx * gy
hole_rect = np.zeros((CH, CW), bool); hole_rect[P:P + PT - 18, P:P + Wn] = True
canvas = np.where(hole_rect[..., None], canvas, lit)
# 屏幕开口三边的倒角
x0, x1, y0, y1 = P, P + Wn, P, P + PT - 6
canvas[y0 - 2:y0, x0 - 2:x1 + 2] *= 0.55; canvas[y0 - 4:y0 - 2, x0 - 4:x1 + 4] *= 1.12
canvas[y0 - 2:y1, x0 - 2:x0] *= 0.55; canvas[y0 - 2:y1, x1:x1 + 2] *= 0.55
canvas[y0 - 4:y1, x0 - 4:x0 - 2] *= 1.1; canvas[y0 - 4:y1, x1 + 2:x1 + 4] *= 1.1

def paste(x0s, y0s, x1s, y1s, cx, cy, feather=18, match=True):
    """把原图 (x0s..x1s, y0s..y1s) 贴到新图，(cx,cy) 为该块左上角在内部坐标中的位置"""
    patch = src[y0s:y1s, x0s:x1s].copy()
    h, w = patch.shape[:2]
    X, Y = P + cx, P + cy
    dst = canvas[Y:Y + h, X:X + w]
    if match:   # 用边缘一圈的颜色差做校正，消除明暗接缝
        ring = np.ones((h, w), bool); ring[4:-4, 4:-4] = False
        pr = patch[ring].mean(axis=0); dr = dst[ring].mean(axis=0)
        bright = patch.mean(axis=2) > 25
        patch[bright] += (dr - pr)
    m = np.ones((h, w), np.float32)
    ramp = lambda n: np.clip(np.arange(n) / feather, 0, 1)
    m *= np.minimum(ramp(w), ramp(w)[::-1])[None, :]
    m *= np.minimum(ramp(h), ramp(h)[::-1])[:, None]
    canvas[Y:Y + h, X:X + w] = dst * (1 - m[..., None]) + patch * m[..., None]

# 旋钮（原图圆心 269,598）连同凸台和刻度点；上方黑色部分与屏幕黑相接
kx0, ky0, kx1, ky1 = 96, 430, 444, 792
canvas_before = canvas.copy()
paste(kx0, ky0, kx1, ky1, KX - (269 - kx0), KY - (598 - ky0), feather=22, match=False)
# 凸台以上仍然是屏幕：不羽化，直接用原图的黑
top = slice(P + KY - (598 - ky0), P + PT - 18)
# 圆键（原图 493,673）、方键对、散热孔
paste(463, 643, 523, 703, 1112 - 30, 548 - 30, feather=10)
paste(360, 872, 524, 930, 1010 - 8, 642 - 6, feather=10)
paste(16, 878, 140, 922, 40, 664, feather=10)
# 面板颗粒
rng2 = np.random.default_rng(11)
panel = ~hole_rect
canvas[panel] += rng2.normal(0, grain * 0.9, (panel.sum(), 1))
canvas = np.clip(canvas, 0, 255).astype(np.uint8)
# 屏幕抠透明：从屏幕中心泛洪暗像素
lumc = canvas.mean(axis=2)
dark = (lumc < 22).astype(np.uint8)
ff = np.zeros((CH + 2, CW + 2), np.uint8)
cv2.floodFill(dark, ff, (P + 300, P + 200), 2)
hole = (dark == 2).astype(np.float32)
alpha = 1.0 - cv2.GaussianBlur(hole, (0, 0), 0.8)
alpha = np.where(hole > 0, 0, alpha)
rgba = np.dstack([cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB), (np.clip(alpha, 0, 1) * 255).astype(np.uint8)])
dev_rgb = Image.fromarray(rgba, 'RGBA')
ys, xs = np.where(hole > 0)
print('hole bbox', xs.min(), ys.min(), xs.max(), ys.max())
for x in range(P + KX - 160, P + KX + 170, 20): print('col', x, 'hole bottom', int(ys[xs == x].max()))
dev_rgb.save(out + '/device.webp', quality=90, method=6)
Image.alpha_composite(Image.new('RGBA', dev_rgb.size, (255, 0, 255, 255)), dev_rgb).convert('RGB').save(prev + '/device_alpha_check.png')
print('device', dev_rgb.size, 'knob center', P + KX, P + KY)

# ---- 3. 线稿 → 荧光屏画面 ----
art = np.asarray(Image.open(up + '/house_src.jpg').convert('RGB')).astype(np.float32)
bgc = np.median(art.reshape(-1, 3), axis=0)
art = art[200:1860, 50:2000]                 # 留一点边
d = np.linalg.norm(art - bgc, axis=2)
s = np.clip(d / 165.0, 0, 1) ** 0.9
glow = cv2.GaussianBlur(s, (0, 0), 6) * 0.55
s2 = np.clip(s + glow, 0, 1)
phos = np.array([110, 255, 228], np.float32)
core = np.array([235, 255, 250], np.float32)
base = np.array([5, 13, 15], np.float32)
hot = np.clip((s - 0.75) / 0.25, 0, 1)[..., None]
col = base + s2[..., None] * (phos - base)
col = col * (1 - hot) + core * hot
scr = Image.fromarray(np.clip(col, 0, 255).astype(np.uint8))
scr = scr.resize((1170, round(1170 * scr.height / scr.width)), Image.LANCZOS)
scr.save(out + '/screen.webp', quality=82, method=6)
scr.save(prev + '/screen_preview.png')
print('screen', scr.size)

