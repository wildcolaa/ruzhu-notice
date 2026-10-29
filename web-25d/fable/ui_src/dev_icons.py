"""家电手绘图 → 荧光终端风格头像（去假透明棋盘格背景 + 荧光绿双色调）
用法: python3 ui_src/dev_icons.py ui_src/dev ui [预览png]（源图 ui_src/dev/<设备id>.webp）"""
import sys, os, glob, numpy as np, cv2
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]; prev = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(dst, exist_ok=True)
DARK = np.array([6, 14, 13], float); MID = np.array([38, 104, 86], float); PH = np.array([170, 255, 226], float)
tiles = []
for f in sorted(glob.glob(os.path.join(src, '*.*'))):
    name = os.path.splitext(os.path.basename(f))[0]
    L = np.asarray(Image.open(f).convert('L')).astype(np.float32)
    H, W = L.shape
    # 背景 = 从边框连通的浅色区域（棋盘格 243..255）；先把墨线闭合一下，防止从缝里漏进去
    border = np.concatenate([L[:8].ravel(), L[-8:].ravel(), L[:, :8].ravel(), L[:, -8:].ravel()])
    bgv = np.percentile(border, 10)
    ink = (L < bgv - 9).astype(np.uint8)
    ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    free = (1 - ink).astype(np.uint8)
    ff = free.copy(); m = np.zeros((H + 2, W + 2), np.uint8)
    for (x, y) in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1), (W // 2, 0), (W // 2, H - 1), (0, H // 2), (W - 1, H // 2)]:
        if ff[y, x]: cv2.floodFill(ff, m, (x, y), 2)
    bg = (ff == 2)
    # 去掉小碎块（只留最大的连通物体及较大的部件）
    n, lab, st, _ = cv2.connectedComponentsWithStats((~bg).astype(np.uint8))
    big = st[1:, cv2.CC_STAT_AREA].max()
    for k in range(1, n):
        if st[k, cv2.CC_STAT_AREA] < big * 0.02: bg[lab == k] = True
    # 柔化 alpha 边缘
    a = (~bg).astype(np.float32)
    a = cv2.GaussianBlur(cv2.erode(a, np.ones((3, 3), np.uint8)), (0, 0), 1.6)
    # 物体内部也有棋盘格（空调、镜子、气泡）：亮区压平
    Lf = np.where(L > bgv - 6, 246, L)
    Lf = cv2.GaussianBlur(Lf, (0, 0), 0.6)
    t = np.clip((Lf - 18) / (246 - 18), 0, 1) ** 1.15
    # 三段色：暗部近黑、中间调深青、亮部荧光绿
    c = np.where(t[..., None] < .55, DARK + (MID - DARK) * (t[..., None] / .55), MID + (PH - MID) * ((t[..., None] - .55) / .45))
    # 轮廓描一圈亮边（像显像管上的线稿）
    edge = cv2.dilate((~bg).astype(np.uint8), np.ones((5, 5), np.uint8)) - (~bg).astype(np.uint8)
    edge = cv2.GaussianBlur(edge.astype(np.float32), (0, 0), 2.2)
    rgb = np.clip(c, 0, 255)
    alpha = np.clip(a + edge * 0.55, 0, 1)
    rgb = rgb * (1 - edge[..., None] * .6) + PH * edge[..., None] * .6
    img = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    im = Image.fromarray(img, 'RGBA')
    bb = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    im = im.crop(bb); s = max(im.size); pad = int(s * .06)
    sq = Image.new('RGBA', (s + 2 * pad, s + 2 * pad), (0, 0, 0, 0))
    sq.paste(im, ((s - im.size[0]) // 2 + pad, (s - im.size[1]) // 2 + pad))
    sq = sq.resize((256, 256), Image.LANCZOS)
    sq.save(os.path.join(dst, 'dev_' + name + '.webp'), quality=82, method=6)
    tiles.append((name, sq))
if prev:
    P = Image.new('RGBA', (6 * 260, 2 * 260), (6, 11, 11, 255))
    for i, (n, t) in enumerate(tiles): P.alpha_composite(t, ((i % 6) * 260 + 2, (i // 6) * 260 + 2))
    P.convert('RGB').save(prev)
print(len(tiles), 'icons')
