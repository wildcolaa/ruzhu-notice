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

# ---- 2. 裁掉底部抽屉，四周补一圈机身边框 ----
CUT = 985
P = 26
img = fixed[:CUT]
Hc = img.shape[0]
canvas = np.zeros((Hc + P, W + 2 * P, 3), np.float32)
canvas[P:, P:P + W] = img
panel_top = 512
# 面板区：沿用左右最外侧 6 列的颜色（取均值，不会拉出条纹）
left = img[:, :6].astype(np.float32).mean(axis=1)
right = img[:, -6:].astype(np.float32).mean(axis=1)
ref = img[panel_top + 30:panel_top + 80, :].reshape(-1, 3).astype(np.float32).mean(axis=0)
for y in range(Hc):
    if y >= panel_top + 4:
        canvas[P + y, :P] = left[y]; canvas[P + y, P + W:] = right[y]
    else:
        t = y / panel_top
        c = ref * (1.06 - 0.06 * t)          # 顶部略亮，像光从上方打下来
        canvas[P + y, :P] = c; canvas[P + y, P + W:] = c
for y in range(P):
    canvas[y] = ref * 1.07
# 屏幕开口的内倒角：上沿和两侧一道暗边、一道细高光
x0, x1, y0 = P, P + W, P
canvas[y0 - 2:y0, x0 - 2:x1 + 2] *= 0.55
canvas[y0 - 4:y0 - 2, x0 - 4:x1 + 4] *= 1.12
canvas[y0 - 2:P + panel_top + 2, x0 - 2:x0] *= 0.55
canvas[y0 - 2:P + panel_top + 2, x1:x1 + 2] *= 0.55
canvas[y0 - 4:P + panel_top + 2, x0 - 4:x0 - 2] *= 1.1
canvas[y0 - 4:P + panel_top + 2, x1 + 2:x1 + 4] *= 1.1
# 面板接缝处平滑过渡
canvas[P + panel_top - 2:P + panel_top + 6, :P] = cv2.GaussianBlur(canvas[P + panel_top - 6:P + panel_top + 10, :P], (1, 9), 0)[4:12]
canvas[P + panel_top - 2:P + panel_top + 6, P + W:] = cv2.GaussianBlur(canvas[P + panel_top - 6:P + panel_top + 10, P + W:], (1, 9), 0)[4:12]
# 边框颗粒
border = np.ones(canvas.shape[:2], bool); border[P:, P:P + W] = False
canvas[border] += rng.normal(0, grain, (border.sum(), 1))
canvas = np.clip(canvas, 0, 255).astype(np.uint8)
# 屏幕开口抠成透明：从屏幕中心向外泛洪暗像素，网页里的 CRT 层放在机身下面，旋钮凸台自然压住屏幕
lumc = canvas.mean(axis=2)
dark = (lumc < 22).astype(np.uint8)
ff = np.zeros((dark.shape[0] + 2, dark.shape[1] + 2), np.uint8)
cv2.floodFill(dark, ff, (P + 270, P + 200), 2)
hole = (dark == 2).astype(np.float32)
alpha = 1.0 - cv2.GaussianBlur(hole, (0, 0), 0.8)
alpha = np.where(hole > 0, np.minimum(alpha, 1 - hole), alpha)
rgba = np.dstack([cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB), (np.clip(alpha, 0, 1) * 255).astype(np.uint8)])
dev_rgb = Image.fromarray(rgba, 'RGBA')
ys, xs = np.where(hole > 0)
print('hole bbox', xs.min(), ys.min(), xs.max(), ys.max())
# 凹口：每列透明区的最低点
for x in range(150, 460, 20): print('col', x, 'hole bottom', int(ys[xs == x].max()) if (xs == x).any() else None)
dev_rgb.save(out + '/device.webp', quality=90, method=6)
dev_rgb.save(prev + '/device_preview.png')
Image.alpha_composite(Image.new('RGBA', dev_rgb.size, (255, 0, 255, 255)), dev_rgb).convert('RGB').save(prev + '/device_alpha_check.png')
print('device', dev_rgb.size)

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
print('P', P, 'W', W + 2 * P, 'H', Hc + P)
