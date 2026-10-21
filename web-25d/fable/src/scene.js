// ============================================================
// 寓言公寓 · 3D 场景
// 建筑模型式剖切公寓：无天花板，内墙被“切开”，切面涂成印章红。
// ============================================================
const World = (() => {
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const NIGHT_BG = 0x070b16;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT_BG);
  scene.fog = new THREE.Fog(NIGHT_BG, 18, 55);
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 80);
  const ISO = new THREE.Vector3(11.5, 14.5, 11.5); // 2.5D 等距

  // ---------- 后期：Bloom + 暗角 / 颗粒 / 色偏 / 冷调分级 ----------
  const composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.9, 0.6, 0.72);
  composer.addPass(bloom);
  const grade = new THREE.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAlarm: { value: 0 }, uPulse: { value: 0 }, uFade: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime; uniform float uAlarm; uniform float uPulse; uniform float uFade; varying vec2 vUv;
      float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 d = vUv - 0.5;
        float r = length(d);
        float ca = 0.0016 + r * 0.0035;
        vec3 c;
        c.r = texture2D(tDiffuse, vUv + d * ca).r;
        c.g = texture2D(tDiffuse, vUv).g;
        c.b = texture2D(tDiffuse, vUv - d * ca).b;
        // 冷调分级：暗部偏蓝青，亮部保留暖色
        float l = dot(c, vec3(0.299,0.587,0.114));
        vec3 shadowTint = vec3(0.78, 0.92, 1.12);
        vec3 hiTint = vec3(1.06, 0.98, 0.88);
        c *= mix(shadowTint, hiTint, smoothstep(0.15, 0.75, l));
        c = mix(vec3(l), c, 0.86);
        // 终夜警报：红色压暗
        c = mix(c, c * vec3(1.25, 0.55, 0.5), uAlarm * (0.55 + 0.45 * uPulse));
        // 暗角
        c *= smoothstep(0.92, 0.28, r);
        // 胶片颗粒 + 扫描线
        float g = rnd(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 91.0) - 0.5;
        c += g * 0.055;
        c *= 0.985 + 0.015 * sin(vUv.y * 900.0 + uTime * 4.0);
        c *= 1.0 - uFade;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(grade);

  // ---------- 三阶卡通光照 ----------
  const gradTex = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 1;
    const g = c.getContext('2d');
    ['#2a2a2a', '#7a7a7a', '#c8c8c8', '#ffffff'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i, 0, 1, 1); });
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
    return t;
  })();
  const cache = {};
  function toon(color, emissive, map) {
    const key = color + '_' + (emissive || 0) + '_' + (map ? map.uuid : '');
    if (cache[key]) return cache[key];
    const m = new THREE.MeshToonMaterial({ color, gradientMap: gradTex, map: map || null });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 1.4; }
    cache[key] = m;
    return m;
  }
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x05070d, transparent: true, opacity: 0.55 });

  // ---------- 程序化贴图：旧墙纸、木地板、瓷砖、水泥 ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 4;
    return t;
  }
  function stains(g, w, h, n, col) {
    for (let i = 0; i < n; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 60;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const TEX = {
    wallpaper: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#c9c3b4'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(70,80,90,0.10)'; g.fillRect(x, 0, 14, h); }
      g.strokeStyle = 'rgba(70,80,90,0.18)'; g.lineWidth = 1;
      for (let x = 23; x < w; x += 32) for (let y = 8; y < h; y += 28) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.stroke(); }
      stains(g, w, h, 6, 'rgba(90,70,40,0.16)');
      const grd = g.createLinearGradient(0, h * 0.75, 0, h); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(40,35,25,0.35)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }),
    wood: canvasTex(256, 256, (g, w, h) => {
      for (let y = 0; y < h; y += 32) {
        const base = 70 + Math.random() * 25;
        g.fillStyle = `rgb(${base + 30},${base + 8},${base - 18})`; g.fillRect(0, y, w, 32);
        for (let k = 0; k < 18; k++) { g.fillStyle = 'rgba(30,18,8,0.12)'; g.fillRect(0, y + Math.random() * 32, w, 1); }
        g.fillStyle = 'rgba(15,8,2,0.6)'; g.fillRect(0, y, w, 1.5);
        const off = Math.random() * w; g.fillRect(off, y, 1.5, 32);
      }
      stains(g, w, h, 4, 'rgba(10,6,2,0.25)');
    }, [3, 2]),
    tile: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#7f9a9b'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) for (let y = 0; y < h; y += 32) {
        const v = Math.random() * 14 - 7; g.fillStyle = `rgb(${130 + v},${156 + v},${158 + v})`; g.fillRect(x + 1, y + 1, 30, 30);
      }
      stains(g, w, h, 8, 'rgba(40,55,40,0.3)');
    }, [2, 2]),
    concrete: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#5a5852'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { const v = Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      stains(g, w, h, 10, 'rgba(15,20,25,0.35)');
      g.strokeStyle = 'rgba(10,10,10,0.5)'; g.beginPath(); g.moveTo(20, 40); g.lineTo(90, 110); g.lineTo(130, 120); g.lineTo(210, 220); g.stroke();
    }, [2, 2]),
    metal: canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#3a414a'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; g.fillRect(0, y, w, 1); }
      for (let x = 8; x < w; x += 40) for (let y = 8; y < h; y += 40) { g.fillStyle = '#20252b'; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
    }, [2, 2]),
  };

  function box(parent, w, h, d, color, x, y, z, opt) {
    opt = opt || {};
    const mat = opt.mat || toon(color, opt.emissive, opt.map);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = opt.shadow !== false;
    m.receiveShadow = true;
    if (opt.edges !== false) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edgeMat));
    parent.add(m);
    return m;
  }
  function cyl(parent, r, h, color, x, y, z, seg, opt) {
    opt = opt || {};
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, opt.r2 == null ? r : opt.r2, h, seg || 16), opt.mat || toon(color, opt.emissive));
    m.position.set(x, y + h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function sphere(parent, r, color, x, y, z, emissive) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), toon(color, emissive));
    m.position.set(x, y, z); m.castShadow = true;
    parent.add(m);
    return m;
  }

  // ---------- 文字贴图（门牌、屏幕） ----------
  function textTexture(lines, opt) {
    opt = opt || {};
    const w = opt.w || 512, h = opt.h || 256;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = opt.bg || '#1c2a2a'; g.fillRect(0, 0, w, h);
    g.fillStyle = opt.fg || '#bfe3d9';
    g.font = (opt.size || 34) + 'px "Noto Serif CJK SC", "Songti SC", serif';
    g.textBaseline = 'middle'; g.textAlign = 'center';
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (opt.size || 34) * 1.4));
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function screen(parent, w, h, lines, x, y, z, rotY, opt) {
    const tex = textTexture(lines, opt);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, y, z); m.rotation.y = rotY || 0;
    parent.add(m);
    m.userData.setText = (ls, o) => { m.material.map.dispose(); m.material.map = textTexture(ls, Object.assign({}, opt, o)); m.material.needsUpdate = true; };
    return m;
  }

  // ---------- 灯光 ----------
  const hemi = new THREE.HemisphereLight(0x6f86b8, 0x0a0c18, 0.32);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0x8fb0e8, 0.55);
  sun.position.set(-14, 20, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 60 });
  scene.add(sun);

  const root = new THREE.Group(); scene.add(root);

  // ---------- 布局：规格中的八个区域 ----------
  // 后排 z[-6,0]：卧室 x[-12,-6] | 客厅 x[-6,1] | 厨房 x[1,6] | 阳台 x[6,10]
  // 前排 z[0,6]：设备间 x[-12,-6]（下沉）| 储物间 x[-6,-2] | 玄关 x[-2,4] | 浴室 x[4,10]
  const ROOMS = {
    bedroom: { name: '卧室', x0: -12, x1: -6, z0: -6, z1: 0, y: 0, floor: 0xb89878, tex: 'wood' },
    living: { name: '客厅', x0: -6, x1: 1, z0: -6, z1: 0, y: 0, floor: 0xa98a6c, tex: 'wood' },
    kitchen: { name: '厨房', x0: 1, x1: 6, z0: -6, z1: 0, y: 0, floor: 0xd2cdbf, tex: 'tile' },
    balcony: { name: '阳台', x0: 6, x1: 10, z0: -6, z1: 0, y: 0, floor: 0x9a9184, tex: 'concrete' },
    plant: { name: '楼下设备间', x0: -12, x1: -6, z0: 0, z1: 6, y: -1.4, floor: 0xb0aaa0, tex: 'concrete' },
    storage: { name: '储物间', x0: -6, x1: -2, z0: 0, z1: 6, y: 0, floor: 0x8c7258, tex: 'wood' },
    entry: { name: '玄关', x0: -2, x1: 4, z0: 0, z1: 6, y: 0, floor: 0x8c7258, tex: 'wood' },
    bath: { name: '浴室', x0: 4, x1: 10, z0: 0, z1: 6, y: 0, floor: 0xd8e4e2, tex: 'tile' },
  };
  const floors = [];
  const WALL = 0xb8b4aa, H = 3.2;
  const roomRoot = {};
  Object.keys(ROOMS).forEach(k => {
    const g = new THREE.Group(); g.name = 'room_' + k; root.add(g); roomRoot[k] = g;
  });
  Object.entries(ROOMS).forEach(([k, r]) => {
    const f = box(roomRoot[k], r.x1 - r.x0, 0.2, r.z1 - r.z0, r.floor, (r.x0 + r.x1) / 2, r.y - 0.2, (r.z0 + r.z1) / 2, { shadow: false, map: TEX[r.tex] });
    f.userData.floor = k; floors.push(f);
  });

  // 只建背墙（-Z）与左墙（-X），朝相机的两面切开
  function wall(parent, x0, z0, x1, z1, h, y, gaps) {
    y = y || 0; gaps = gaps || [];
    const horiz = z0 === z1;
    const len = horiz ? x1 - x0 : z1 - z0;
    let segs = [[0, len]];
    gaps.forEach(([a, b]) => {
      segs = segs.flatMap(([s, e]) => (b <= s || a >= e) ? [[s, e]] : [[s, a], [b, e]].filter(([p, q]) => q - p > 0.05));
    });
    let wg = parent.children.find(c => c.name === 'walls');
    if (!wg) { wg = new THREE.Group(); wg.name = 'walls'; parent.add(wg); }
    segs.forEach(([s, e]) => {
      const mid = (s + e) / 2, l = e - s;
      const px = horiz ? x0 + mid : x0, pz = horiz ? z0 : z0 + mid;
      box(wg, horiz ? l : 0.14, h, horiz ? 0.14 : l, WALL, px, y, pz, { map: TEX.wallpaper });
      const ix = horiz ? px : px + 0.09, iz = horiz ? pz + 0.09 : pz;
      box(wg, horiz ? l : 0.04, 0.95, horiz ? 0.04 : l, WAINSCOT, ix, y, iz, { map: TEX.wood, edges: false });
      box(wg, horiz ? l : 0.08, 0.05, horiz ? 0.08 : l, 0x2a1d14, ix, y + 0.95, iz, { edges: false });
      box(wg, horiz ? l : 0.06, 0.12, horiz ? 0.06 : l, 0x1e150f, ix, y, iz, { edges: false });
    });
    gaps.forEach(([a, b]) => {
      const mid = (a + b) / 2, l = b - a;
      const px = horiz ? x0 + mid : x0, pz = horiz ? z0 : z0 + mid;
      box(wg, horiz ? l : 0.14, 0.45, horiz ? 0.14 : l, WALL, px, y + 2.25, pz, { map: TEX.wallpaper });
    });
  }
  const WAINSCOT = 0x4a3a2c;
  function curb(parent, r) {
    const g = new THREE.Group(); g.name = 'cutaway'; parent.add(g);
    box(g, r.x1 - r.x0, 0.55, 0.14, WAINSCOT, (r.x0 + r.x1) / 2, r.y, r.z1, { map: TEX.wood });
    box(g, 0.14, 0.55, r.z1 - r.z0, WAINSCOT, r.x1, r.y, (r.z0 + r.z1) / 2, { map: TEX.wood });
    box(g, r.x1 - r.x0 + 0.14, 0.04, 0.2, 0x2a1d14, (r.x0 + r.x1) / 2 + 0.07, r.y + 0.55, r.z1, { edges: false });
    box(g, 0.2, 0.04, r.z1 - r.z0, 0x2a1d14, r.x1, r.y + 0.55, (r.z0 + r.z1) / 2, { edges: false });
    return g;
  }
  const veilMat = new THREE.MeshBasicMaterial({ color: 0x03050b, transparent: true, opacity: 0.32, depthWrite: false });
  Object.entries(ROOMS).forEach(([k, r]) => {
    const v = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0 + 0.02, 3.4, r.z1 - r.z0 + 0.02), veilMat);
    v.position.set((r.x0 + r.x1) / 2, r.y + 1.5, (r.z0 + r.z1) / 2);
    v.renderOrder = 10; v.name = 'veil'; v.visible = false;
    roomRoot[k].add(v);
  });
  // 背墙 / 左墙，门洞与 DOORS 对应
  wall(roomRoot.bedroom, -12, -6, -6, -6, H, 0);
  wall(roomRoot.bedroom, -12, -6, -12, 0, H, 0);
  wall(roomRoot.living, -6, -6, 1, -6, H, 0);
  wall(roomRoot.living, -6, -6, -6, 0, H, 0, [[3.2, 4.8]]);           // ← 卧室
  wall(roomRoot.kitchen, 1, -6, 6, -6, H, 0);
  wall(roomRoot.kitchen, 1, -6, 1, 0, H, 0, [[3.2, 4.8]]);            // ← 客厅
  wall(roomRoot.balcony, 6, -6, 10, -6, 1.1, 0);                      // 阳台外侧是矮栏杆
  wall(roomRoot.balcony, 6, -6, 6, 0, H, 0, [[3.2, 4.8]]);            // ← 厨房
  wall(roomRoot.plant, -12, 0, -6, 0, H, -1.4);
  wall(roomRoot.plant, -12, 0, -12, 6, H, -1.4);
  wall(roomRoot.storage, -6, 0, -2, 0, H, 0, [[1.2, 2.8]]);           // ↑ 客厅
  wall(roomRoot.storage, -6, 0, -6, 6, H, 0, [[2.0, 3.6]]);           // ← 设备间（台阶）
  wall(roomRoot.entry, -2, 0, 4, 0, H, 0, [[2.0, 3.6]]);              // ↑ 客厅
  wall(roomRoot.entry, -2, 0, -2, 6, H, 0, [[2.2, 3.8]]);             // ← 储物间
  wall(roomRoot.bath, 4, 0, 10, 0, H, 0);
  wall(roomRoot.bath, 4, 0, 4, 6, H, 0, [[2.2, 3.8]]);                // ← 玄关
  Object.entries(ROOMS).forEach(([k, r]) => curb(roomRoot[k], r));

  // ---------- 交互物 ----------
  const interact = {};
  function reg(id, obj, label, stand) {
    obj.traverse(o => { if (o.isMesh) o.userData.iid = id; });
    const room = (obj.parent && obj.parent.name || '').replace('room_', '') || roomOf(obj.position.x, obj.position.z);
    interact[id] = { id, obj, label, room, stand: new THREE.Vector3(stand[0], 0, stand[1]), visible: true, hidden: false };
    return obj;
  }
  function roomOf(x, z) {
    for (const [k, r] of Object.entries(ROOMS)) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return k;
    for (const [k, r] of Object.entries(ROOMS)) if (x >= r.x0 - 0.3 && x <= r.x1 + 0.3 && z >= r.z0 - 0.3 && z <= r.z1 + 0.3) return k;
    return 'entry';
  }
  function group(x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    (roomRoot[roomOf(x, z)] || root).add(g);
    return g;
  }
  // 设备状态灯：每台家电 AI 头顶一颗小灯，审议时依次亮起
  const statusLeds = {};
  function led(id, g, y) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5ad1b8 }));
    m.position.set(0, y, 0); m.userData.keep = true; g.add(m); statusLeds[id] = m;
    return m;
  }

  // 客厅：小灯（落地灯）、电视、扫地机、餐桌须知
  const lampG = group(-5.2, 0, -5.2);
  cyl(lampG, 0.18, 0.06, 0x2a2118, 0, 0, 0, 12);
  cyl(lampG, 0.03, 1.6, 0x2a2118, 0, 0.06, 0, 6);
  const lampShade = cyl(lampG, 0.32, 0.36, 0xf2d79a, 0, 1.6, 0, 16, { r2: 0.22, emissive: 0x6a4a10 });
  led('lamp', lampG, 2.15);
  reg('lamp', lampG, '小灯', [-4.4, -4.2]);

  const tv = group(-1.6, 0, -5.6);
  box(tv, 2.4, 0.5, 0.5, 0x3e342b, 0, 0, 0);
  box(tv, 2.2, 1.2, 0.08, 0x111111, 0, 0.9, 0.1);
  const tvScreen = screen(tv, 2.05, 1.05, ['今天，没有居民', '错过适合自己的安排'], 0, 1.5, 0.15, 0, { bg: '#1d3a3a', size: 34 });
  led('tv', tv, 2.3);
  reg('tv', tv, '电视', [-1.6, -4.0]);

  const sofa = group(-2.6, 0, -2.4);
  box(sofa, 3.0, 0.5, 1.1, 0x6a7f73, 0, 0, 0); box(sofa, 3.0, 0.7, 0.3, 0x5b6e63, 0, 0.5, 0.45);
  reg('sofa', sofa, '沙发', [-2.6, -1.2]);

  const table = group(-4.6, 0, -2.0);
  box(table, 1.2, 0.72, 0.9, 0x8c6b4a, 0, 0, 0);
  box(table, 0.42, 0.04, 0.3, 0xefe6d4, 0, 0.72, 0);
  reg('notice', table, '《住户须知》', [-4.6, -0.9]);

  // 扫地机：会真实移动的设备
  const robot = group(-0.6, 0, -1.2);
  cyl(robot, 0.32, 0.12, 0x2b3236, 0, 0, 0, 20);
  cyl(robot, 0.1, 0.03, 0x5ad1b8, 0, 0.12, 0, 12, { emissive: 0x1a6a5a });
  led('robot', robot, 0.32);
  reg('robot', robot, '扫地机', [0, -0.6]);

  const blood = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.22), new THREE.MeshBasicMaterial({ color: 0x5a1410, transparent: true, opacity: 0.0, depthWrite: false }));
  blood.rotation.x = -Math.PI / 2; blood.position.set(1.0, 0.012, 1.2); blood.userData.keep = true;
  roomRoot.entry.add(blood);

  // 厨房：冰箱（订单屏）、废物盒
  const fridge = group(2.0, 0, -5.4);
  box(fridge, 1.0, 2.1, 0.9, 0xdedad0, 0, 0, 0);
  const planScreen = screen(fridge, 0.7, 0.5, ['订单', '照常补货'], 0, 1.4, 0.46, 0, { size: 44 });
  led('fridge', fridge, 2.3);
  reg('fridge', fridge, '冰箱', [2.0, -4.0]);
  const counter = group(4.4, 0, -5.4);
  box(counter, 2.6, 0.95, 0.9, 0xd8cdb8, 0, 0, 0);
  box(counter, 2.7, 0.06, 1.0, 0x5c4e3d, 0, 0.95, 0, { edges: false });
  const binG = group(5.4, 0, -2.2);
  box(binG, 0.5, 0.6, 0.5, 0x6a6a64, 0, 0, 0);
  reg('waste', binG, '厨余废物盒', [4.6, -2.2]);
  const acG = group(3.4, 2.6, -5.85);
  box(acG, 1.3, 0.38, 0.28, 0xeeeae0, 0, 0, 0);
  led('ac', acG, 0.55);
  reg('ac', acG, '空调', [3.4, -4.2]);

  // 阳台：绿萝、浇水器、城市景观
  const potG = group(7.6, 0, -4.4);
  cyl(potG, 0.32, 0.5, 0xa0583a, 0, 0, 0, 14, { r2: 0.24 });
  for (let i = 0; i < 6; i++) { const l = sphere(potG, 0.22, 0x5b8a46, Math.cos(i) * 0.25, 0.75 + (i % 3) * 0.12, Math.sin(i) * 0.25); l.scale.set(1, 0.5, 1); }
  reg('pothos', potG, '绿萝', [7.6, -3.2]);
  const waterG = group(8.8, 0, -4.6);
  box(waterG, 0.3, 0.9, 0.3, 0x7aa0a0, 0, 0, 0);
  led('water', waterG, 1.05);
  reg('water', waterG, '自动浇水器', [8.8, -3.4]);
  const win = group(8.0, 0, -5.95);
  const cityTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 120;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 120); grd.addColorStop(0, '#1b1f3a'); grd.addColorStop(1, '#3c2f4f');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 120);
    for (let i = 0; i < 18; i++) {
      const bw = 10 + Math.random() * 18, bh = 30 + Math.random() * 80, bx = i * 14;
      g.fillStyle = '#121426'; g.fillRect(bx, 120 - bh, bw, bh);
      for (let k = 0; k < 10; k++) { g.fillStyle = Math.random() > 0.5 ? '#f1c27a' : '#80d6c8'; g.fillRect(bx + 2 + (k % 3) * 4, 120 - bh + 4 + Math.floor(k / 3) * 9, 2, 3); }
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  })();
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.7), new THREE.MeshBasicMaterial({ map: cityTex }));
  pane.position.set(0, 2.1, -0.2); pane.userData.keep = true; win.add(pane);
  reg('city', win, '城市景观', [8.0, -4.6]);

  // 卧室：音箱、窗帘、私人储物、床
  const bed = group(-10.4, 0, -4.2);
  box(bed, 2.2, 0.45, 1.6, 0x7b5a3e, 0, 0, 0); box(bed, 2.1, 0.2, 1.5, 0xefe6d4, 0, 0.45, 0);
  reg('bed', bed, '床 · 休息', [-9.0, -3.0]);
  const speaker = group(-7.4, 0, -5.5);
  box(speaker, 0.4, 0.55, 0.4, 0x2a2f36, 0, 0.5, 0);
  box(speaker, 0.6, 0.5, 0.5, 0x6b4a22, 0, 0, 0);
  led('speaker', speaker, 1.2);
  reg('speaker', speaker, '音箱', [-7.4, -4.2]);
  const curtain = group(-11.9, 0, -2.0);
  box(curtain, 0.06, 2.6, 1.8, 0x445a52, 0, 0.2, 0);
  reg('curtain', curtain, '窗帘', [-11.0, -2.0]);
  const locker = group(-11.6, 0, -0.8);
  box(locker, 0.6, 1.1, 0.7, 0x5e4430, 0, 0, 0);
  reg('locker', locker, '私人储物柜', [-10.8, -0.8]);

  // 储物间：扫地机充电座、旧工具柜、撬门碎片
  const dock = group(-5.4, 0, 5.4);
  box(dock, 0.6, 0.2, 0.3, 0x2b3236, 0, 0, 0);
  reg('dock', dock, '扫地机充电座', [-4.8, 4.6]);
  const tools = group(-5.6, 0, 1.0);
  box(tools, 0.7, 1.6, 0.9, 0x6b5a48, 0, 0, 0);
  reg('tools', tools, '旧工具柜', [-4.6, 1.0]);
  const shard = group(-3.0, 0, 4.6);
  box(shard, 0.22, 0.04, 0.12, 0xb0b4b8, 0, 0, 0, { emissive: 0x3a3a3a });
  reg('shard', shard, '金属碎片', [-3.0, 3.8]);

  // 玄关：门锁、鞋柜、状态屏、门框撬痕
  const door = group(1.0, 0, 0.1);
  box(door, 1.5, 2.5, 0.12, 0x5a3b2a, 0, 0, 0);
  sphere(door, 0.06, 0xc9842a, -0.5, 1.1, 0.1);
  const lockLed = sphere(door, 0.05, 0xc45c4a, -0.5, 1.5, 0.1, 0xc45c4a);
  led('lock', door, 2.7);
  reg('lock', door, '门锁', [1.0, 1.4]);
  const scratch = group(0.1, 0, 0.12);
  box(scratch, 0.06, 1.2, 0.02, 0x2a1d14, 0, 0.5, 0, { edges: false });
  reg('scratch', scratch, '门框内侧的划痕', [0.2, 1.2]);
  const statusScr = group(2.6, 0, 0.1);
  box(statusScr, 0.55, 0.42, 0.06, 0x2e343b, 0, 1.4, 0);
  const camScreen = screen(statusScr, 0.46, 0.34, ['住户', '已确认'], 0, 1.61, 0.04, 0, { size: 46 });
  reg('status', statusScr, '状态屏', [2.6, 1.3]);
  const shoes = group(-1.6, 0, 4.4);
  box(shoes, 0.6, 0.9, 1.8, 0x9a7b58, 0, 0, 0);
  reg('shoes', shoes, '鞋柜', [-0.8, 4.4]);

  // 浴室：镜面、本地人数传感器
  const tub = group(7.8, 0, 1.2);
  box(tub, 2.4, 0.75, 1.1, 0xf4f1ea, 0, 0, 0);
  box(tub, 2.1, 0.05, 0.85, 0x8fc3c8, 0, 0.62, 0, { edges: false });
  reg('tub', tub, '浴缸', [7.8, 2.4]);
  const mirror = group(5.4, 0, 0.12);
  box(mirror, 1.0, 1.4, 0.08, 0x8c6b4a, 0, 1.0, 0);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.2), new THREE.MeshToonMaterial({ color: 0x9fd6d0, emissive: new THREE.Color(0x2a6b66), emissiveIntensity: 0.6, gradientMap: gradTex }));
  glass.position.set(0, 1.7, 0.05); glass.userData.keep = true; mirror.add(glass);
  box(mirror, 0.9, 0.85, 0.5, 0xf4f1ea, 0, 0, 0.25);
  led('mirror', mirror, 2.6);
  reg('mirror', mirror, '浴室镜面', [5.4, 1.4]);

  // 楼下设备间：备用电力、楼内旧广播
  const power = group(-10.6, -1.4, 1.2);
  box(power, 1.2, 1.6, 0.7, 0x3a4a3e, 0, 0, 0);
  for (let i = 0; i < 4; i++) box(power, 0.18, 0.18, 0.04, 0xc9842a, -0.4 + i * 0.27, 1.0, 0.36, { edges: false, emissive: 0x3a2808 });
  reg('power', power, '备用电力', [-10.0, 2.2]);
  const radio = group(-7.6, -1.4, 4.8);
  box(radio, 1.2, 0.8, 0.6, 0x6b4a22, 0, 0, 0);
  cyl(radio, 0.04, 0.9, 0x2a2118, 0.4, 0.8, 0, 6);
  reg('radio', radio, '楼内旧广播', [-7.6, 3.6]);
  const echo = group(-10.8, -1.4, 4.6);
  box(echo, 0.9, 1.4, 0.7, 0x4a3d33, 0, 0, 0);
  const echoEye = sphere(echo, 0.09, 0x401a17, 0.3, 1.1, 0.36, 0x200808);
  const echoLight = new THREE.PointLight(0xc45c4a, 0.0, 6); echoLight.position.set(0, 1.2, 0.7); echo.add(echoLight);
  reg('reject_log', echo, '求助驳回记录机', [-9.8, 4.6]);
  // 储物间 → 设备间的台阶（在储物间西侧门洞外）
  for (let i = 0; i < 5; i++) box(roomRoot.plant, 0.42, 0.28, 1.6, 0x8a7a66, -6.2 - i * 0.42, -0.28 * (i + 1), 2.8);

  // 住家：中枢，悬浮在客厅中央的暖色光环
  const qing = group(-1.4, 2.5, -3.0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 32), toon(0xf2b75b, 0xc9842a));
  ring.rotation.x = Math.PI / 2; qing.add(ring);
  sphere(qing, 0.16, 0xffe2a8, 0, 0, 0, 0xf2b75b);
  const qingLight = new THREE.PointLight(0xf2b75b, 0.9, 7); qing.add(qingLight);
  reg('home', qing, '住家', [-1.4, -1.8]);

  // 装饰道具（Tripo 模型）
  const DECOS = [
    ['deco_board', -10.0, 0, -5.92, '周岚的线索板', [-10.0, -4.6]],
    ['deco_lamp', -7.6, 0.55, -5.0, '台灯', [-7.6, -4.0]],
    ['deco_plant', 0.4, 0, -5.3, '绿植', [0.4, -4.2]],
    ['deco_chair', -4.2, 0, -1.2, '转椅', [-4.2, -0.4]],
    ['deco_phone', -4.8, 0.72, -2.2, '电话', [-4.8, -1.0]],
    ['deco_sidetable', -7.4, 0, -5.0, '床头柜', [-7.4, -4.0]],
    ['deco_typewriter', -4.3, 0.72, -1.9, '打字机', [-4.3, -0.9]],
    ['deco_bin', -0.6, 0, -0.6, '废纸篓', [-0.6, 0.0]],
    ['deco_clock', -3.0, 0, -5.92, '挂钟', [-3.0, -4.6]],
    ['deco_laundry', 9.2, 0, 4.8, '洗衣篮', [8.4, 4.8]],
    ['deco_stool', 6.4, 0, 2.6, '小凳', [6.4, 3.4]],
    ['deco_filing', -3.0, 0, 0.8, '文件柜', [-3.0, 1.8]],
    ['deco_fan', 5.2, 0.95, -5.3, '风扇', [5.2, -4.2]],
    ['deco_coatrack', 3.4, 0, 4.8, '衣帽架', [2.6, 4.8]],
    ['deco_umbrella', 3.4, 0, 1.2, '伞架', [2.6, 1.2]],
    ['deco_boxes', -4.2, 0, 5.2, '档案箱', [-4.2, 4.2]],
    ['deco_cardboard', -11.2, -1.4, 3.0, '纸箱堆', [-10.2, 3.0]],
    ['deco_shelf', -8.8, -1.4, 0.4, '铁架', [-8.8, 1.4]],
  ];
  DECOS.forEach(([id, x, y, z, label, stand]) => {
    const g = group(x, y, z);
    box(g, 0.4, 0.4, 0.4, 0x6a5844, 0, 0, 0);
    g.userData.deco = true;
    reg(id, g, label, stand);
  });

  // ---------- 玩家 ----------
  const player = new THREE.Group();
  const body = cyl(player, 0.24, 0.9, 0x2a6b66, 0, 0, 0, 10, { r2: 0.3 });
  sphere(player, 0.2, 0xf0d6b4, 0, 1.12, 0);
  const shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
  shadowDisc.rotation.x = -Math.PI / 2; shadowDisc.position.y = 0.02; shadowDisc.userData.keep = true; player.add(shadowDisc);
  player.position.set(1.0, 0, 2.6);
  root.add(player);
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.35, 24), new THREE.MeshBasicMaterial({ color: 0xc9842a }));
  marker.rotation.x = -Math.PI / 2; marker.visible = false; root.add(marker);

  function floorY(x, z) {
    if (x < -6 && z > 0) {
      if (x > -8.3 && z > 2.0 && z < 3.6) return -1.4 * Math.min(1, (-6 - x) / 2.1);
      return -1.4;
    }
    return 0;
  }

  // ---------- 相机：单房间斜角构图 ----------
  // 相机从切开的 +X/+Z 墙角往里看，类似参考图的等距透视
  const cam3 = { yaw: 0.62, pitch: 0.62, dist: 14, target: new THREE.Vector3(0, 0, 0), focus: new THREE.Vector3(0, 0, 0), userYaw: 0, userPitch: 0, userZoom: 1 };
  let activeRoom = null;
  function roomFrame(k) {
    const r = ROOMS[k];
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const span = Math.max(w, d * 1.3);
    // 稍微拉远一点，让隔壁房间在画面边缘露出一角
    return {
      cx: (r.x0 + r.x1) / 2 + 0.3, cy: r.y + 1.0, cz: (r.z0 + r.z1) / 2 + 0.2,
      dist: 8.2 + span * 1.08,
    };
  }
  // 2.5D 正交：固定等距方向，只平移与缩放；dist 换算为正交视野半高
  let viewAspect = 16 / 9;
  function updateCamera() {
    cam3.target.lerp(cam3.focus, 0.08);
    const t = cam3.target;
    const yaw = cam3.yaw + cam3.userYaw * 0.5, pitch = cam3.pitch + cam3.userPitch * 0.4;
    const D = 30;
    camera.position.set(
      t.x + Math.sin(yaw) * Math.cos(pitch) * D,
      t.y + Math.sin(pitch) * D,
      t.z + Math.cos(yaw) * Math.cos(pitch) * D
    );
    camera.lookAt(t);
    const half = cam3.dist * 0.36 * cam3.userZoom;
    const want = { top: half, bottom: -half, left: -half * viewAspect, right: half * viewAspect };
    if (Math.abs(camera.top - want.top) > 1e-3 || Math.abs(camera.right - want.right) > 1e-3) {
      camera.top += (want.top - camera.top) * 0.12;
      camera.bottom = -camera.top;
      camera.right = camera.top * viewAspect;
      camera.left = -camera.right;
      camera.updateProjectionMatrix();
    }
  }
  let onRoomChange = null;
  // 每个房间「微微能看到」的邻居：只看相机这一侧（+X 右边、+Z 前下方）和左侧，不看被背墙挡住的
  function neighbours(k) {
    const r = ROOMS[k], out = [];
    Object.entries(ROOMS).forEach(([n, o]) => {
      if (n === k) return;
      const touchX = (Math.abs(o.x0 - r.x1) < 0.01 || Math.abs(o.x1 - r.x0) < 0.01) && o.z0 < r.z1 && o.z1 > r.z0;
      const touchZ = (Math.abs(o.z0 - r.z1) < 0.01 || Math.abs(o.z1 - r.z0) < 0.01) && o.x0 < r.x1 && o.x1 > r.x0;
      if (touchX || touchZ) out.push(n);
    });
    return out;
  }
  function showRoom(k, instant) {
    if (!ROOMS[k] || k === activeRoom) return;
    activeRoom = k;
    const nb = new Set(neighbours(k));
    Object.entries(roomRoot).forEach(([rk, g]) => {
      const main = rk === k, side = nb.has(rk);
      g.visible = main || side;
      g.children.forEach(c => {
        if (c.name === 'veil') c.visible = side;
        // 邻居的墙会挡在当前房间前面：保留邻居的地板和家具，墙体只在当前房间显示
        if (c.name === 'walls') c.visible = main || !(ROOMS[rk].x0 >= ROOMS[k].x1 - 0.01 || ROOMS[rk].z0 >= ROOMS[k].z1 - 0.01);
        if (c.name === 'cutaway') c.visible = main || side;
      });
    });
    // 灯光不切 visible（会触发着色器重编译导致卡顿），只调亮度
    Object.entries(roomLights).forEach(([rk, L]) => {
      L.on = rk === k || nb.has(rk);
      L.cone.visible = rk === k; L.fixture.forEach(m => m.visible = L.on);
    });
    // 唯一投影的主光跟着当前房间走
    const [lx, lz] = LAMP_POS[k];
    keyLight.position.set(lx, ROOMS[k].y + 2.65, lz);
    moonBeam.visible = k === 'balcony' || nb.has('balcony');
    moon.userData.on = moonBeam.visible;
    const f = roomFrame(k);
    cam3.focus.set(f.cx, f.cy, f.cz);
    cam3.dist = f.dist;
    cam3.userYaw = 0; cam3.userPitch = 0;
    if (instant) cam3.target.copy(cam3.focus);
    // 灰尘只落在当前房间里
    const r = ROOMS[k];
    for (let i = 0; i < DUST; i++) {
      dp[i * 3] = r.x0 + Math.random() * (r.x1 - r.x0);
      dp[i * 3 + 1] = r.y + Math.random() * 3.0;
      dp[i * 3 + 2] = r.z0 + Math.random() * (r.z1 - r.z0);
    }
    dust.userData.room = r;
    onRoomChange && onRoomChange(k);
  }
  let fade = 0, fadeDir = 0, pendingRoom = null;
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(r.width, r.height);
    viewAspect = r.width / Math.max(1, r.height);
    camera.right = camera.top * viewAspect; camera.left = -camera.right;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // ---------- 输入 ----------
  const ray = new THREE.Raycaster(); ray.params.Line.threshold = 0.01; const mouse = new THREE.Vector2();
  let hoverId = null, drag = null, onInteract = null, onHover = null, locked = false;
  let walk = null;
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const objs = [];
    Object.values(interact).forEach(it => { if (it.visible && it.room === activeRoom && !it.obj.userData.deco) objs.push(it.obj); });
    const ex = exits.filter(e => e.userData.exit.from === activeRoom);
    const hits = ray.intersectObjects(objs.concat(ex, floors.filter(f => f.userData.floor === activeRoom)), true);
    for (const h of hits) {
      if (h.object.userData.exit) {
        const ex = h.object.userData.exit;
        // 通往锁住房间的出口，如果有对应的「门」交互物，就交给它处理（比如输口令）
        const gate = Object.values(interact).find(it => it.gate === ex.to && it.visible && it.room === activeRoom);
        if (gate && lockedRooms.has(ex.to)) return { iid: gate.id, point: h.point };
        return { exit: ex, point: h.point };
      }
      if (h.object.userData.iid && interact[h.object.userData.iid].visible) return { iid: h.object.userData.iid, point: h.point };
      if (h.object.userData.floor) return { floor: h.object.userData.floor, point: h.point };
    }
    return null;
  }
  function setHighlight(id, on) {
    if (!id || !interact[id]) return;
    interact[id].obj.traverse(o => {
      if (o.isMesh && o.visible && o.material && (o.material.isMeshToonMaterial || o.material.isMeshLambertMaterial)) {
        if (on) { o.userData.origMat = o.material; o.material = o.material.clone(); o.material.emissive = new THREE.Color(0xc9842a); o.material.emissiveIntensity = 0.35; }
        else if (o.userData.origMat) { o.material.dispose(); o.material = o.userData.origMat; delete o.userData.origMat; }
      }
    });
  }
  canvas.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, uy: cam3.userYaw, up: cam3.userPitch, moved: false }; });
  window.addEventListener('pointerup', ev => {
    if (drag && !drag.moved && !locked) {
      const p = pick(ev);
      if (p && p.iid) goTo(interact[p.iid].stand, () => onInteract && onInteract(p.iid));
      else if (p && p.exit) {
        const r = ROOMS[p.exit.to];
        // 走过门洞，落在隔壁房间里一步远的位置
        const tx = p.exit.target[0] + Math.sign((r.x0 + r.x1) / 2 - p.exit.target[0]) * 0.6;
        const tz = p.exit.target[1] + Math.sign((r.z0 + r.z1) / 2 - p.exit.target[1]) * 0.6;
        goTo({ x: tx, z: tz }, null);
      }
      else if (p && p.floor) goTo(p.point, null);
    }
    drag = null;
  });
  canvas.addEventListener('pointermove', ev => {
    if (drag) {
      const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (drag.moved) {
        // 只允许小幅度环视，避免看到被切掉的墙外
        cam3.userYaw = Math.max(-0.35, Math.min(0.35, drag.uy - dx * 0.003));
        cam3.userPitch = Math.max(-0.2, Math.min(0.3, drag.up + dy * 0.0025));
      }
      return;
    }
    const p = locked ? null : pick(ev);
    const id = p && p.iid ? p.iid : null;
    const exitLabel = p && p.exit ? '前往 · ' + ROOMS[p.exit.to].name + (lockedRooms.has(p.exit.to) ? '（锁着）' : '') : null;
    const key = id || exitLabel;
    if (key !== hoverId) {
      setHighlight(hoverId, false); hoverId = key; setHighlight(id, true);
      onHover && onHover(id ? interact[id].label : exitLabel);
    }
    canvas.style.cursor = key ? 'pointer' : 'default';
  });
  canvas.addEventListener('wheel', ev => { ev.preventDefault(); cam3.userZoom = Math.max(0.6, Math.min(1.35, cam3.userZoom + ev.deltaY * 0.0012)); }, { passive: false });

  // 房间连通图：门洞路点
  const DOORS = [
    ['living', 'bedroom', [[-5.5, -2.0], [-6.5, -2.0]]],
    ['living', 'kitchen', [[0.5, -2.0], [1.5, -2.0]]],
    ['kitchen', 'balcony', [[5.5, -2.0], [6.5, -2.0]]],
    ['living', 'storage', [[-4.0, -0.5], [-4.0, 0.5]]],
    ['living', 'entry', [[0.8, -0.5], [0.8, 0.5]]],
    ['entry', 'storage', [[-1.5, 3.0], [-2.5, 3.0]]],
    ['entry', 'bath', [[3.5, 3.0], [4.5, 3.0]]],
    ['storage', 'plant', [[-5.5, 2.8], [-8.6, 2.8]]],
  ];
  let lockedRooms = new Set();
  function roomPath(a, b) {
    const prev = { [a]: null }, q = [a];
    while (q.length) {
      const r = q.shift(); if (r === b) break;
      DOORS.forEach(([x, y, pts]) => {
        [[x, y, pts], [y, x, pts.slice().reverse()]].forEach(([s, t, p]) => {
          if (s === r && !(t in prev) && !lockedRooms.has(t)) { prev[t] = { from: r, pts: p }; q.push(t); }
        });
      });
    }
    if (!(b in prev)) return null;
    const out = []; let cur = b;
    while (prev[cur]) { out.unshift(...prev[cur].pts); cur = prev[cur].from; }
    return out;
  }
  // ---------- 出口：门洞处的发光地标，点击走到隔壁房间 ----------
  const exits = [];
  const exitTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,214,140,0.95)'); r.addColorStop(0.55, 'rgba(255,190,100,0.35)'); r.addColorStop(1, 'rgba(255,190,100,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  DOORS.forEach(([a, b, pts]) => {
    [[a, b, pts[0], pts[1]], [b, a, pts[pts.length - 1], pts[0]]].forEach(([from, to, here, beyond]) => {
      const r = ROOMS[from];
      const mat = new THREE.MeshBasicMaterial({ map: exitTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(here[0], r.y + 0.04, here[1]);
      m.userData.exit = { from, to, target: beyond };
      roomRoot[from].add(m);
      exits.push(m);
    });
  });

  let onBlocked = null;
  function goTo(pt, cb) {
    const tgt = new THREE.Vector3(Math.max(-11.6, Math.min(9.6, pt.x)), 0, Math.max(-5.6, Math.min(5.7, pt.z)));
    const from = roomAt(player.position.x, player.position.z) || 'entry';
    const to = roomAt(tgt.x, tgt.z) || from;
    if (lockedRooms.has(to) && to !== from) { onBlocked && onBlocked(to); return; }
    const path = roomPath(from, to);
    if (!path) { onBlocked && onBlocked(to); return; }
    const raw = path.map(([x, z]) => new THREE.Vector3(x, 0, z)).concat([tgt]);
    const queue = [];
    let last = player.position.clone();
    raw.forEach(pt => {
      if (last.distanceTo(pt) > 0.12) queue.push(pt);
      last = pt;
    });
    if (!queue.length) { cb && cb(); return; }
    walk = { queue, tgt: queue.shift(), cb };
    marker.position.set(tgt.x, floorY(tgt.x, tgt.z) + 0.03, tgt.z); marker.visible = true;
  }
  function roomAt(x, z) {
    for (const [k, r] of Object.entries(ROOMS)) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return k;
    return null;
  }

  // ---------- 氛围：吊灯 + 假体积光锥 + 闪烁 + 灰尘 ----------
  function coneTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 128);
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = h; g.fillRect(0, 0, 64, 128);
    return new THREE.CanvasTexture(c);
  }
  const coneTex = coneTexture();
  function lightCone(parent, x, y, z, rTop, rBot, h, color, opacity) {
    const mat = new THREE.MeshBasicMaterial({ color, map: coneTex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 24, 1, true), mat);
    m.position.set(x, y - h / 2, z);
    parent.add(m);
    return m;
  }
  const LAMP_POS = {
    bedroom: [-9.0, -3.0], living: [-2.6, -3.0], kitchen: [3.6, -3.2], balcony: [8.0, -2.6],
    plant: [-9.0, 3.0], storage: [-4.0, 3.0], entry: [1.0, 3.0], bath: [7.0, 3.2],
  };
  // 投影主光：暖色，模拟参考图里台灯/吊灯打在家具上的硬阴影
  const keyLight = new THREE.PointLight(0xffc98a, 1.6, 11, 1.4);
  keyLight.castShadow = true; keyLight.shadow.mapSize.set(1024, 1024); keyLight.shadow.bias = -0.003; keyLight.shadow.radius = 3;
  root.add(keyLight);
  const roomLights = {};
  Object.entries(ROOMS).forEach(([k, r]) => {
    const [x, z] = LAMP_POS[k];
    const top = r.y + 3.0;
    const l = new THREE.PointLight(0xffc477, 0.5, 10, 1.2);
    l.position.set(x, top - 0.35, z);
    root.add(l);
    // 吊线 + 灯罩 + 灯泡
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 4), toon(0x111111));
    cord.position.set(x, top + 0.3, z); root.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 18, 1, true), toon(0x3d4a3a));
    shade.position.set(x, top - 0.05, z); root.add(shade);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bulbMat);
    bulb.position.set(x, top - 0.18, z); root.add(bulb);
    const cone = lightCone(root, x, top - 0.25, z, 0.3, 1.9, top - 0.25 - r.y, 0xffc477, 0.12);
    roomLights[k] = { l, bulbMat, cone, fixture: [cord, shade, bulb], base: 0.5, flicker: k === 'storage' || k === 'plant' };
  });

  // 月光：穿过窗户的冷色光柱
  const moon = new THREE.SpotLight(0x7fa6ff, 0.9, 16, 0.38, 0.6, 1.2);
  moon.position.set(8.0, 3.2, -8); moon.target.position.set(7.0, 0, -1.5);
  moon.castShadow = true; moon.shadow.mapSize.set(512, 512);
  root.add(moon); root.add(moon.target);
  const moonBeam = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 6.5), new THREE.MeshBasicMaterial({ color: 0x6f95ff, map: coneTex, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  moonBeam.position.set(7.6, 1.4, -3.2); moonBeam.rotation.set(-1.0, 0, 0); root.add(moonBeam);

  // 灰尘粒子
  const DUST = 420;
  const dustGeo = new THREE.BufferGeometry();
  const dp = new Float32Array(DUST * 3), dv = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) { dp[i * 3] = -10 + Math.random() * 20; dp[i * 3 + 1] = -1.3 + Math.random() * 4.4; dp[i * 3 + 2] = -6 + Math.random() * 12; dv[i] = 0.5 + Math.random(); }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dustTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.06, map: dustTex, color: 0xd8e2ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  root.add(dust);

  let alarm = 0, focusRoom = 'living';
  function setMood(m) {
    // m: { focus: roomKey, night: bool, alarm: bool }
    focusRoom = m.focus;
    Object.entries(roomLights).forEach(([k, L]) => {
      const col = m.alarm ? 0xff3b2a : (k === m.focus ? 0xffc477 : 0xbcc8e0);
      L.l.color.set(col); L.bulbMat.color.set(col); L.cone.material.color.set(col);
      L.base = k === m.focus ? 2.6 : (m.night ? 0.45 : 0.8);
      L.cone.material.opacity = k === m.focus ? 0.22 : 0.07;
    });
    hemi.intensity = m.night ? 0.42 : 0.55;
    sun.intensity = m.night ? 0.3 : 0.45;
    moon.intensity = m.night ? 2.2 : 1.6;
    alarm = m.alarm ? 1 : 0;
  }

  const clock = new THREE.Clock();
  let tick = null;
  // 自适应画质：连续卡顿就关掉 Bloom、降低像素比
  const LITE = /[?&]lite/.test(location.search);
  let slow = 0, degraded = false;
  function degrade() {
    if (degraded) return; degraded = true;
    bloom.enabled = false;
    renderer.setPixelRatio(1); resize();
  }
  if (LITE) degrade();
  function loop() {
    const raw = clock.getDelta();
    if (!degraded) { slow = raw > 0.06 ? slow + raw : Math.max(0, slow - raw); if (slow > 2.5) degrade(); }
    const dt = Math.min(0.05, raw);
    const t = clock.elapsedTime;
    const vis = player.userData.visual || body;
    if (walk) {
      const p = player.position;
      const d = new THREE.Vector3(walk.tgt.x - p.x, 0, walk.tgt.z - p.z);
      const len = d.length();
      if (len < 0.12 && walk.queue.length) { walk.tgt = walk.queue.shift(); }
      else if (len < 0.12) { const cb = walk.cb; walk = null; marker.visible = false; cb && cb(); vis.position.y = 0; }
      else {
        const desired = Math.atan2(d.x, d.z);
        let dy = desired - player.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        player.rotation.y += dy * Math.min(1, 12 * dt);
        d.normalize().multiplyScalar(Math.min(len, 4.2 * dt));
        p.x += d.x; p.z += d.z;
        vis.position.y = Math.abs(Math.sin(t * 11)) * 0.06;
      }
    } else if (vis) vis.position.y += (0 - vis.position.y) * Math.min(1, 8 * dt);
    const fy = floorY(player.position.x, player.position.z);
    player.position.y += (fy - player.position.y) * Math.min(1, 8 * dt);
    // 穿过门洞：切换到新房间（先黑场，再显示）
    const cur = roomAt(player.position.x, player.position.z);
    if (cur && cur !== activeRoom && !pendingRoom) { pendingRoom = cur; fadeDir = 1; }
    if (fadeDir === 1) {
      fade = Math.min(1, fade + dt * 5);
      if (fade >= 1) { if (pendingRoom) { showRoom(pendingRoom); pendingRoom = null; cam3.target.copy(cam3.focus); } fadeDir = -1; }
    } else if (fade > 0) fade = Math.max(0, fade - dt * 2.6);
    // 镜头在房间框内轻微跟随玩家
    if (activeRoom) {
      const f = roomFrame(activeRoom);
      cam3.focus.set(f.cx + (player.position.x - f.cx) * 0.18, f.cy, f.cz + (player.position.z - f.cz) * 0.18);
    }
    ring.rotation.z += dt * 0.6; qing.position.y = 2.4 + Math.sin(t * 1.5) * 0.08;
    const pulse = Math.abs(Math.sin(t * 2.6));
    Object.entries(roomLights).forEach(([k, L]) => {
      let f = 1;
      if (L.flicker || alarm) {
        // 坏灯管：偶发的快速断电
        const n = Math.sin(t * 23.0 + k.length * 7.1) * Math.sin(t * 3.7 + k.length);
        if (n > 0.86) f = 0.15 + Math.random() * 0.3;
      }
      if (alarm) f *= 0.45 + pulse * 0.9;
      // 只有当前房间可见，所以当前房间总是亮的；剧情焦点房间更亮
      L.l.intensity = (k === activeRoom ? Math.max(L.base, 1.9) : L.on ? 0.55 : 0) * f;
      L.cone.visible = k === activeRoom && f > 0.4;
    });
    const pa = dust.geometry.attributes.position.array;
    for (let i = 0; i < DUST; i++) {
      pa[i * 3 + 1] += Math.sin(t * 0.3 + i) * 0.0012 - 0.0009 * dv[i];
      pa[i * 3] += Math.cos(t * 0.2 + i * 0.7) * 0.0012;
      if (pa[i * 3 + 1] < -1.3) pa[i * 3 + 1] = 3.1;
    }
    dust.geometry.attributes.position.needsUpdate = true;
    grade.uniforms.uTime.value = t;
    grade.uniforms.uAlarm.value = alarm;
    grade.uniforms.uPulse.value = pulse;
    grade.uniforms.uFade.value = fade;
    if (tick) tick(dt, t);
    Models.tick && Models.tick(dt, t);
    updateCamera();
    composer.render();
    requestAnimationFrame(loop);
  }

  return {
    start() { resize(); showRoom(roomAt(player.position.x, player.position.z) || 'entry', true); loop(); },
    showRoom, activeRoom: () => activeRoom,
    onRoomChange(fn) { onRoomChange = fn; },
    interact, ROOMS,
    roomAt: () => roomAt(player.position.x, player.position.z),
    onInteract(fn) { onInteract = fn; },
    onHover(fn) { onHover = fn; },
    onBlocked(fn) { onBlocked = fn; },
    setLockedRooms(arr) { lockedRooms = new Set(arr); },
    isWalking: () => !!walk,
    lock(v) { locked = v; if (v) { setHighlight(hoverId, false); hoverId = null; onHover && onHover(null); } },
    setVisible(id, v) { interact[id].visible = v; interact[id].obj.visible = v; },
    setMood, goTo,
    teleport(x, z) {
      player.position.set(x, floorY(x, z), z); walk = null; marker.visible = false;
      const k = roomAt(x, z); if (k) { pendingRoom = null; fadeDir = 0; showRoom(k, true); }
    },
    screens: { tv: tvScreen, plan: planScreen, cam: camScreen },
    lamps: { lockLed, echoEye, echoLight, qingLight, glass, lampShade },
    statusLeds, blood, robot, shard, potG, roomRoot,
    toon, setTick(fn) { tick = fn; },
    renderer, player, gradTex, cam3,
  };
})();
