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
  renderer.toneMappingExposure = 0.9;

  const NIGHT_BG = 0x050505;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT_BG);
  scene.fog = new THREE.Fog(NIGHT_BG, 18, 55);
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 80);
  const ISO = new THREE.Vector3(11.5, 14.5, 11.5); // 2.5D 等距

  // ---------- 后期：Bloom + 暗角 / 颗粒 / 色偏 / 冷调分级 ----------
  const composer = new THREE.EffectComposer(renderer);
  const depthRT = new THREE.WebGLRenderTarget(1, 1);
  depthRT.texture.minFilter = THREE.NearestFilter; depthRT.texture.magFilter = THREE.NearestFilter;
  depthRT.depthTexture = new THREE.DepthTexture(1, 1); depthRT.depthTexture.type = THREE.UnsignedInt248Type || THREE.UnsignedIntType;
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.8, 0.72);
  composer.addPass(bloom);
  // 油画滤镜（极乐迪斯科的手绘感）：Kuwahara 取四个象限里方差最小的平均色，
  // 边缘保持锐利、平坦处变成一块块颜料；半径随屏幕大小缩放
  const paint = new THREE.ShaderPass({
    uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1280, 720) }, uR: { value: 3.0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uR; varying vec2 vUv;
      void main(){
        vec2 px = 1.0 / uRes;
        vec3 m[4]; vec3 s2[4];
        for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s2[k] = vec3(0.0); }
        const int R = 3;
        for (int j = -R; j <= R; j++) for (int i = -R; i <= R; i++) {
          vec3 c = texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * px * uR / 3.0).rgb;
          if (i <= 0 && j <= 0) { m[0] += c; s2[0] += c * c; }
          if (i >= 0 && j <= 0) { m[1] += c; s2[1] += c * c; }
          if (i <= 0 && j >= 0) { m[2] += c; s2[2] += c * c; }
          if (i >= 0 && j >= 0) { m[3] += c; s2[3] += c * c; }
        }
        float n = float((R + 1) * (R + 1));
        float best = 1e9; vec3 outc = vec3(0.0);
        for (int k = 0; k < 4; k++) {
          vec3 mu = m[k] / n; vec3 v = abs(s2[k] / n - mu * mu);
          float sv = v.r + v.g + v.b;
          if (sv < best) { best = sv; outc = mu; }
        }
        gl_FragColor = vec4(outc, 1.0);
      }`,
  });
  composer.addPass(paint);
  // ---------- 体积雾 ----------
  // 指数高度雾（贴着地面最浓、往上变薄）沿视线积分 + 灯光散射（光源附近的雾被照亮，形成光晕/光柱感）
  // + 缓慢飘动的噪声，让雾成团成缕。读 RenderPass 之外单独渲染的深度。
  const FOG_L = 6, FOG_B = 6;
  const fogPass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: null },
      uInvVP: { value: new THREE.Matrix4() }, uCamDir: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uDensity: { value: 0.16 },   // 整体浓度
      uFall: { value: 0.38 },       // 高度衰减：越大雾越贴地
      uBase: { value: 0.0 },       // 雾层底面高度（地下室房间时下移）
      uFogCol: { value: new THREE.Color(0.26, 0.30, 0.34) },
      uLPos: { value: Array.from({ length: FOG_L }, () => new THREE.Vector3(0, -99, 0)) },
      uLCol: { value: Array.from({ length: FOG_L }, () => new THREE.Color(0)) },
      uScatter: { value: 1.0 },
      // 丁达尔光束：起点、方向、颜色、张角
      uShaftP: { value: Array.from({ length: FOG_B }, () => new THREE.Vector3()) },
      uShaftD: { value: Array.from({ length: FOG_B }, () => new THREE.Vector3()) },
      uShaftC: { value: Array.from({ length: FOG_B }, () => new THREE.Color(0)) },
      uShaftA: { value: new Array(FOG_B).fill(0.1) },
      uShaftW: { value: Array.from({ length: FOG_B }, () => new THREE.Vector2(0.6, 0.6)) },   // 光体起点的半宽 / 半高
      uShaftL: { value: new Array(FOG_B).fill(5) },                                          // 光体长度
      uBeamI: { value: 0.22 },
      // 聚光灯：光池中心（地面）、半径、灯高、光色；光池外的亮度比例
      uSpot: { value: new THREE.Vector3(1, 0, 2.6) }, uSpotR: { value: 3.0 }, uSpotH: { value: 4.2 }, uSpotC: { value: new THREE.Color(1.0, 0.82, 0.6) }, uOutDim: { value: 0.3 },
      uSteps: { value: 16 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      #define NL ${FOG_L}
      #define NB ${FOG_B}
      uniform sampler2D tDiffuse; uniform sampler2D tDepth;
      uniform mat4 uInvVP; uniform vec3 uCamDir; uniform float uTime;
      uniform float uDensity; uniform float uFall; uniform float uBase; uniform vec3 uFogCol;
      uniform vec3 uLPos[NL]; uniform vec3 uLCol[NL]; uniform float uScatter;
      uniform vec3 uShaftP[NB]; uniform vec3 uShaftD[NB]; uniform vec3 uShaftC[NB]; uniform float uShaftA[NB];
      uniform vec2 uShaftW[NB]; uniform float uShaftL[NB]; uniform float uBeamI; uniform float uSteps;
      uniform vec3 uSpot; uniform float uSpotR; uniform float uSpotH; uniform vec3 uSpotC; uniform float uOutDim;
      varying vec2 vUv;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
      vec3 unproject(vec2 uv, float d){ vec4 v = uInvVP * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float depth = texture2D(tDepth, vUv).x;
        if (depth >= 0.99999) { gl_FragColor = c; return; }
        // 正交相机：所有视线平行。从场景上方 4m 的平面开始积分到命中点（之上没有雾）
        vec3 hit = unproject(vUv, depth);
        vec3 rd = normalize(uCamDir);
        float top = uBase + 4.0;
        float tIn = (top - hit.y) / -rd.y;          // 命中点往回到雾顶的长度
        vec3 ro = hit - rd * tIn;                    // 雾顶的入口
        float L = tIn;
        // 解析积分：密度 = d * exp(-fall * (y - base))
        float h0 = ro.y - uBase;
        float k = uFall * rd.y;
        float fogInt = uDensity * exp(-uFall * h0) * (abs(k) > 1e-4 ? (1.0 - exp(-k * L)) / k : L);
        // 噪声：在命中点附近、接近地面的层里取样，缓慢漂移
        vec3 q = hit * vec3(0.55, 1.2, 0.55) + vec3(uTime * 0.05, 0.0, uTime * 0.035);
        float n = noise(q) * 0.6 + noise(q * 2.3 + 7.1) * 0.4;
        fogInt *= 0.4 + n * 1.2;
        float fog = 1.0 - exp(-fogInt);
        // 灯光散射：视线到每盏灯的最近距离 → 高斯光晕，只计算在命中点之前的那一段
        vec3 inscat = vec3(0.0);
        for (int i = 0; i < NL; i++) {
          vec3 lp = uLPos[i];
          if (lp.y < -50.0) continue;
          float t = clamp(dot(lp - ro, rd), 0.0, L);
          vec3 pc = ro + rd * t;
          float d2 = dot(lp - pc, lp - pc);
          // 光源下方雾更浓（光柱往下）
          float below = smoothstep(0.0, 1.0, lp.y - pc.y + 0.3);
          inscat += uLCol[i] * (0.7 * exp(-d2 * 1.0) + 0.3 * exp(-d2 * 0.2)) * (0.35 + 0.55 * below) * (0.6 + n * 0.6);
        }
        vec3 fc = uFogCol * (0.7 + n * 0.5);
        // ---- 窗光体积：参考图那种整片、柔和、充满房间的冷色光雾（不是细光条）----
        // 每扇窗投出一个很宽、往里慢慢张开的光体；横截面中间亮、边缘大范围柔化；
        // 只叠很轻的噪声，让雾里有层次但不出现条纹
        vec3 beams = vec3(0.0);
        const int NS = 16;
        for (int i = 0; i < NB; i++) {
          vec3 sd = uShaftD[i];
          if (dot(sd, sd) < 0.25) continue;
          vec3 bc = uShaftP[i] + sd * (uShaftL[i] * 0.5);
          float br = uShaftL[i] * 0.5 + max(uShaftW[i].x, uShaftW[i].y) + uShaftA[i] * uShaftL[i];
          vec3 oc = bc - ro; float tb = dot(oc, rd);
          if (dot(oc, oc) - tb * tb > br * br || tb + br < 0.0 || tb - br > L) continue;
          float ca = dot(-rd, sd);
          float g = 0.45, g2 = g * g;
          float phase = 0.6 + 0.4 * (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * ca, 1.5);
          vec3 ux = normalize(cross(sd, abs(sd.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vec3 uy = cross(sd, ux);
          vec3 acc = vec3(0.0);
          for (int j = 0; j < NS; j++) {
            if (float(j) >= uSteps) break;
            float tj = (float(j) + 0.5 + (n - 0.5) * 0.8) / uSteps;
            vec3 q = ro + rd * (L * tj);
            vec3 v = q - uShaftP[i];
            float ax = dot(v, sd);
            if (ax < -0.2 || ax > uShaftL[i]) continue;
            vec3 cr = v - sd * ax;
            float w = uShaftW[i].x + uShaftA[i] * max(ax, 0.0), h = uShaftW[i].y + uShaftA[i] * max(ax, 0.0);
            // 超椭圆软边：中心一大块亮，往外 60% 的宽度都在渐隐
            float ex = abs(dot(cr, ux)) / w, ey = abs(dot(cr, uy)) / h;
            float r = pow(pow(ex, 4.0) + pow(ey, 4.0), 0.25);
            float m = 1.0 - smoothstep(0.35, 1.0, r);
            if (m <= 0.0) continue;
            float st = 0.75 + 0.5 * noise(vec3(q.x * 0.9 + uTime * 0.04, q.y * 0.9, q.z * 0.9 - uTime * 0.03));
            // 窗口处最亮，往屋里越走越淡（光被雾吃掉）
            float fade = smoothstep(-0.2, 0.4, ax) * exp(-ax * 0.42);
            float hq = q.y - uBase;
            float dn = smoothstep(-0.1, 0.5, hq) * (0.55 + 0.45 * exp(-0.35 * max(hq, 0.0)));
            acc += vec3(m * st * fade * dn);
          }
          beams += uShaftC[i] * acc * phase;
        }
        beams *= L / uSteps * uBeamI;
        // 当前房间之外：压暗（软边 0.5m），像灯只开在这一间
        // ---- 聚光灯：以主角为中心的圆形光池，光池外压暗 ----
        // 光从主角头顶 uSpotH 米处往下打：越高处的圆越小（锥形），墙面也只亮靠近主角的那一段
        float hh = clamp(hit.y - uSpot.y, 0.0, uSpotH);
        float rr = uSpotR * (1.0 - 0.55 * hh / uSpotH);
        float dsp = length(hit.xz - uSpot.xz);
        float outside = smoothstep(rr * 0.2, rr * 1.65, dsp);   // 过渡带很宽：光从中心慢慢渐暗
        outside = max(outside, smoothstep(0.2, 0.6, uSpot.y - hit.y));     // 低于主角所在地面（楼下）也算外面
        float keep = mix(1.0, uOutDim, outside);
        beams *= keep; inscat *= keep;
        // 光锥体积：从灯口到地面的一束圆锥，雾在里面被照亮
        vec3 apex = uSpot + vec3(0.0, uSpotH, 0.0);
        vec3 coneAcc = vec3(0.0);
        for (int j = 0; j < 12; j++) {
          float tj = (float(j) + 0.5 + (n - 0.5) * 0.7) / 12.0;
          vec3 q = ro + rd * (L * tj);
          float down = apex.y - q.y;
          if (down < 0.0 || down > uSpotH) continue;
          float cr = uSpotR * (0.45 * down / uSpotH + 0.08) / 0.53;      // 圆锥半径：灯口小、到地面约 uSpotR
          float rq = length(q.xz - apex.xz);
          float m = 1.0 - smoothstep(cr * 0.15, cr * 1.5, rq);
          coneAcc += vec3(m * (0.45 + 0.55 * down / uSpotH) * (0.75 + 0.5 * noise(q * 1.3 + vec3(0.0, uTime * 0.08, 0.0))));
        }
        vec3 spotFog = uSpotC * coneAcc * (L / 12.0) * 0.14;
        c.rgb = mix(c.rgb * keep, fc * mix(1.0, 0.4, outside), fog) + inscat * uScatter * (0.25 + fog) + beams * uScatter + spotFog * uScatter;
        gl_FragColor = c;
      }`,
  });
  composer.addPass(fogPass);
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
        // 极乐迪斯科式分级：暗部偏青灰蓝，中间调去饱和，高光暖白
        float l = dot(c, vec3(0.299,0.587,0.114));
        vec3 shadowTint = vec3(0.80, 0.90, 1.02);
        vec3 midTint = vec3(0.98, 0.97, 0.94);
        vec3 hiTint = vec3(1.10, 1.02, 0.88);
        vec3 tint = mix(shadowTint, midTint, smoothstep(0.05, 0.35, l));
        tint = mix(tint, hiTint, smoothstep(0.45, 0.85, l));
        c *= tint;
        c = mix(vec3(l), c, 0.72);
        // 轻微 S 曲线：压黑暗部（参考图里画面外是纯黑），提一点亮部
        c = clamp(c, 0.0, 1.0);
        c = c * c * (3.0 - 2.0 * c) * 0.55 + c * 0.45;
        c = max(c - 0.015, 0.0) * 1.03;
        // 画布纹理：纵横交织的细纹，只在中间调可见
        float weave = sin(vUv.x * 1400.0) * sin(vUv.y * 1400.0 * 0.62);
        c *= 1.0 + weave * 0.018 * smoothstep(0.08, 0.5, l);
        // 终夜警报：红色压暗
        c = mix(c, c * vec3(1.25, 0.55, 0.5), uAlarm * (0.55 + 0.45 * uPulse));
        // 暗角
        c *= smoothstep(0.92, 0.28, r);
        // 胶片颗粒 + 扫描线
        float g = rnd(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 91.0) - 0.5;
        c += g * 0.03;
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
      g.fillStyle = '#c4b49a'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(90,60,35,0.10)'; g.fillRect(x, 0, 14, h); }
      g.strokeStyle = 'rgba(90,60,35,0.18)'; g.lineWidth = 1;
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
      g.fillStyle = '#7a7a68'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) for (let y = 0; y < h; y += 32) {
        const v = Math.random() * 14 - 7; g.fillStyle = `rgb(${150 + v},${146 + v},${126 + v})`; g.fillRect(x + 1, y + 1, 30, 30);
      }
      stains(g, w, h, 8, 'rgba(40,55,40,0.3)');
    }, [2, 2]),
    concrete: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#5a5852'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { const v = Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      stains(g, w, h, 10, 'rgba(15,20,25,0.35)');
      g.strokeStyle = 'rgba(10,10,10,0.5)'; g.beginPath(); g.moveTo(20, 40); g.lineTo(90, 110); g.lineTo(130, 120); g.lineTo(210, 220); g.stroke();
    }, [2, 2]),
    // 斑驳的灰白墙（参考图一卧室）：大块灰色笔触 + 霉斑 + 剥落
    plaster: canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#a7a8a2'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 320; i++) {
        const x = Math.random() * w, y = Math.random() * h, L = 30 + Math.random() * 90, a = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
        const v = 130 + Math.random() * 60;
        g.strokeStyle = `rgba(${v},${v + 2},${v - 4},${0.10 + Math.random() * 0.14})`;
        g.lineWidth = 6 + Math.random() * 16; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
      }
      stains(g, w, h, 10, 'rgba(60,62,55,0.22)');
      stains(g, w, h, 5, 'rgba(110,95,60,0.18)');
      const grd = g.createLinearGradient(0, h, 0, h * 0.55); grd.addColorStop(0, 'rgba(40,40,36,0.45)'); grd.addColorStop(1, 'rgba(40,40,36,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }, [1, 1]),
    // 六边形墙纸（参考图一中间房间）：深蓝底 + 灰白六边形描边
    hexpaper: canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#323a4c'; g.fillRect(0, 0, w, h);
      const R = 64, dx = R * Math.sqrt(3), dy = R * 1.5;
      g.lineWidth = 9; g.strokeStyle = '#6f7686';
      for (let row = -1; row * dy < h + R; row++) for (let col = -1; col * dx < w + R; col++) {
        const cx = col * dx + (row % 2 ? dx / 2 : 0), cy = row * dy;
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * R * 0.82, cy + Math.sin(a) * R * 0.82); }
        g.closePath(); g.stroke();
        g.lineWidth = 3; g.strokeStyle = 'rgba(160,165,175,0.35)';
        g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6); } g.closePath(); g.stroke();
        g.lineWidth = 9; g.strokeStyle = '#6f7686';
      }
      // 手绘不均匀：涂抹一层随机深浅
      for (let i = 0; i < 160; i++) { const v = Math.random() > 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},0.035)`; g.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 60, 30 + Math.random() * 60); }
      stains(g, w, h, 6, 'rgba(10,10,14,0.35)');
    }, [1, 1]),
    // 黑白马赛克地砖（参考图一、三）：小方砖 + 每隔几块的深色点缀 + 污渍
    mosaic: canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#4a4d4a'; g.fillRect(0, 0, w, h);
      const S = 12;
      for (let y = 0; y < h; y += S) for (let x = 0; x < w; x += S) {
        const i = x / S, j = y / S;
        const dark = (i % 4 === 0 && j % 4 === 0);
        const v = dark ? 78 + Math.random() * 18 : 158 + Math.random() * 26;
        g.fillStyle = `rgb(${v - 4},${v},${v - 6})`;
        g.fillRect(x + 1, y + 1, S - 2, S - 2);
      }
      stains(g, w, h, 12, 'rgba(60,50,30,0.28)');
      stains(g, w, h, 6, 'rgba(20,20,20,0.30)');
    }, [2, 2]),
    // 棋盘格地砖（厨房，参考图三）
    checker: canvasTex(256, 256, (g, w, h) => {
      const S = 32;
      for (let y = 0; y < h; y += S) for (let x = 0; x < w; x += S) {
        const on = ((x + y) / S) % 2 === 0;
        if (on) { const v = 170 + Math.random() * 18; g.fillStyle = `rgb(${v},${v - 6},${v - 22})`; }
        else { const v = 62 + Math.random() * 12; g.fillStyle = `rgb(${v - 6},${v + 2},${v - 4})`; }
        g.fillRect(x, y, S, S);
      }
      g.strokeStyle = 'rgba(30,28,24,0.5)'; g.lineWidth = 1;
      for (let i = 0; i <= w; i += S) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
      stains(g, w, h, 8, 'rgba(70,55,30,0.3)');
    }, [3, 3]),
    // 地下室地面：赭褐色水泥，大块油画笔触 + 水渍 + 裂缝
    cellar: canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#4a3c2e'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {   // 笔触：斜向长条，深浅交错
        const x = Math.random() * w, y = Math.random() * h, L = 20 + Math.random() * 70, a = -0.6 + Math.random() * 0.4;
        const v = Math.random();
        g.strokeStyle = v < 0.5 ? `rgba(30,22,14,${0.12 + Math.random() * 0.18})` : `rgba(${120 + Math.random() * 40},${92 + Math.random() * 30},${58 + Math.random() * 20},${0.10 + Math.random() * 0.14})`;
        g.lineWidth = 3 + Math.random() * 9; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
      }
      stains(g, w, h, 14, 'rgba(12,9,6,0.45)');
      stains(g, w, h, 6, 'rgba(70,82,74,0.22)');     // 发霉的灰绿
      g.strokeStyle = 'rgba(10,8,6,0.65)'; g.lineWidth = 1.5;
      for (let k = 0; k < 5; k++) { let x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 6; j++) { x += (Math.random() - 0.3) * 50; y += (Math.random() - 0.3) * 50; g.lineTo(x, y); } g.stroke(); }
    }, [1, 1]),
    // 地下室墙：剥落的灰绿漆，露出底下的砖和水泥
    peel: canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#545a48'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 180; i++) {
        const x = Math.random() * w, y = Math.random() * h;
        g.strokeStyle = `rgba(${70 + Math.random() * 40},${76 + Math.random() * 40},${60 + Math.random() * 30},0.25)`;
        g.lineWidth = 4 + Math.random() * 10; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 30, y + 30 + Math.random() * 60); g.stroke();
      }
      // 剥落斑块：露出红砖
      for (let i = 0; i < 4; i++) {
        const x = Math.random() * w, y = h * 0.25 + Math.random() * h * 0.6, rw = 60 + Math.random() * 120, rh = 40 + Math.random() * 90;
        g.save(); g.beginPath();
        for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, rr = 0.7 + Math.random() * 0.45; g.lineTo(x + Math.cos(a) * rw / 2 * rr, y + Math.sin(a) * rh / 2 * rr); }
        g.closePath(); g.clip();
        g.fillStyle = '#5e3e2e'; g.fillRect(x - rw, y - rh, rw * 2, rh * 2);
        for (let by = y - rh; by < y + rh; by += 12) for (let bx = x - rw + ((by / 12) % 2) * 14; bx < x + rw; bx += 28) { g.strokeStyle = 'rgba(40,28,20,0.7)'; g.lineWidth = 2; g.strokeRect(bx, by, 28, 12); }
        g.restore();
        g.strokeStyle = 'rgba(30,26,20,0.5)'; g.lineWidth = 2; g.stroke();
      }
      // 自下而上的水渍
      const grd = g.createLinearGradient(0, h, 0, h * 0.45); grd.addColorStop(0, 'rgba(25,20,14,0.6)'); grd.addColorStop(1, 'rgba(25,20,14,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) { const x = Math.random() * w; g.fillStyle = 'rgba(30,24,16,0.25)'; g.fillRect(x, 0, 2 + Math.random() * 3, h * (0.3 + Math.random() * 0.5)); }
    }, [1, 1]),
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
    m.userData.opt = opt || {};
    m.userData.setText = (ls, o) => { m.userData.lines = ls; m.material.map.dispose(); m.material.map = textTexture(ls, Object.assign({}, m.userData.opt, o)); m.material.needsUpdate = true; };
    m.userData.lines = lines;
    return m;
  }

  // ---------- 灯光 ----------
  const hemi = new THREE.HemisphereLight(0x8a9aa8, 0x14110e, 0.22);
  scene.add(hemi);
  // 窗光：从玻璃幕墙外斜照进来，冷白偏青，低角度拉出长影子（参考图一左侧）
  const sun = new THREE.DirectionalLight(0xdfe8ee, 1.25);
  sun.position.set(10, 8, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 60 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 2.5;
  scene.add(sun);

  const root = new THREE.Group(); scene.add(root);

  // ---------- 布局：规格中的八个区域 ----------
  // 后排 z[-6,0]：卧室 x[-12,-6] | 客厅 x[-6,1] | 厨房 x[1,6] | 阳台 x[6,10]
  // 前排 z[0,6]：设备间 x[-12,-6]（下沉）| 储物间 x[-6,-2] | 玄关 x[-2,4] | 浴室 x[4,10]
  const ROOMS = {
    bedroom: { name: '卧室', x0: -12, x1: -6, z0: -6, z1: 0, y: 0, floor: 0x9a8670, tex: 'wood', wall: 'plaster' },
    living: { name: '客厅', x0: -6, x1: 1, z0: -6, z1: 0, y: 0, floor: 0xffffff, tex: 'mosaic', wall: 'hexpaper' },
    kitchen: { name: '厨房', x0: 1, x1: 6, z0: -6, z1: 0, y: 0, floor: 0xffffff, tex: 'checker', wall: 'plaster' },
    balcony: { name: '阳台', x0: 6, x1: 10, z0: -6, z1: 0, y: 0, floor: 0x9a9184, tex: 'concrete' },
    plant: { name: '楼下设备间', x0: -12, x1: -6, z0: 0, z1: 6, y: -1.4, floor: 0xffffff, tex: 'cellar' },
    storage: { name: '储物间', x0: -6, x1: -2, z0: 0, z1: 6, y: 0, floor: 0x7c6650, tex: 'wood', wall: 'plaster' },
    entry: { name: '玄关', x0: -2, x1: 4, z0: 0, z1: 6, y: 0, floor: 0x7c6650, tex: 'wood', wall: 'plaster' },
    bath: { name: '浴室', x0: 4, x1: 10, z0: 0, z1: 6, y: 0, floor: 0xffffff, tex: 'mosaic', wall: 'plaster' },
  };
  const floors = [];
  const WALL = 0xb8a68c, H = 3.2;
  const roomRoot = {};
  Object.keys(ROOMS).forEach(k => {
    const g = new THREE.Group(); g.name = 'room_' + k; root.add(g); roomRoot[k] = g;
  });
  Object.entries(ROOMS).forEach(([k, r]) => {
    const f = box(roomRoot[k], r.x1 - r.x0, 0.2, r.z1 - r.z0, r.floor, (r.x0 + r.x1) / 2, r.y - 0.2, (r.z0 + r.z1) / 2, { shadow: false, map: TEX[r.tex] });
    f.userData.floor = k; floors.push(f);
  });

  const DOOR_WOOD = 0x4a3020, DOOR_PANEL = 0x6b4a32;
  // 门铰链放哪一端：避开门旁靠墙的家具（门开到贴墙时会占住铰链那一侧 1.4m 的墙面）
  const HINGE_B = new Set(['-6,-2', '-6,3']);
  function doorHinge(horiz, x0, z0, a, b) {
    const m = (a + b) / 2, cx = horiz ? x0 + m : x0, cz = horiz ? z0 : z0 + m;
    return HINGE_B.has(Math.round(cx) + ',' + Math.round(cz));
  }
  const doorLeaves = [];
  const wallLines = [];
  // 只建背墙（-Z）与左墙（-X），朝相机的两面切开
  function wall(parent, x0, z0, x1, z1, h, y, gaps, style) {
    y = y || 0; gaps = gaps || [];
    const cellar = style === 'cellar';
    const rk = Object.keys(roomRoot).find(k => roomRoot[k] === parent);
    const roomWall = rk && ROOMS[rk].wall;
    const wallMap = cellar ? TEX.peel : (roomWall ? TEX[roomWall] : TEX.wallpaper);
    const wallCol = cellar || roomWall ? 0xffffff : WALL;
    const ownMap = cellar || !!roomWall;   // 大图贴图按墙长平铺，不拉伸
    const horiz = z0 === z1;
    const len = horiz ? x1 - x0 : z1 - z0;
    let segs = [[0, len]];
    gaps.forEach(([a, b]) => {
      segs = segs.flatMap(([s, e]) => (b <= s || a >= e) ? [[s, e]] : [[s, a], [b, e]].filter(([p, q]) => q - p > 0.05));
    });
    let wg0 = parent.children.find(c => c.name === 'walls');
    if (!wg0) { wg0 = new THREE.Group(); wg0.name = 'walls'; parent.add(wg0); }
    // 每次调用 = 一条墙线；挡在当前房间前面时整条降成矮墙（实心，不透明）
    const wg = new THREE.Group(); wg0.add(wg);
    wallLines.push({ g: wg, horiz, c: horiz ? z0 : x0, a: horiz ? x0 : z0, b: horiz ? x1 : z1, y, h, low: 0 });
    segs.forEach(([s, e]) => {
      const mid = (s + e) / 2, l = e - s;
      const px = horiz ? x0 + mid : x0, pz = horiz ? z0 : z0 + mid;
      const wm = box(wg, horiz ? l : 0.14, h, horiz ? 0.14 : l, wallCol, px, y, pz, { map: wallMap });
      if (ownMap) { wm.material = wm.material.clone(); wm.material.map = wallMap.clone(); wm.material.map.needsUpdate = true; wm.material.map.repeat.set(l / 3, h / 3); }
      const ix = horiz ? px : px + 0.09, iz = horiz ? pz + 0.09 : pz;
      if (!cellar && !roomWall) {
        box(wg, horiz ? l : 0.04, 0.95, horiz ? 0.04 : l, WAINSCOT, ix, y, iz, { map: TEX.wood, edges: false });
        box(wg, horiz ? l : 0.08, 0.05, horiz ? 0.08 : l, 0x2a1d14, ix, y + 0.95, iz, { edges: false });
      }
      box(wg, horiz ? l : 0.06, 0.12, horiz ? 0.06 : l, 0x1e150f, ix, y, iz, { edges: false });
      // 墙顶切面：深色厚盖板，比墙略宽，表现墙的厚度
      box(wg, horiz ? l + 0.04 : 0.24, 0.06, horiz ? 0.24 : l + 0.04, 0x2a211b, px, y + h, pz, { edges: false });
    });
    gaps.forEach(([a, b]) => {
      const mid = (a + b) / 2, l = b - a;
      const px = horiz ? x0 + mid : x0, pz = horiz ? z0 : z0 + mid;
      const DH = 2.25;                       // 门洞高度
      box(wg, horiz ? l : 0.14, h - DH, horiz ? 0.14 : l, wallCol, px, y + DH, pz, { map: wallMap });
      box(wg, horiz ? l : 0.24, 0.06, horiz ? 0.24 : l, 0x2a211b, px, y + h, pz, { edges: false });
      if (h < 2.4) return;                   // 矮栏杆的缺口不装门
      makeDoor(wg, horiz, x0, z0, a, b, y, DH, doorHinge(horiz, x0, z0, a, b));
    });
  }
  // 门框（深色木门套 + 门槛）+ 一扇绕铰链转的门。门开合在 loop 里按人物距离驱动
  function makeDoor(parent, horiz, x0, z0, a, b, y, DH, hingeB) {
    const g = new THREE.Group(); g.name = 'door'; parent.add(g);
    const T = 0.2, F = 0.09;               // 门套厚度、宽度
    const at = t => horiz ? [x0 + t, z0] : [x0, z0 + t];
    // 两侧门套 + 顶部门楣
    [a, b].forEach(t => { const [x, z] = at(t + (t === a ? F / 2 : -F / 2)); box(g, horiz ? F : T, DH + 0.06, horiz ? T : F, DOOR_WOOD, x, y, z, { edges: false }); });
    const [mx, mz] = at((a + b) / 2);
    box(g, horiz ? b - a : T, 0.12, horiz ? T : b - a, DOOR_WOOD, mx, y + DH - 0.06, mz, { edges: false });
    box(g, horiz ? b - a - 2 * F : T + 0.04, 0.03, horiz ? T + 0.04 : b - a - 2 * F, 0x2a1d14, mx, y, mz, { edges: false });
    // 门扇：铰链在 a 端，宽度 = 门洞净宽
    const W = b - a - 2 * F - 0.02;
    const hinge = new THREE.Group();
    const [hx, hz] = at(hingeB ? b - F - 0.01 : a + F + 0.01);
    hinge.position.set(hx, y, hz);
    g.add(hinge);
    const leaf = new THREE.Group(); hinge.add(leaf);
    // 门板沿局部 +X 展开；竖墙时整体转 90°
    if (!horiz) hinge.rotation.y = -Math.PI / 2;
    const base = hinge.rotation.y;
    if (hingeB) leaf.scale.x = -1;     // 铰链在另一端：门板沿 -X 展开
    box(leaf, W, DH - 0.04, 0.05, DOOR_PANEL, W / 2, 0.01, 0, { map: TEX.wood });
    // 门板的两块凹面板 + 黄铜把手
    box(leaf, W - 0.24, 0.7, 0.012, 0x553826, W / 2, 1.25, 0.03, { edges: false });
    box(leaf, W - 0.24, 0.7, 0.012, 0x553826, W / 2, 0.3, 0.03, { edges: false });
    box(leaf, W - 0.24, 0.7, 0.012, 0x553826, W / 2, 1.25, -0.03, { edges: false });
    box(leaf, W - 0.24, 0.7, 0.012, 0x553826, W / 2, 0.3, -0.03, { edges: false });
    sphere(leaf, 0.045, 0xc9a24a, W - 0.1, 1.0, 0.06);
    sphere(leaf, 0.045, 0xc9a24a, W - 0.1, 1.0, -0.06);
    leaf.traverse(o => { if (o.isMesh) o.userData.door = true; });
    doorLeaves.push({ hinge, leaf, base, open: 0, cx: mx, cz: mz, y, horiz, hx, hz, W, hb: hingeB });
  }
  const WAINSCOT = 0x4a3a2c;
  // 房间连通图：门洞路点（穿过门洞的那条线段）
  const DOORS = [
    ['living', 'bedroom', [[-5.5, -2.0], [-6.5, -2.0]]],
    ['living', 'kitchen', [[0.5, -2.0], [1.5, -2.0]]],
    ['kitchen', 'balcony', [[5.5, -2.0], [6.5, -2.0]]],
    ['living', 'storage', [[-4.0, -0.5], [-4.0, 0.5]]],
    ['living', 'entry', [[-0.9, -0.5], [-0.9, 0.5]]],
    ['entry', 'storage', [[-1.5, 3.0], [-2.5, 3.0]]],
    ['entry', 'bath', [[3.5, 3.0], [4.5, 3.0]]],
    ['storage', 'plant', [[-5.5, 2.8], [-8.6, 2.8]]],
  ];
  // 某条房间边上的门洞位置：axis 'z' 表示边 z = v（沿 x 开口），'x' 表示边 x = v
  function edgeGaps(axis, v) {
    const out = [];
    DOORS.forEach(([, , pts]) => {
      const p = pts[0], q = pts[pts.length - 1];
      const i = axis === 'z' ? 1 : 0, j = 1 - i;
      if (Math.min(p[i], q[i]) < v && Math.max(p[i], q[i]) > v) out.push(p[j]);
    });
    return out;
  }
  // 切开一侧的矮护墙：在门洞处断开，否则人物会从护墙里穿过去
  function curb(parent, r, onlyFront) {
    const g = new THREE.Group(); g.name = 'cutaway'; parent.add(g);
    const GAP = 0.8;
    const split = (a, b, gaps) => {
      let segs = [[a, b]];
      gaps.forEach(c => { segs = segs.flatMap(([s, e]) => (c + GAP <= s || c - GAP >= e) ? [[s, e]] : [[s, c - GAP], [c + GAP, e]].filter(([u, w]) => w - u > 0.05)); });
      return segs;
    };
    split(r.x0, r.x1, edgeGaps('z', r.z1)).forEach(([s, e]) => {
      box(g, e - s, 0.55, 0.14, WAINSCOT, (s + e) / 2, r.y, r.z1, { map: TEX.wood });
      box(g, e - s + (e === r.x1 ? 0.14 : 0), 0.04, 0.2, 0x2a1d14, (s + e) / 2 + (e === r.x1 ? 0.07 : 0), r.y + 0.55, r.z1, { edges: false });
    });
    if (!onlyFront) split(r.z0, r.z1, edgeGaps('x', r.x1)).forEach(([s, e]) => {
      box(g, 0.14, 0.55, e - s, WAINSCOT, r.x1, r.y, (s + e) / 2, { map: TEX.wood });
      box(g, 0.2, 0.04, e - s, 0x2a1d14, r.x1, r.y + 0.55, (s + e) / 2, { edges: false });
    });
    return g;
  }
  const veilMat = new THREE.MeshBasicMaterial({ color: 0x0b0704, transparent: true, opacity: 0.36, depthWrite: false });
  Object.entries(ROOMS).forEach(([k, r]) => {
    const v = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0 + 0.02, 3.4, r.z1 - r.z0 + 0.02), veilMat);
    v.position.set((r.x0 + r.x1) / 2, r.y + 1.5, (r.z0 + r.z1) / 2);
    v.renderOrder = 10; v.name = 'veil'; v.visible = false;
    // 整层同时显示后不再需要黑罩：保留对象（其它代码按名字找），但永远不显示
  });
  const winGlassMat = new THREE.MeshBasicMaterial({ color: 0x1e3446 });
  function windowOn(parent, horiz, x, z, w, hgt, sill, y) {
    y = y || 0;
    const g = new THREE.Group(); g.name = 'walls'; parent.add(g);
    const off = 0.09;     // 贴在墙内侧
    const px = horiz ? x : x + off, pz = horiz ? z + off : z;
    const W = horiz ? w : 0.06, D = horiz ? 0.06 : w;
    // 玻璃（暗蓝夜色）+ 远处几点暖色窗光
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.12, hgt - 0.12), winGlassMat);
    glass.position.set(px + (horiz ? 0 : 0.035), y + sill + hgt / 2, pz + (horiz ? 0.035 : 0));
    if (!horiz) glass.rotation.y = Math.PI / 2;
    g.add(glass);
    for (let i = 0; i < 5; i++) {
      const dot = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.09), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xf2c27a : 0xe8a85a }));
      const u = (Math.random() - 0.5) * (w - 0.4), v = Math.random() * (hgt - 0.5) + 0.2;
      dot.position.set(px + (horiz ? u : 0.04), y + sill + v, pz + (horiz ? 0.04 : u));
      if (!horiz) dot.rotation.y = Math.PI / 2;
      g.add(dot);
    }
    // 窗框、中梃、窗台
    const FR = 0x3a2a1e;
    box(g, W, 0.07, D, FR, px, y + sill + hgt - 0.07, pz, { edges: false });
    box(g, W, 0.07, D, FR, px, y + sill, pz, { edges: false });
    box(g, horiz ? 0.07 : 0.06, hgt, horiz ? 0.06 : 0.07, FR, px + (horiz ? -w / 2 + 0.035 : 0), y + sill, pz + (horiz ? 0 : -w / 2 + 0.035), { edges: false });
    box(g, horiz ? 0.07 : 0.06, hgt, horiz ? 0.06 : 0.07, FR, px + (horiz ? w / 2 - 0.035 : 0), y + sill, pz + (horiz ? 0 : w / 2 - 0.035), { edges: false });
    box(g, horiz ? 0.05 : 0.06, hgt, horiz ? 0.06 : 0.05, FR, px, y + sill, pz, { edges: false });
    box(g, W, 0.04, D, FR, px, y + sill + hgt * 0.55, pz, { edges: false });
    box(g, horiz ? w + 0.12 : 0.2, 0.05, horiz ? 0.2 : w + 0.12, 0x5a4232, px + (horiz ? 0 : 0.06), y + sill - 0.05, pz + (horiz ? 0.06 : 0), { edges: false });
    return g;
  }
  // ---------- 外立面：落地玻璃幕墙（参考图：细黑框 + 大块玻璃，能看见屋里）----------
  // 只用在公寓外缘、朝镜头的两边（前 z=6、右 x=10），玻璃半透明偏冷，竖梃不挡视线
  const curtainGlass = new THREE.MeshPhysicalMaterial({
    color: 0x7fa39a, transparent: true, opacity: 0.26, roughness: 0.08, metalness: 0.0,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const curtainSheen = new THREE.MeshBasicMaterial({ color: 0xe8f2ec, transparent: true, opacity: 0.11, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const MULLION = 0x14181a;
  function glassWall(parent, horiz, c, a, b, y, h) {
    const g = new THREE.Group(); g.name = 'glass'; parent.add(g);
    const len = b - a, mid = (a + b) / 2;
    const at = (t, yy) => horiz ? [t, yy, c] : [c, yy, t];
    // 玻璃
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, h - 0.55), curtainGlass);
    const [px, py, pz] = at(mid, y + 0.55 + (h - 0.55) / 2); pane.position.set(px, py, pz);
    if (!horiz) pane.rotation.y = Math.PI / 2;
    pane.renderOrder = 5; g.add(pane);
    // 斜向反光条
    for (let i = 0; i < Math.floor(len / 1.6); i++) {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.35, h * 0.9), curtainSheen);
      const t = a + 0.5 + i * 1.6 + Math.random() * 0.4;
      const [sx, sy, sz] = at(t, y + 0.55 + (h - 0.55) / 2); sh.position.set(sx + (horiz ? 0 : 0.01), sy, sz + (horiz ? 0.01 : 0));
      if (!horiz) sh.rotation.y = Math.PI / 2;
      sh.rotation.z = horiz ? -0.35 : 0.35; sh.renderOrder = 6; g.add(sh);
    }
    // 竖梃：每 1.2m 一根；顶部横梁、腰部横档
    const n = Math.max(2, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) {
      const t = a + len * i / n;
      const [mx, , mz] = at(t, 0);
      box(g, horiz ? 0.06 : 0.08, h - 0.55, horiz ? 0.08 : 0.06, MULLION, mx, y + 0.55, mz, { edges: false });
    }
    const [tx, , tz] = at(mid, 0);
    box(g, horiz ? len : 0.1, 0.08, horiz ? 0.1 : len, MULLION, tx, y + h - 0.08, tz, { edges: false });
    box(g, horiz ? len : 0.07, 0.05, horiz ? 0.07 : len, MULLION, tx, y + 1.25, tz, { edges: false });
    box(g, horiz ? len : 0.12, 0.05, horiz ? 0.12 : len, MULLION, tx, y + 0.55, tz, { edges: false });
    return g;
  }
  // 背墙 / 左墙，门洞与 DOORS 对应
  wall(roomRoot.bedroom, -12, -6, -6, -6, H, 0);
  wall(roomRoot.bedroom, -12, -6, -12, 0, H, 0);
  wall(roomRoot.living, -6, -6, 1, -6, H, 0);
  wall(roomRoot.living, -6, -6, -6, 0, H, 0, [[3.2, 4.8]]);           // ← 卧室
  wall(roomRoot.kitchen, 1, -6, 6, -6, H, 0);
  wall(roomRoot.kitchen, 1, -6, 1, 0, H, 0, [[3.2, 4.8]]);            // ← 客厅
  wall(roomRoot.balcony, 6, -6, 10, -6, 1.1, 0);                      // 阳台外侧是矮栏杆
  wall(roomRoot.balcony, 6, -6, 6, 0, H, 0, [[3.2, 4.8]]);            // ← 厨房
  wall(roomRoot.plant, -12, 0, -6, 0, H, -1.4, null, 'cellar');
  wall(roomRoot.plant, -12, 0, -12, 6, H, -1.4, null, 'cellar');
  wall(roomRoot.storage, -6, 0, -2, 0, H, 0, [[1.2, 2.8]]);           // ↑ 客厅
  wall(roomRoot.storage, -6, 0, -6, 6, H, 0, [[2.0, 3.6]]);           // ← 设备间（台阶）
  wall(roomRoot.entry, -2, 0, 4, 0, H, 0, [[0.3, 1.9]]);               // ↑ 客厅（x -1.7..-0.1，让开入户门；缺口坐标相对墙起点）
  wall(roomRoot.entry, -2, 0, -2, 6, H, 0, [[2.2, 3.8]]);             // ← 储物间
  wall(roomRoot.bath, 4, 0, 10, 0, H, 0);
  // 窗：卧室左墙、客厅后墙（电视右边）、厨房后墙（冰箱和吧台之间）
  windowOn(roomRoot.bedroom, false, -12, -2.6, 1.6, 1.3, 1.0);
  windowOn(roomRoot.living, true, -4.4, -6, 1.3, 1.2, 1.1);
  windowOn(roomRoot.kitchen, true, 3.25, -6, 0.9, 1.0, 1.3);
  wall(roomRoot.bath, 4, 0, 4, 6, H, 0, [[2.2, 3.8]]);                // ← 玄关
  // 只有地下室的前沿（z=6）和东侧台阶口没有别的墙，需要护墙；其它边都有隔壁的实墙或玻璃
  curb(roomRoot.plant, ROOMS.plant, true);   // 东侧 x=-6 是储物间的实墙，不再叠护墙
  // 前立面（z=6）和右立面（x=10）：落地玻璃。设备间是地下室，不装玻璃
  [['storage', -6, -2], ['entry', -2, 4], ['bath', 4, 10]].forEach(([k, a, b]) => glassWall(roomRoot[k], true, ROOMS[k].z1, a, b, ROOMS[k].y, H));
  [['balcony', -6, 0], ['bath', 0, 6]].forEach(([k, a, b]) => glassWall(roomRoot[k], false, ROOMS[k].x1, a, b, ROOMS[k].y, k === 'balcony' ? 1.6 : H));

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
  reg('lamp', lampG, '小灯', [-4.95, -3.6]);

  const tv = group(-1.6, 0, -5.6);
  box(tv, 2.4, 0.5, 0.5, 0x3e342b, 0, 0, 0);
  box(tv, 2.2, 1.2, 0.08, 0x111111, 0, 0.9, 0.1);
  const tvScreen = screen(tv, 2.05, 1.05, ['今天，没有居民', '错过适合自己的安排'], 0, 1.5, 0.15, 0, { bg: '#1d3a3a', size: 34 });
  led('tv', tv, 2.3);
  reg('tv', tv, '电视', [-1.6, -4.0]);

  const sofa = group(-2.2, 0, -2.4);
  box(sofa, 3.0, 0.5, 1.1, 0x6a7f73, 0, 0, 0); box(sofa, 3.0, 0.7, 0.3, 0x5b6e63, 0, 0.5, 0.45);
  reg('sofa', sofa, '沙发', [-2.2, -1.2]);

  // 须知桌：放在客厅西北、书架和废纸篓旁边，让开卧室门（x=-6, z[-2.8,-1.2]）和储物间门（z=0, x[-4.8,-3.2]）的通道
  const table = group(-4.45, 0, -4.55);   // 贴后墙：和沙发之间留一条东西向过道（z≈-3.8..-3.2）
  box(table, 1.0, 0.72, 0.9, 0x8c6b4a, 0, 0, 0);
  box(table, 0.42, 0.04, 0.3, 0xefe6d4, 0, 0.72, 0).userData.keep = true;   // 须知纸：模型替换后保留
  reg('notice', table, '《住户须知》', [-4.45, -3.5]);

  // 扫地机：会真实移动的设备
  const robot = group(0.5, 0, -0.9);
  cyl(robot, 0.32, 0.12, 0x2b3236, 0, 0, 0, 20);
  cyl(robot, 0.1, 0.03, 0x5ad1b8, 0, 0.12, 0, 12, { emissive: 0x1a6a5a });
  led('robot', robot, 0.32);
  reg('robot', robot, '扫地机', [-0.2, -1.4]);

  const blood = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.22), new THREE.MeshBasicMaterial({ color: 0x5a1410, transparent: true, opacity: 0.0, depthWrite: false }));
  blood.rotation.x = -Math.PI / 2; blood.position.set(1.0, 0.012, 1.2); blood.userData.keep = true;
  roomRoot.entry.add(blood);

  // 厨房：冰箱（订单屏）、废物盒
  const fridge = group(2.0, 0, -5.4);
  box(fridge, 1.0, 2.1, 0.9, 0xdedad0, 0, 0, 0);
  const planScreen = screen(fridge, 0.7, 0.5, ['订单', '照常补货'], 0, 1.4, 0.46, 0, { size: 44 });
  led('fridge', fridge, 2.3);
  reg('fridge', fridge, '冰箱', [2.0, -4.0]);
  const counter = group(4.4, 0, -5.4); counter.userData.deco = true;
  box(counter, 2.6, 0.95, 0.9, 0xd8cdb8, 0, 0, 0);
  reg('counter', counter, '料理台', [4.4, -4.4]);
  const binG = group(5.3, 0, -0.65);
  box(binG, 0.5, 0.6, 0.5, 0x6a6a64, 0, 0, 0);
  reg('waste', binG, '厨余废物盒', [4.5, -0.8]);
  const acG = group(3.4, 2.6, -5.78);
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
  const bed = group(-10.4, 0, -3.85);
  box(bed, 2.2, 0.45, 1.6, 0x7b5a3e, 0, 0, 0); box(bed, 2.1, 0.2, 1.5, 0xefe6d4, 0, 0.45, 0);
  reg('bed', bed, '床 · 休息', [-9.0, -2.6]);
  const speaker = group(-6.6, 0, -5.55);
  box(speaker, 0.4, 0.55, 0.4, 0x2a2f36, 0, 0.5, 0);
  box(speaker, 0.6, 0.5, 0.5, 0x6b4a22, 0, 0, 0);
  led('speaker', speaker, 1.2);
  reg('speaker', speaker, '音箱', [-6.6, -4.5]);
  // 窗帘收在窗户南侧，离开墙面和窗框 6cm（窗框 x 到 -11.75），不挡储物柜
  const curtain = group(-11.66, 0, -1.52);
  box(curtain, 0.12, 2.6, 0.7, 0x445a52, 0, 0, 0);
  reg('curtain', curtain, '窗帘', [-11.0, -1.9]);
  const locker = group(-11.6, 0, -0.8);
  box(locker, 0.6, 1.1, 0.7, 0x5e4430, 0, 0, 0);
  reg('locker', locker, '私人储物柜', [-10.8, -0.8]);

  // 储物间：扫地机充电座、旧工具柜、撬门碎片
  // 门口净空：北门 x[-4.8,-3.2]、西门（下楼）z[2.0,3.6]、东门（玄关）z[2.2,3.8]，
  // 外加门板贴墙的位置：北墙 x[-3.2,-1.8]、西墙 z[3.6,5.0]、东墙 z[0.8,2.2]。杂物只堆在四个角落和南侧
  const dock = group(-5.55, 0, 5.6);
  box(dock, 0.6, 0.2, 0.3, 0x2b3236, 0, 0, 0);
  reg('dock', dock, '扫地机充电座', [-5.0, 5.0]);
  // 工具柜靠东墙，柜门朝西（Tripo 模型 st_tools 套在这个方块组上）
  const tools = group(-2.45, 0, 0.85); tools.rotation.y = -Math.PI / 2;
  box(tools, 0.9, 1.5, 0.6, 0x6b5a48, 0, 0, 0);
  reg('tools', tools, '旧工具柜', [-3.3, 0.85]);
  const shard = group(-3.0, 0, 4.6);
  box(shard, 0.22, 0.04, 0.12, 0xb0b4b8, 0, 0, 0, { emissive: 0x3a3a3a });
  reg('shard', shard, '金属碎片', [-3.0, 3.8]);

  // 储物间地面的杂物：散落的纸、倒下的木板、枕头、空瓶（纯装饰，不挡路）
  (() => {
    const S = roomRoot.storage;
    const paper = new THREE.MeshLambertMaterial({ color: 0x9c968a, side: THREE.DoubleSide });
    [[-3.9, 1.9, 0.3], [-3.3, 2.6, 1.2], [-4.4, 3.1, 2.1], [-3.6, 3.6, 0.7], [-2.9, 1.4, 2.6], [-4.1, 4.2, 1.7],
     [-5.0, 2.3, 0.4], [-3.0, 3.1, 2.0], [-4.7, 3.8, 1.1], [-3.8, 4.9, 2.9], [-2.7, 2.8, 0.2]].forEach(([x, z, r], i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), paper);
      m.rotation.set(-Math.PI / 2 + (i % 3 - 1) * 0.06, 0, r); m.position.set(x, 0.012 + i * 0.0006, z); m.receiveShadow = true;
      S.add(m);
    });
    // 散落的木条（门板换成 Tripo 模型 st_door）
    const plank = box(S, 1.1, 0.03, 0.14, 0x6b4a32, 0, 0, 0, { map: TEX.wood });
    plank.position.set(-4.3, 0.03, 3.5); plank.rotation.y = -0.7;
    // 枕头：压扁的白色软包
    [[-3.1, 4.3, 0.9]].forEach(([x, z, r]) => {
      const p = sphere(S, 0.22, 0xa8a49a, x, 0.1, z); p.scale.set(1.25, 0.42, 0.85); p.rotation.y = r;
    });
    // 倒在地上的空瓶
    [[-3.25, 2.05, 1.1], [-4.25, 4.35, -0.4]].forEach(([x, z, r]) => {
      const b = cyl(S, 0.045, 0.3, 0x5a6a3a, 0, 0, 0, 8); b.position.set(x, 0.05, z); b.rotation.set(Math.PI / 2, 0, r);
    });
    // 墙上歪挂的一幅旧画（北墙东段，门板开到那里时会被盖住，所以挂在西段上方）
    const frame = box(S, 0.62, 0.78, 0.04, 0x3a2a1e, -5.35, 1.75, 0.1, { edges: false });
    frame.rotation.z = 0.05;
    const canvas2 = box(S, 0.52, 0.66, 0.02, 0x9a9070, -5.35, 1.81, 0.13, { edges: false, map: TEX.plaster });
    canvas2.rotation.z = 0.05;
  })();

  // 玄关：门锁、鞋柜、状态屏、门框撬痕
  const door = group(1.0, 0, 0.16);
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
  const shoes = group(-1.45, 0, 4.8);
  box(shoes, 0.6, 0.9, 1.8, 0x9a7b58, 0, 0, 0);
  reg('shoes', shoes, '鞋柜', [-0.8, 4.8]);
  // 玄关：周岚自己装的离线旧电脑（米色卧式主机 + CRT 显示器 + 键盘 + 鼠标），屏幕朝房间，点开进入电脑页面
  const pcG = group(2.0, 0, 4.75);
  const PC_BEIGE = 0xd6cfbb, PC_BEIGE2 = 0xbfb7a1;
  box(pcG, 1.3, 0.05, 0.66, 0x4a3426, 0, 0.70, 0, { map: TEX.wood });                    // 桌面
  [[-0.6, -0.28], [0.6, -0.28], [-0.6, 0.28], [0.6, 0.28]].forEach(([x, z]) => box(pcG, 0.05, 0.70, 0.05, 0x2e2118, x, 0, z, { edges: false }));
  box(pcG, 0.66, 0.17, 0.46, PC_BEIGE, -0.05, 0.75, -0.09);                               // 主机
  box(pcG, 0.2, 0.022, 0.01, 0x2a2620, 0.12, 0.86, 0.145, { edges: false });              // 软驱口
  box(pcG, 0.2, 0.03, 0.01, PC_BEIGE2, 0.12, 0.80, 0.145, { edges: false });               // 光驱
  const pcLed = sphere(pcG, 0.012, 0x5ad1b8, 0.25, 0.84, 0.15, 0x5ad1b8); pcLed.userData.keep = true;
  box(pcG, 0.24, 0.03, 0.2, PC_BEIGE2, -0.05, 0.92, -0.1);                                // 显示器底座
  box(pcG, 0.52, 0.43, 0.40, PC_BEIGE, -0.05, 0.95, -0.12);                               // 显示器
  box(pcG, 0.44, 0.34, 0.01, 0x2a2a24, -0.05, 1.01, 0.085, { edges: false });              // 屏幕外框
  const pcScreen = screen(pcG, 0.40, 0.30, ['ZL-0217', 'C:\\> _'], -0.05, 1.18, 0.092, 0, { bg: '#08201a', fg: '#8ff5d2', size: 44 });
  box(pcG, 0.58, 0.028, 0.18, PC_BEIGE, -0.02, 0.75, 0.22);                                // 键盘
  const pcKeys = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 14; c++) {
    const k = box(pcG, 0.03, 0.012, 0.024, r === 4 && c > 3 && c < 10 ? 0xcfc7b0 : 0xe6dfcc, -0.27 + c * 0.039, 0.778, 0.155 + r * 0.032, { edges: false });
    pcKeys.push(k);
  }
  box(pcG, 0.055, 0.025, 0.085, PC_BEIGE, 0.38, 0.75, 0.24);                                // 鼠标
  reg('pc', pcG, '旧电脑', [2.0, 5.55]);

  // 浴室：镜面、本地人数传感器
  const tub = group(7.8, 0, 1.2);
  box(tub, 2.4, 0.75, 1.1, 0xf4f1ea, 0, 0, 0);
  box(tub, 2.1, 0.05, 0.85, 0x8fc3c8, 0, 0.62, 0, { edges: false });
  reg('tub', tub, '浴缸', [7.8, 2.4]);
  const mirror = group(5.4, 0, 0.36);
  box(mirror, 1.0, 1.4, 0.08, 0x8c6b4a, 0, 1.0, 0);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.2), new THREE.MeshToonMaterial({ color: 0x9fd6d0, emissive: new THREE.Color(0x2a6b66), emissiveIntensity: 0.6, gradientMap: gradTex }));
  glass.position.set(0, 1.7, 0.05); glass.userData.keep = true; mirror.add(glass);
  box(mirror, 0.9, 0.85, 0.5, 0xf4f1ea, 0, 0, 0.25);
  led('mirror', mirror, 2.6);
  reg('mirror', mirror, '浴室镜面', [5.4, 1.4]);

  // 楼下设备间：备用电力、楼内旧广播
  const power = group(-10.3, -1.4, 1.2);
  box(power, 1.2, 1.6, 0.7, 0x3a4a3e, 0, 0, 0);
  for (let i = 0; i < 4; i++) box(power, 0.18, 0.18, 0.04, 0xc9842a, -0.4 + i * 0.27, 1.0, 0.36, { edges: false, emissive: 0x3a2808 });
  reg('power', power, '备用电力', [-10.0, 2.2]);
  const radio = group(-6.9, -1.4, 4.9);
  box(radio, 1.2, 0.8, 0.6, 0x6b4a22, 0, 0, 0);
  cyl(radio, 0.04, 0.9, 0x2a2118, 0.4, 0.8, 0, 6);
  reg('radio', radio, '楼内旧广播', [-6.9, 4.0]);
  const echo = group(-10.8, -1.4, 4.6);
  box(echo, 0.9, 1.4, 0.7, 0x4a3d33, 0, 0, 0);
  const echoEye = sphere(echo, 0.09, 0x401a17, 0.3, 1.1, 0.36, 0x200808);
  const echoLight = new THREE.PointLight(0xc45c4a, 0.0, 6); echoLight.position.set(0, 1.2, 0.7); echo.add(echoLight);
  reg('reject_log', echo, '求助驳回记录机', [-9.8, 4.6]);
  // 储物间 → 设备间的台阶（在储物间西侧门洞外）：磨损的水泥台阶 + 铁扶手
  for (let i = 0; i < 5; i++) {
    box(roomRoot.plant, 0.42, 1.4 - 0.28 * i, 1.6, 0x5a4a3a, -6.2 - i * 0.42, -1.4, 2.8, { map: TEX.cellar });
    box(roomRoot.plant, 0.44, 0.03, 1.62, 0x3a2e24, -6.2 - i * 0.42, -1.4 + 1.4 - 0.28 * i, 2.8, { edges: false });
  }
  [1.98, 3.62].forEach(z => {
    for (let i = 0; i < 6; i++) cyl(roomRoot.plant, 0.03, 0.85, 0x2a2420, -6.1 - i * 0.42, -1.4 + 1.4 - 0.28 * Math.min(i, 4), z, 6);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.4, 8), toon(0x3a2a20));
    rail.position.set(-7.15, -1.4 + 1.85, z); rail.rotation.z = Math.atan2(1.12, 2.1) + Math.PI / 2; roomRoot.plant.add(rail);
  });

  // ---------- 设备间：极乐迪斯科式的地下室 ----------
  // 管道：沿两面墙走的锈蚀水管和蒸汽管，带法兰和阀门
  const CEL = roomRoot.plant, CY = -1.4;
  const CELW = new THREE.Group(); CELW.name = 'walls'; CEL.add(CELW);
  const rust = 0x6a4a32, pipeDark = 0x3a3028;
  function pipe(x0, y0, z0, x1, y1, z1, r, col) {
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), toon(col));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
    m.castShadow = true; CELW.add(m);
    return m;
  }
  pipe(-11.85, CY + 2.75, 0.2, -11.85, CY + 2.75, 5.9, 0.09, rust);
  pipe(-11.75, CY + 2.45, 0.2, -11.75, CY + 2.45, 5.9, 0.05, pipeDark);
  pipe(-11.9, CY + 2.75, 0.15, -6.2, CY + 2.75, 0.15, 0.09, rust);
  pipe(-9.2, CY + 2.75, 0.15, -9.2, CY + 0.2, 0.15, 0.07, rust);
  [1.2, 2.6, 4.0, 5.4].forEach(z => pipe(-11.85, CY + 2.75, z - 0.03, -11.85, CY + 2.75, z + 0.03, 0.13, pipeDark));   // 法兰
  // 阀门手轮
  const valve = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 16), toon(0x8a2a22)); valve.position.set(-9.2, CY + 1.2, 0.3); CELW.add(valve);
  // 积水：反光的暗色水洼（略高于地面）
  const puddleMat = new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.75 });
  const puddleHi = new THREE.MeshBasicMaterial({ color: 0xd9a060, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
  [[-8.6, 1.3, 0.9, 0.5], [-10.4, 3.4, 0.6, 0.35], [-7.2, 5.2, 0.7, 0.3]].forEach(([x, z, rx, rz]) => {
    const pu = new THREE.Mesh(new THREE.CircleGeometry(1, 20), puddleMat); pu.scale.set(rx, rz, 1); pu.rotation.x = -Math.PI / 2; pu.position.set(x, CY + 0.012, z); CEL.add(pu);
    const hi = new THREE.Mesh(new THREE.CircleGeometry(1, 20), puddleHi); hi.scale.set(rx * 0.55, rz * 0.4, 1); hi.rotation.x = -Math.PI / 2; hi.position.set(x + rx * 0.2, CY + 0.014, z - rz * 0.2); CEL.add(hi);
  });
  // 旧沙发：塌陷的芥末色布沙发，一块毯子搭在扶手上
  const sofaC = new THREE.Group(); sofaC.position.set(-8.4, CY, 5.35); CEL.add(sofaC); sofaC.userData.deco = true;
  box(sofaC, 1.7, 0.42, 0.8, 0x7a6436, 0, 0, 0, { edges: false });
  box(sofaC, 1.7, 0.5, 0.22, 0x6e5a30, 0, 0.42, 0.29, { edges: false });
  box(sofaC, 0.22, 0.3, 0.8, 0x6a552c, -0.74, 0.42, 0, { edges: false });
  box(sofaC, 0.22, 0.3, 0.8, 0x6a552c, 0.74, 0.42, 0, { edges: false });
  box(sofaC, 0.5, 0.06, 0.82, 0x6a3a2c, 0.6, 0.72, 0, { edges: false });
  reg('cel_sofa', sofaC, '旧沙发', [-8.4, 4.4]);
  // 纸箱、木箱、成捆旧报纸
  const junk = new THREE.Group(); junk.position.set(-6.9, CY, 0.7); CEL.add(junk); junk.userData.deco = true;
  box(junk, 0.7, 0.55, 0.6, 0x8a6a44, 0, 0, 0, { edges: false });
  box(junk, 0.55, 0.45, 0.5, 0x7a5c3a, 0.05, 0.55, 0.02, { edges: false });
  box(junk, 0.6, 0.18, 0.45, 0xb9ab8a, -0.6, 0, 0.1, { edges: false });
  box(junk, 0.6, 0.18, 0.45, 0xa89a78, -0.62, 0.18, 0.08, { edges: false });
  reg('cel_junk', junk, '受潮的纸箱和旧报纸', [-6.9, 1.6]);
  // 散落的纸
  const paperMat = new THREE.MeshLambertMaterial({ color: 0xcfc2a0 });
  for (let i = 0; i < 9; i++) {
    const pa = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), paperMat);
    pa.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI); pa.position.set(-11 + Math.random() * 4.4, CY + 0.016 + i * 0.001, 1.2 + Math.random() * 4); pa.receiveShadow = true; CEL.add(pa);
  }
  // 墙上的涂鸦：用画布写一行字，贴在西墙
  const graffiti = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
    g.font = 'bold 74px "Kaiti SC", "STKaiti", serif'; g.fillStyle = 'rgba(160,40,30,0.85)';
    g.translate(18, 112); g.rotate(-0.05); g.fillText('门外还有人', 0, 0);
    g.font = '28px monospace'; g.fillStyle = 'rgba(200,190,160,0.55)'; g.fillText('— 周', 300, 40);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  })();
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.6), new THREE.MeshLambertMaterial({ map: graffiti, transparent: true }));
  gr.position.set(-11.91, CY + 1.9, 2.9); gr.rotation.y = Math.PI / 2; CELW.add(gr);
  // 钠灯：笼罩着铁丝网的橙色壁灯，地下室的主光
  const sodium = new THREE.PointLight(0xff9a3c, 2.6, 11, 1.4); sodium.position.set(-11.6, CY + 2.2, 3.6); sodium.castShadow = false; CEL.add(sodium);
  sphere(CELW, 0.11, 0xffb060, -11.75, CY + 2.2, 3.6, 0xff8a2a);
  const stairGlow = new THREE.PointLight(0xffc27a, 1.2, 6, 1.6); stairGlow.position.set(-6.8, CY + 1.6, 2.8); CEL.add(stairGlow);
  cyl(CELW, 0.15, 0.25, 0x2a2420, -11.82, CY + 2.08, 3.6, 8);


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
    ['deco_chair', -3.55, 0, -4.55, '转椅', [-3.0, -3.6], [0, -Math.PI / 2, 0]],
    ['deco_phone', -4.2, 0.72, -4.75, '电话', [-4.2, -3.5]],
    ['deco_sidetable', -7.4, 0, -5.0, '床头柜', [-7.4, -4.0]],
    ['deco_typewriter', -4.7, 0.72, -4.4, '打字机', [-4.7, -3.5]],
    ['deco_bin', -5.5, 0, -3.6, '废纸篓', [-4.8, -3.6]],
    ['deco_clock', -3.0, 0, -5.92, '挂钟', [-3.0, -4.6]],
    ['deco_laundry', 9.2, 0, 4.8, '洗衣篮', [8.4, 4.8]],
    ['deco_stool', 6.4, 0, 2.6, '小凳', [6.4, 3.4]],
    ['deco_fan', 5.2, 0.95, -5.3, '风扇', [5.2, -4.2]],
    ['deco_coatrack', 3.4, 0, 4.8, '衣帽架', [2.6, 4.8]],
    ['deco_umbrella', 3.4, 0, 1.2, '伞架', [2.6, 1.2]],
    ['deco_cardboard', -11.2, -1.4, 3.0, '纸箱堆', [-10.2, 3.0]],
    ['deco_shelf', -8.8, -1.4, 0.4, '铁架', [-8.8, 1.4]],
    // ---- 极乐迪斯科式布景 ----
    // 卧室：暖气片、扶手椅、散落衣物、酒瓶、壁灯
    ['de_radiator', -8.4, 0, -5.82, '暖气片', [-8.4, -4.8]],
    ['de_armchair2', -11.1, 0, -5.0, '旧皮扶手椅', [-10.2, -4.9]],
    ['de_laundry', -8.9, 0, -1.2, '一堆衣服', [-8.9, -2.2]],
    ['de_bottles', -7.0, 0, -1.0, '空酒瓶', [-7.0, -1.9]],
    ['de_walllamp', -11.77, 0, -3.6, '壁灯', [-11.0, -3.6]],
    // 客厅：地毯、芥末色扶手椅、落地灯、吊扇、磁带机、书架
    ['de_rug', -2.4, 0, -2.7, '旧地毯', [-2.4, -1.4]],
    // 扶手椅原来离厨房门不到 1m，挪到电视右侧的墙角，斜对电视
    ['de_armchair', -0.5, 0, -4.85, '芥末色扶手椅', [-0.5, -3.7], [0, -0.6, 0]],
    ['de_floorlamp', 0.5, 0, -4.4, '落地灯', [0.0, -3.7]],
    ['de_ceilfan', -2.6, 0, -3.0, '吊扇', [-2.6, -1.6]],
    ['de_reeltape', -4.3, 0, -5.6, '磁带机', [-4.3, -4.6]],
    ['de_bookshelf', -5.72, 0, -4.5, '书架', [-5.2, -3.5], [0, Math.PI / 2, 0]],
    // 吊灯（Tripo 模型，挂在 LAMP_POS 的位置，与 PENDANT_ROOMS 对应）
    ['lamp_pendant', 3.6, 0, -3.2, '吊灯', [3.6, -2.4]],
    ['lamp_pendant2', 1.0, 0, 3.0, '吊灯', [1.0, 2.2]],
    ['lamp_bulb', -4.0, 0, 3.0, '裸灯泡', [-3.6, 2.4]],
    ['lamp_bulb2', -8.6, -1.4, 2.6, '裸灯泡', [-9.2, 2.6]],
    // 储物间（参考极乐迪斯科：堆起来的扶手椅、床单枕头、掉下来的吊扇、满地杂物）
    // 第 7 项可选：[rx, ry, rz] 整组旋转
    ['st_armpile', -5.4, 0, 0.72, '叠在一起的旧皮扶手椅', [-4.5, 1.0], [0, 0.12, 0]],
    ['st_radiator', -2.8, 0, 0.21, '暖气片', [-3.0, 1.3]],
    ['st_linen', -5.45, 0, 1.6, '一堆床单和枕头', [-4.5, 1.6]],
    ['deco_filing', -2.55, 0, 1.75, '文件柜', [-3.3, 1.75]],
    ['st_door', -3.75, 0, 2.75, '卸下来的旧门板', [-3.75, 1.7], [0, 1.15, 0]],
    ['st_mannequin', -3.32, 0, 4.42, '人体模型的腿', [-3.3, 3.6], [0, Math.PI / 2 - 0.2, 0]],
    ['st_bottles', -5.4, 0, 5.1, '空酒瓶', [-4.9, 4.7]],
    ['st_fan', -4.3, 0, 4.3, '掉下来的吊扇', [-3.7, 3.7], [0, 0.6, 0]],
    ['de_desk', -4.45, 0, 5.55, '旧书桌', [-4.4, 4.9]],
    ['deco_boxes', -3.35, 0, 5.55, '档案箱', [-3.45, 4.8]],
    ['st_sheets2', -2.55, 0, 4.45, '团成一团的旧窗帘', [-3.1, 3.9]],
    ['de_chairs', -2.45, 0, 5.35, '叠起来的折叠椅', [-3.0, 5.0]],
    ['st_lamp', -2.2, 0, 4.7, '壁灯', [-2.8, 4.6], [0, -Math.PI / 2, 0]],
    // 玄关：挂衣架
    ['de_coatrack', 3.3, 0, 0.18, '挂衣钩', [3.3, 1.1]],
    // 地下室：锅炉、碎砖堆
    ['de_boiler', -11.3, -1.4, 0.75, '锅炉', [-11.2, 1.8]],
    ['de_debris', -10.0, -1.4, 3.7, '碎砖', [-9.6, 3.0]],
  ];
  DECOS.forEach(([id, x, y, z, label, stand, rot]) => {
    const g = group(x, y, z);
    if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
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
  const cam3 = { yaw: 0.66, pitch: 0.78, dist: 16, target: new THREE.Vector3(0, 0, 0), focus: new THREE.Vector3(0, 0, 0), userYaw: 0, userPitch: 0, userZoom: 1 };
  let activeRoom = null;
  function roomFrame(k) {
    const r = ROOMS[k];
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const span = Math.max(w, d * 1.3);
    // 稍微拉远一点，让隔壁房间在画面边缘露出一角
    return {
      cx: (r.x0 + r.x1) / 2 + 0.3, cy: r.y + 1.0, cz: (r.z0 + r.z1) / 2 + 0.2,
      dist: 12.5 + span * 0.9,
    };
  }
  // 2.5D 正交：固定等距方向，只平移与缩放；dist 换算为正交视野半高
  let viewAspect = 16 / 9;
  function updateCamera() {
    cam3.target.lerp(cam3.focus, 0.06);
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
  // ---- 挡视线的墙：从当前房间往相机方向打射线，碰到的墙块/门/门套变成半透明 ----
  // 每个房间只建背墙和左墙，所以东边邻居的左墙、前面房间的背墙会挡住本房间靠右、靠前的家具。
  // 正交相机：只和视线方向有关，换房间或拖动视角后重算。
  const fadedWalls = new Set();
  let occKey = '';
  function wallMeshes() {
    const out = [];
    wallLines.forEach(w => w.g.traverse(m => { if (m.isMesh) out.push(m); }));
    return out;
  }
  function setFaded(m, on) {
    if (on) {
      if (!m.userData.origMat) {
        m.userData.origMat = m.material;
        const f = m.material.clone(); f.transparent = true; f.opacity = 0.14; f.depthWrite = false;
        m.userData.fadeMat = f;
      }
      m.material = m.userData.fadeMat; m.castShadow = false;
      m.children.forEach(c => { if (c.isLineSegments) c.visible = false; });
    } else if (m.userData.origMat) {
      m.material = m.userData.origMat; m.castShadow = true;
      m.children.forEach(c => { if (c.isLineSegments) c.visible = true; });
    }
  }
  function updateOcclusion(force) {
    const k = activeRoom; if (!k) return;
    camera.updateMatrixWorld(true);
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const key = k + ':' + dir.x.toFixed(2) + ',' + dir.z.toFixed(2);
    if (!force && key === occKey) return; occKey = key;
    const r = ROOMS[k], meshes = wallMeshes(), rc = new THREE.Raycaster(), back = dir.clone().negate();
    const hit = new Set();
    rc.far = 40;
    for (let x = r.x0 + 0.2; x < r.x1 - 0.1; x += 0.4)
      for (let z = r.z0 + 0.2; z < r.z1 - 0.1; z += 0.4)
        for (const h of [0.15, 0.8, 1.6]) {
          rc.set(new THREE.Vector3(x, r.y + h, z), back);
          rc.intersectObjects(meshes, false).forEach(q => hit.add(q.object));
        }
    fadedWalls.forEach(m => { if (!hit.has(m)) { setFaded(m, false); fadedWalls.delete(m); } });
    hit.forEach(m => { if (!fadedWalls.has(m)) { setFaded(m, true); fadedWalls.add(m); } });
  }
  function showRoom(k, instant) {
    if (!ROOMS[k] || k === activeRoom) return;
    activeRoom = k;
    const nb = new Set(neighbours(k));
    // 整层公寓同时显示（参考图：剖切模型），墙全部实心；只有当前房间的灯更亮
    Object.entries(roomRoot).forEach(([rk, g]) => {
      g.visible = true;
      g.children.forEach(c => { if (c.name === 'veil') c.visible = false; });
    });
    // 灯光不切 visible（会触发着色器重编译导致卡顿），只调亮度
    Object.entries(roomLights).forEach(([rk, L]) => {
      L.on = true;
      L.cone.visible = rk === k; L.fixture.forEach(m => m.visible = true);
    });
    // 唯一投影的主光跟着当前房间走
    const [lx, lz] = LAMP_POS[k];
    keyLight.position.set(lx, ROOMS[k].y + 2.65, lz);
    moonBeam.visible = true;
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
    updateOcclusion(true);
    onRoomChange && onRoomChange(k);
  }
  let fade = 0, fadeDir = 0, pendingRoom = null;
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(r.width, r.height);
    const pr = renderer.getPixelRatio();
    paint.uniforms.uRes.value.set(r.width * pr, r.height * pr);
    paint.uniforms.uR.value = Math.max(2.0, Math.min(4.5, r.height * pr / 300));
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

  let lockedRooms = new Set();
  doorLeaves.forEach(d => {
    let best = null, bd = 1e9;
    DOORS.forEach(([a, b, pts]) => {
      const [p, q] = [pts[0], pts[pts.length - 1]];
      const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      const dd = Math.hypot(mx - d.cx, mz - d.cz);
      if (dd < bd) { bd = dd; best = [a, b]; }
    });
    if (best && bd < 2.5) { d.rooms = best; d.locked = () => lockedRooms.has(best[0]) || lockedRooms.has(best[1]); }
    // 固定开门方向（dir：横墙 1 = 往 -Z 开，竖墙 1 = 往 +X 开）。门板全开时贴墙的位置不能互相重叠、不能穿墙：
    // 地下室门往储物间开（另一侧是台阶扶手）；储物间另两扇门往外开，储物间四面墙都能堆杂物；
    // 客厅↔玄关门往客厅开（往玄关开会穿过储物间东墙）；卧室门往卧室开（给储物间北门的门板让位）
    const FIXED = { 'storage-plant': 1, 'living-storage': 1, 'entry-storage': 1, 'living-entry': 1, 'living-bedroom': -1 };
    if (best) d.fixedDir = FIXED[best.join('-')] || FIXED[best[1] + '-' + best[0]];
  });
  // ---------- 出口：门口地面一圈很淡的光，点击走到隔壁房间（门本身就是主要提示）----------
  const exits = [];
  const exitTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,214,140,0.35)'); r.addColorStop(0.55, 'rgba(255,190,100,0.12)'); r.addColorStop(1, 'rgba(255,190,100,0)');
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
    const path = planPath(player.position.x, player.position.z, tgt.x, tgt.z);
    const queue = [];
    let last = player.position.clone();
    path.forEach(([x, z]) => {
      const pt = new THREE.Vector3(x, 0, z);
      if (last.distanceTo(pt) > 0.12) { queue.push(pt); last = pt; }
    });
    if (queue.length) tgt.copy(queue[queue.length - 1]);
    if (!queue.length) { cb && cb(); return; }
    walk = { queue, tgt: queue.shift(), cb };
    marker.position.set(tgt.x, floorY(tgt.x, tgt.z) + 0.03, tgt.z); marker.visible = true;
  }
  // ---------- 键盘移动：WASD / 方向键，按屏幕方向走 ----------
  const keys = new Set();
  const KEYMAP = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  function typing() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); }
  window.addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    if (!k || locked || typing()) return;
    e.preventDefault();
    keys.add(k);
    if (walk) { walk = null; marker.visible = false; }
  });
  window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  window.addEventListener('blur', () => keys.clear());
  // ---------- 碰撞 ----------
  // 墙：只能站在房间内部（离墙 WM）或门洞走廊里。
  // 家具：按实际可见网格（含 Tripo 模型）在地面附近的包围盒，外扩角色半径 PR。
  const WM = 0.36, PR = 0.26, ROBOT_R = 0.32;
  // 楼梯两侧：只能从梯子两头上下
  const STAIR_SIDES = [{ x0: -8.3, x1: -6.0, z0: 1.9, z1: 2.0 }, { x0: -8.3, x1: -6.0, z0: 3.6, z1: 3.7 }];
  const NO_COLLIDE = new Set(['de_rug', 'st_door', 'robot', 'shard', 'scratch', 'status', 'city', 'home', 'ac']);
  let colliders = [];
  function chainVisible(o, stop) {
    for (let p = o; p && p !== stop; p = p.parent) if (!p.visible) return false;
    return true;
  }
  function solidBox(obj, baseY) {
    const b = new THREE.Box3(), mb = new THREE.Box3();
    let any = false;
    obj.updateMatrixWorld(true);
    obj.traverse(o => {
      if (!o.isMesh || !chainVisible(o, obj.parent)) return;
      mb.setFromObject(o);
      if (mb.isEmpty() || mb.min.y > baseY + 0.5) return;   // 挂墙 / 悬空 / 桌面小物不挡路
      if (!any) { b.copy(mb); any = true; } else b.union(mb);
    });
    if (!any) return null;
    const S = 0.04;   // 模型包围盒四角通常是空的，略收一点
    return { x0: b.min.x + S - PR, x1: b.max.x - S + PR, z0: b.min.z + S - PR, z1: b.max.z - S + PR, id: obj.userData.iid || 'solid' };
  }
  function rebuildColliders() {
    colliders = STAIR_SIDES.map(c => ({ x0: c.x0 - PR, x1: c.x1 + PR, z0: c.z0 - PR, z1: c.z1 + PR, id: 'stairs' }));

    Object.values(interact).forEach(it => {
      if (!it.visible || NO_COLLIDE.has(it.id)) return;
      const c = solidBox(it.obj, ROOMS[it.room] ? ROOMS[it.room].y : 0);
      if (c) { c.id = it.id; colliders.push(c); }
    });
    root.traverse(o => { if (o.userData.solid) { const c = solidBox(o, ROOMS[o.userData.solid].y); if (c) colliders.push(c); } });
    // 站位点落在家具里的，挪到同房间最近的空地
    Object.values(interact).forEach(it => {
      if (walkable(it.stand.x, it.stand.z)) return;
      const p = nearestFree(it.stand.x, it.stand.z, it.room);
      if (p) it.stand.set(p[0], 0, p[1]);
    });
  }
  const inBox = (c, x, z) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1;
  function inSpace(x, z, ignoreLocks) {
    for (const [k, r] of Object.entries(ROOMS)) {
      if (!ignoreLocks && lockedRooms.has(k)) continue;
      if (x > r.x0 + WM && x < r.x1 - WM && z > r.z0 + WM && z < r.z1 - WM) return true;
    }
    for (const [a, b, pts] of DOORS) {
      if (!ignoreLocks && (lockedRooms.has(a) || lockedRooms.has(b))) continue;
      const [p, q] = [pts[0], pts[pts.length - 1]];
      const minx = Math.min(p[0], q[0]) - 0.45, maxx = Math.max(p[0], q[0]) + 0.45;
      const minz = Math.min(p[1], q[1]) - 0.45, maxz = Math.max(p[1], q[1]) + 0.45;
      if (x >= minx && x <= maxx && z >= minz && z <= maxz) return true;
    }
    return false;
  }
  // 能否站在 (x, z)。from：当前所在点——已经陷在某个碰撞体里时（被瞬移进去、扫地机撞过来）允许走出来
  function walkable(x, z, from, opt) {
    opt = opt || {};
    if (!inSpace(x, z, opt.ignoreLocks)) return false;
    for (const c of colliders) {
      if (!inBox(c, x, z)) continue;
      if (from && inBox(c, from.x, from.z)) continue;
      return false;
    }
    if (!opt.noRobot && robot.visible) {
      const rr = ROBOT_R + PR, dx = x - robot.position.x, dz = z - robot.position.z;
      if (dx * dx + dz * dz < rr * rr && !(from && Math.hypot(from.x - robot.position.x, from.z - robot.position.z) < rr)) return false;
    }
    return true;
  }
  function nearestFree(x, z, room, opt) {
    for (let r = 0.05; r <= 2.0; r += 0.05) {
      let best = null, bd = Infinity;
      for (let a = 0; a < 32; a++) {
        const px = x + Math.cos(a / 32 * Math.PI * 2) * r, pz = z + Math.sin(a / 32 * Math.PI * 2) * r;
        if (room && roomAt(px, pz) !== room) continue;
        if (walkable(px, pz, null, opt)) { const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = [px, pz]; } }
      }
      if (best) return best;
    }
    return null;
  }

  // ---------- 寻路：0.1m 网格 Dijkstra，再拉直 ----------
  const GS = 0.1, GX0 = -12, GZ0 = -6, GW = 220, GH = 120;
  const cellOf = (x, z) => [Math.max(0, Math.min(GW - 1, Math.floor((x - GX0) / GS))), Math.max(0, Math.min(GH - 1, Math.floor((z - GZ0) / GS)))];
  const cellCenter = i => [GX0 + (i % GW + 0.5) * GS, GZ0 + (Math.floor(i / GW) + 0.5) * GS];
  // 返回从 (sx,sz) 走到离 (tx,tz) 最近的可达点的折线 [[x,z], ...]（不含起点）
  function planPath(sx, sz, tx, tz, opt) {
    const from = { x: sx, z: sz };
    const pass = new Uint8Array(GW * GH);
    for (let i = 0; i < GW * GH; i++) { const [x, z] = cellCenter(i); pass[i] = walkable(x, z, from, opt) ? 1 : 0; }
    const [scx, scz] = cellOf(sx, sz), start = scz * GW + scx;
    pass[start] = 1;
    const dist = new Float64Array(GW * GH).fill(Infinity), prev = new Int32Array(GW * GH).fill(-1);
    // 二叉堆
    const heap = [];
    const push = (i, d) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    dist[start] = 0; push(start, 0);
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let best = start, bestD = Math.hypot(sx - tx, sz - tz);
    while (heap.length) {
      const [d, i] = pop();
      if (d > dist[i]) continue;
      const [cx, cz] = cellCenter(i), td = Math.hypot(cx - tx, cz - tz);
      if (td < bestD - 1e-6) { bestD = td; best = i; }
      const gx = i % GW, gz = Math.floor(i / GW);
      for (const [ox, oz, w] of NB) {
        const nx = gx + ox, nz = gz + oz;
        if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
        const j = nz * GW + nx;
        if (!pass[j]) continue;
        if (ox && oz && (!pass[gz * GW + nx] || !pass[nz * GW + gx])) continue;   // 不切墙角
        const nd = d + w;
        if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(j, nd); }
      }
    }
    const cells = [];
    for (let i = best; i !== -1; i = prev[i]) cells.unshift(i);
    const pts = cells.map(cellCenter);
    pts[0] = [sx, sz];
    // 终点：目标本身可站就用目标，否则用最近可达格
    if (best !== start || bestD < GS) {
      const [bx, bz] = cellOf(tx, tz);
      if (bz * GW + bx === best && walkable(tx, tz, from, opt)) pts[pts.length - 1] = [tx, tz];
    }
    // 拉直：能直线走到的点就跳过中间格
    const clear = (a, b) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 0.05);
      for (let k = 1; k < n; k++) { const t = k / n; if (!walkable(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, from, opt)) return false; }
      return true;
    };
    const out = []; let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !clear(pts[a], pts[b])) b--;
      out.push(pts[b]); a = b;
    }
    return out;
  }
  function keyMove(dt) {
    if (!keys.size || locked) return false;
    // 屏幕「上」= 离开相机的地面方向
    const yaw = cam3.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let mx = 0, mz = 0;
    if (keys.has('u')) { mx += fx; mz += fz; }
    if (keys.has('d')) { mx -= fx; mz -= fz; }
    if (keys.has('r')) { mx += rx; mz += rz; }
    if (keys.has('l')) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz);
    if (len < 1e-3) return false;
    mx /= len; mz /= len;
    const step = 3.6 * dt, p = player.position;
    // 分轴尝试，贴墙时可以顺着墙滑动
    if (walkable(p.x + mx * step, p.z + mz * step, p)) { p.x += mx * step; p.z += mz * step; }
    else if (walkable(p.x + mx * step, p.z, p)) p.x += mx * step;
    else if (walkable(p.x, p.z + mz * step, p)) p.z += mz * step;
    const desired = Math.atan2(mx, mz);
    let dy = desired - player.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    player.rotation.y += dy * Math.min(1, 12 * dt);
    return true;
  }
  // 最近的可交互物（给 E 键用）
  function nearestInteract(maxDist) {
    let best = null, bd = maxDist;
    Object.values(interact).forEach(it => {
      if (!it.visible || it.room !== activeRoom || it.obj.userData.deco) return;
      const d = Math.hypot(it.stand.x - player.position.x, it.stand.z - player.position.z);
      if (d < bd) { bd = d; best = it.id; }
    });
    return best;
  }
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyE' || locked || typing()) return;
    const id = nearestInteract(1.8);
    if (id && onInteract) onInteract(id);
  });

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
  // 有吊灯的房间：厨房、玄关挂搪瓷吊灯，储物间、地下室是裸灯泡。客厅有吊扇、卧室有台灯和壁灯，浴室/阳台不挂
  const PENDANT_ROOMS = new Set(['kitchen', 'entry', 'storage', 'plant']);
  const LAMP_POS = {
    bedroom: [-9.0, -3.0], living: [-2.6, -3.0], kitchen: [3.6, -3.2], balcony: [8.0, -2.6],
    plant: [-8.6, 2.6], storage: [-4.0, 3.0], entry: [1.0, 3.0], bath: [7.0, 3.2],
  };
  // 投影主光：暖色，模拟参考图里台灯/吊灯打在家具上的硬阴影
  // 房间里的补光：很弱、不投影，只让光池外的家具留个轮廓
  const keyLight = new THREE.PointLight(0xffc98a, 0.5, 9, 1.6);
  root.add(keyLight);
  // 聚光灯：从主角头顶往下打一个圆形光池，跟着主角移动（主投影光）
  const spot = new THREE.SpotLight(0xffd6a0, 9.0, 13, 0.85, 0.95, 0.9);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.002; spot.shadow.radius = 4;
  spot.shadow.camera.near = 0.5; spot.shadow.camera.far = 10;
  spot.position.set(1, 4.2, 2.6); spot.target.position.set(1, 0, 2.6);
  root.add(spot); root.add(spot.target);
  const spotAt = new THREE.Vector3(1, 0, 2.6);
  const roomLights = {};
  Object.entries(ROOMS).forEach(([k, r]) => {
    const [x, z] = LAMP_POS[k];
    const top = r.y + 3.0;
    const l = new THREE.PointLight(0xffc477, 0.5, 10, 1.2);
    l.position.set(x, top - 0.35, z);
    root.add(l);
    if (k === 'plant') l.color.set(0xffa250);
    // 灯具本身是 Tripo 模型（PENDANTS），只挂在部分房间；没有吊灯的房间不画光锥，靠落地灯/壁灯/窗光
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });   // 只用来记录灯色（setMood 会改）
    const cone = lightCone(root, x, top - 0.25, z, 0.25, 1.5, top - 0.25 - r.y, 0xffb35c, 0.10);
    cone.userData.hasLamp = PENDANT_ROOMS.has(k);
    if (!cone.userData.hasLamp) cone.scale.set(0.001, 0.001, 0.001);
    roomLights[k] = { l, bulbMat, cone, fixture: [], base: 0.5, flicker: k === 'storage' || k === 'plant' };
  });

  // 月光：穿过窗户的冷色光柱
  const moon = new THREE.SpotLight(0xd9b48a, 0.9, 16, 0.38, 0.6, 1.2);
  moon.position.set(8.0, 3.2, -8); moon.target.position.set(7.0, 0, -1.5);
  moon.castShadow = true; moon.shadow.mapSize.set(512, 512);
  root.add(moon); root.add(moon.target);
  // 玻璃幕墙进光：每格玻璃前一道斜光柱（加色、带渐隐），落在地上的亮斑交给阴影贴图
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xcfe0e6, map: coneTex, transparent: true, opacity: 0.075, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const shafts = new THREE.Group(); root.add(shafts);
  for (let x = -5.5; x < 9.8; x += 1.2) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 4.2), shaftMat);
    m.position.set(x - 0.6, 1.5, 5.0); m.rotation.set(-0.95, 0.35, 0); shafts.add(m);
  }
  for (let z = -5.5; z < 5.8; z += 1.2) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 4.2), shaftMat);
    m.position.set(9.0, 1.5, z - 0.4); m.rotation.set(0, Math.PI / 2, 0.95); shafts.add(m);
  }
  // 室内雾气：一层很淡的冷色体积雾，贴着地面，让光柱和远处家具发灰（参考图一的空气感）
  const hazeMat = new THREE.MeshBasicMaterial({ color: 0x9fb0b8, transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 3; i++) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(22, 12), hazeMat);
    h.rotation.x = -Math.PI / 2; h.position.set(-1, 0.4 + i * 0.6, 0); h.renderOrder = 4; root.add(h);
  }
  const moonBeam = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 6.5), new THREE.MeshBasicMaterial({ color: 0xd9a86a, map: coneTex, transparent: true, opacity: 0.10, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
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
      const col = m.alarm ? 0xff3b2a : (k === 'plant' ? 0xffa250 : (k === m.focus ? 0xffb35c : 0xe0a060));
      L.l.color.set(col); L.bulbMat.color.set(col); L.cone.material.color.set(col);
      L.base = k === m.focus ? 2.6 : (m.night ? 0.45 : 0.8);
      L.cone.material.opacity = k === m.focus ? 0.18 : 0.05;
    });
    // 夜里窗外是城市的冷光，白天是阴天的灰白光；都从玻璃幕墙照进来
    // 体积雾：夜晚浓一些偏冷青，白天薄偏暖灰；警报时浓红
    // 雾色直接给线性 RGB（Color.set(hex) 会做 sRGB→线性转换，暗色会几乎变黑，雾就看不出来）
    fogPass.uniforms.uDensity.value = m.alarm ? 0.3 : (m.night ? 0.2 : 0.15);
    if (m.alarm) fogPass.uniforms.uFogCol.value.setRGB(0.36, 0.09, 0.07);
    else if (m.night) fogPass.uniforms.uFogCol.value.setRGB(0.15, 0.2, 0.26);
    else fogPass.uniforms.uFogCol.value.setRGB(0.24, 0.29, 0.34);
    // 光柱颜色：白天是阴天的冷白日光，夜里是窗外城市/月光的青蓝，警报时暗红
    const bc = m.alarm ? [0.85, 0.2, 0.15] : (m.night ? [0.5, 0.65, 0.85] : [0.7, 0.78, 0.88]);   // 冷青灰的窗光
    fogPass.uniforms.uShaftC.value.forEach(c => c.setRGB(bc[0], bc[1], bc[2]));
    hemi.intensity = m.night ? 0.16 : 0.26;
    sun.intensity = m.night ? 0.95 : 1.55;
    sun.color.set(m.night ? 0xa8c0d4 : 0xe6ecef);
    shaftMat.opacity = m.night ? 0.05 : 0.085;
    moon.intensity = m.night ? 2.2 : 1.6;
    alarm = m.alarm ? 1 : 0;
  }

  const clock = new THREE.Clock();
  let tick = null;
  // 自适应画质：连续卡顿就关掉 Bloom、降低像素比
  const LITE = /[?&]lite/.test(location.search);
  // 雾用的深度：只画不透明物体（玻璃、光柱、灰尘、雾片不挡雾），用最便宜的材质，不更新阴影
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  let _transp = null, _transpAt = -1;
  function renderFogDepth() {
    const now = clock.elapsedTime;
    if (!_transp || now - _transpAt > 3) {      // 模型异步加载，隔几秒重收集一次
      _transp = []; _transpAt = now;
      scene.traverse(o => {
        if (o.isPoints || o.isLine || o.isSprite) { _transp.push(o); return; }
        if (!o.isMesh) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (m && (m.transparent || m.blending === THREE.AdditiveBlending || m.depthWrite === false)) _transp.push(o);
      });
    }
    const vis = _transp.map(o => o.visible);
    _transp.forEach(o => { o.visible = false; });
    const au = renderer.shadowMap.autoUpdate, bg = scene.background, fg = scene.fog;
    renderer.shadowMap.autoUpdate = false; scene.overrideMaterial = depthMat; scene.background = null; scene.fog = null;
    const old = renderer.getRenderTarget();
    renderer.setRenderTarget(depthRT); renderer.clear(); renderer.render(scene, camera); renderer.setRenderTarget(old);
    scene.overrideMaterial = null; scene.background = bg; scene.fog = fg; renderer.shadowMap.autoUpdate = au;
    _transp.forEach((o, i) => { o.visible = vis[i]; });
  }
  // 体积雾的散射光源：离镜头焦点最近的几盏亮着的点光源（吊灯、落地灯/壁灯的 glow、地下室钠灯）
  const _fl = [], _v = new THREE.Vector3();
  // 丁达尔光柱：从三扇后墙窗、玄关前的玻璃幕墙射进来（与 windowOn 的位置/尺寸对应）
  function setupBeams() {
    const U = fogPass.uniforms;
    const B = [
      // [起点（窗外一点）], [方向（往屋里斜下）], [半宽, 半高], 张角, 长度
      [[-4.4, 1.75, -6.3], [0.15, -0.38, 0.91], [0.95, 0.9], 0.38, 5.5],    // 客厅后窗
      [[3.25, 1.85, -6.3], [-0.1, -0.4, 0.91], [0.75, 0.8], 0.36, 5.0],     // 厨房后窗
      [[-12.3, 1.7, -2.6], [0.9, -0.38, 0.2], [1.1, 0.95], 0.4, 5.5],       // 卧室侧窗
      [[1.0, 1.9, 6.4], [0.12, -0.36, -0.93], [2.4, 1.2], 0.3, 5.2],        // 玄关玻璃幕墙
      [[-4.0, 1.9, 6.4], [0.1, -0.36, -0.93], [1.7, 1.2], 0.3, 5.0],        // 储物间玻璃幕墙
      [[7.0, 1.9, 6.4], [-0.1, -0.36, -0.93], [2.4, 1.2], 0.3, 5.2],        // 浴室玻璃幕墙
    ];
    B.forEach(([p, d, w, a, l], i) => {
      U.uShaftP.value[i].set(p[0], p[1], p[2]); U.uShaftD.value[i].set(d[0], d[1], d[2]).normalize();
      U.uShaftW.value[i].set(w[0], w[1]); U.uShaftA.value[i] = a; U.uShaftL.value[i] = l;
    });
  }
  setupBeams();
  function updateFogLights() {
    if (!_fl.length || _fl.dirty) {
      _fl.length = 0;
      root.traverse(o => { if (o.isPointLight && !o.isSpotLight && o !== keyLight && o.distance > 0) _fl.push(o); });
    }
    const f = cam3.target;
    const cand = _fl.filter(l => l.visible && l.intensity > 0.05).map(l => { l.getWorldPosition(_v); return [l, _v.clone(), _v.distanceToSquared(f)]; })
      .sort((a, b) => a[2] - b[2]).slice(0, FOG_L);
    const P = fogPass.uniforms.uLPos.value, C = fogPass.uniforms.uLCol.value;
    for (let i = 0; i < FOG_L; i++) {
      if (cand[i]) {
        const [l, pos] = cand[i]; P[i].copy(pos);
        C[i].copy(l.color).multiplyScalar(Math.min(1.6, l.intensity) * 0.5);
      } else P[i].set(0, -99, 0);
    }
  }
  let slow = 0, degraded = false;
  function degrade() {
    if (degraded) return; degraded = true;
    bloom.enabled = false;
    paint.uniforms.uR.value = 2.0;
    fogPass.uniforms.uScatter.value = 0.6;
    fogPass.uniforms.uSteps.value = 8;
    renderer.setPixelRatio(1); resize();
  }
  if (LITE) degrade();
  if (/[?&]nofog/.test(location.search)) fogPass.enabled = false;   // 对比/调试用
  { const mb = location.search.match(/[?&]beam=([\d.]+)/); if (mb) fogPass.uniforms.uBeamI.value = +mb[1]; }   // 调光柱强度
  // ---------- 主角骨骼动画：走路 walk、停下 idle ----------
  let mixer = null, act = {}, curAct = null;
  function setPlayerAnim(model, clips) {
    mixer = new THREE.AnimationMixer(model);
    act = {};
    clips.forEach(c => {
      // 根动作：Tripo 的 walk 会让 Hip 沿前进方向一圈挪 0.7m（in-place 之外的位移），
      // 游戏自己移动角色，所以把 Hip / Root 的位移改成「只保留上下起伏」，前后左右固定在绑定姿势。
      c.tracks = c.tracks.map(t => {
        if (!/\.position$/.test(t.name) || !/(^|[.:/])(hip|hips|root|pelvis)\.position$/i.test(t.name)) return t;
        const bone = model.getObjectByName(t.name.replace(/\.position$/, ''));
        if (!bone) return t;
        const rest = bone.position, v = t.values.slice();
        // 找出位移最大的轴（就是前进方向），把它和另一条水平轴压回静止值；上下起伏保留
        const span = [0, 1, 2].map(k => { let lo = 1e9, hi = -1e9; for (let i = k; i < v.length; i += 3) { lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]); } return hi - lo; });
        const fwd = span.indexOf(Math.max(...span));
        for (let i = 0; i < v.length; i += 3) {
          for (let k = 0; k < 3; k++) if (k === fwd) v[i + k] = rest.getComponent(k);
        }
        return new THREE.VectorKeyframeTrack(t.name, t.times, v);
      });
      act[c.name.toLowerCase()] = mixer.clipAction(c);
    });
    curAct = null; playAnim('idle', 0);
  }
  function playAnim(name, fade) {
    const a = act[name] || null;
    if (!a || a === curAct) return;
    a.reset().setEffectiveWeight(1).play();
    if (curAct) curAct.crossFadeTo(a, fade == null ? 0.2 : fade, false);
    curAct = a;
  }
  let occTick = 0;
  function loop() {
    const raw = clock.getDelta();
    if (++occTick % 10 === 0) updateOcclusion(false);
    if (!degraded) { slow = raw > 0.06 ? slow + raw : Math.max(0, slow - raw); if (slow > 2.5) degrade(); }
    const dt = Math.min(0.05, raw);
    const t = clock.elapsedTime;
    const vis = player.userData.visual || body;
    const hop = mixer ? 0 : 1;          // 有骨骼动画时不再整体上下弹跳
    let moving = false;
    if (keyMove(dt)) {
      moving = true;
      vis.position.y = hop * Math.abs(Math.sin(t * 11)) * 0.06;
    } else if (walk) {
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
        moving = true;
        vis.position.y = hop * Math.abs(Math.sin(t * 11)) * 0.06;
      }
    } else if (vis) vis.position.y += (0 - vis.position.y) * Math.min(1, 8 * dt);
    doorLeaves.forEach(d => {
      const p = player.position;
      const near = Math.abs(p.y - d.y) < 1 && Math.hypot(p.x - d.cx, p.z - d.cz) < 1.5;
      const blocked = near && d.locked && d.locked();
      const want = near && !blocked ? 1 : 0;
      if (want && !d.open) {   // 决定往哪边开：远离人物的一侧
        d.dir = d.fixedDir || (d.horiz ? (p.z < d.cz ? -1 : 1) : (p.x < d.cx ? 1 : -1));
      }
      d.open += (want - d.open) * Math.min(1, dt * (want ? 6 : 3.5));
      const sgn = (d.dir || 1) * (d.hb ? -1 : 1);
      d.hinge.rotation.y = d.base + sgn * d.open * Math.PI * 0.955;
      // 铰链移到墙面那一侧，门板转过来贴在墙上而不是插进墙里
      const push = 0.11 * Math.min(1, d.open * 1.6) * (d.dir || 1);
      if (d.horiz) d.hinge.position.z = d.hz - push; else d.hinge.position.x = d.hx + push;
    });
    if (mixer) {
      playAnim(moving ? 'walk' : 'idle');
      if (act.walk) act.walk.timeScale = 1.35;   // 步频配合移动速度，脚不打滑
      mixer.update(dt);
    }
    const fy = floorY(player.position.x, player.position.z);
    player.position.y += (fy - player.position.y) * Math.min(1, 8 * dt);
    // 穿过门洞：切换到新房间（先黑场，再显示）
    const cur = roomAt(player.position.x, player.position.z);
    if (cur && cur !== activeRoom && !pendingRoom) showRoom(cur);
    if (fadeDir === 1) {
      fade = Math.min(1, fade + dt * 5);
      if (fade >= 1) { if (pendingRoom) { showRoom(pendingRoom); pendingRoom = null; cam3.target.copy(cam3.focus); } fadeDir = -1; }
    } else if (fade > 0) fade = Math.max(0, fade - dt * 2.6);
    // 镜头跟随玩家（整层可见，以人物为中心，略偏向当前房间中心）
    if (activeRoom) {
      const f = roomFrame(activeRoom);
      cam3.focus.set(player.position.x * 0.7 + f.cx * 0.3, f.cy, player.position.z * 0.7 + f.cz * 0.3);
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
      // 只有玩家所在的房间亮灯，别的房间关灯
      L.l.intensity = (k === activeRoom ? 0.55 : 0) * f;   // 主光是跟着主角的聚光灯，房间灯只做很弱的底光
      L.cone.visible = false;
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
    // 深度：渲染到 offscreen 目标，给体积雾用
    const wpx = Math.round(renderer.domElement.width / 2), hpx = Math.round(renderer.domElement.height / 2);   // 半分辨率够用
    if (depthRT.width !== wpx || depthRT.height !== hpx) depthRT.setSize(wpx, hpx);
    if (fogPass.enabled) renderFogDepth();
    fogPass.uniforms.tDepth.value = depthRT.depthTexture;
    fogPass.uniforms.uInvVP.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    camera.getWorldDirection(fogPass.uniforms.uCamDir.value);
    fogPass.uniforms.uTime.value = t;
    fogPass.uniforms.uBase.value += ((activeRoom && ROOMS[activeRoom].y < 0 ? -1.4 : 0) - fogPass.uniforms.uBase.value) * 0.05;
    updateFogLights();
    {
      // 光池略微滞后于主角（像有人在上面打追光），地面高度跟着楼层走
      const pp = player.position, k = Math.min(1, dt * 5);
      spotAt.x += (pp.x - spotAt.x) * k; spotAt.z += (pp.z - spotAt.z) * k;
      spotAt.y += (floorY(pp.x, pp.z) - spotAt.y) * Math.min(1, dt * 8);
      const H = fogPass.uniforms.uSpotH.value;
      spot.position.set(spotAt.x, spotAt.y + H, spotAt.z);
      spot.target.position.copy(spotAt); spot.target.updateMatrixWorld();
      fogPass.uniforms.uSpot.value.copy(spotAt);
      // 警报时光池变红并跟着脉冲
      if (alarm) { spot.color.setRGB(1, 0.35, 0.3); spot.intensity = 6.0 + pulse * 4.0; fogPass.uniforms.uSpotC.value.setRGB(1.0, 0.3, 0.25); }
      else { spot.color.set(0xffd6a0); spot.intensity = 9.0; fogPass.uniforms.uSpotC.value.setRGB(1.0, 0.82, 0.6); }
    }
    composer.render();
    requestAnimationFrame(loop);
  }

  return {
    start() { rebuildColliders(); resize(); showRoom(roomAt(player.position.x, player.position.z) || 'entry', true); loop(); },
    showRoom, activeRoom: () => activeRoom,
    onRoomChange(fn) { onRoomChange = fn; },
    interact, ROOMS,
    roomAt: () => roomAt(player.position.x, player.position.z),
    onInteract(fn) { onInteract = fn; },
    onHover(fn) { onHover = fn; },
    onBlocked(fn) { onBlocked = fn; },
    setLockedRooms(arr) { lockedRooms = new Set(arr); },
    isWalking: () => !!walk,
    setPlayerAnim, playerAnim: () => (curAct ? curAct.getClip().name : null),
    doors: () => doorLeaves.map(d => ({ open: d.open, rooms: d.rooms || null, x: d.cx, z: d.cz })), room: () => activeRoom,
    wallLines: () => wallLines.map(w => ({ scale: w.g.scale.y, horiz: w.horiz, c: w.c })),
    doorSweep() {
      const out = [];
      doorLeaves.forEach((d, i) => {
        (d.fixedDir ? [d.fixedDir] : [1, -1]).forEach(dir => {
          const save = [d.hinge.rotation.y, d.hinge.position.x, d.hinge.position.z];
          // 和 loop 里完全开门时一样的姿态
          d.hinge.rotation.y = d.base + dir * (d.hb ? -1 : 1) * Math.PI * 0.955;
          if (d.horiz) d.hinge.position.z = d.hz - 0.11 * dir; else d.hinge.position.x = d.hx + 0.11 * dir;
          d.hinge.updateMatrixWorld(true);
          const bb = new THREE.Box3().setFromObject(d.hinge.children[0]);
          d.hinge.rotation.y = save[0]; d.hinge.position.x = save[1]; d.hinge.position.z = save[2]; d.hinge.updateMatrixWorld(true);
          colliders.forEach(c => {
            const ix = Math.min(bb.max.x, c.x1 - PR) - Math.max(bb.min.x, c.x0 + PR), iz = Math.min(bb.max.z, c.z1 - PR) - Math.max(bb.min.z, c.z0 + PR);
            if (ix > 0.03 && iz > 0.03) out.push([i, d.rooms && d.rooms.join('-'), dir, c.id, +ix.toFixed(2), +iz.toFixed(2), [bb.min.x, bb.max.x, bb.min.z, bb.max.z].map(v => +v.toFixed(2))]);
          });
        });
      });
      return out;
    },
    // 主角在屏幕上的像素位置（测试截图用）
    playerScreen() { const v = player.position.clone(); v.y += 0.7; v.project(camera); const r = canvas.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
    lock(v) { locked = v; if (v) { setHighlight(hoverId, false); hoverId = null; onHover && onHover(null); } },
    setVisible(id, v) { interact[id].visible = v; interact[id].obj.visible = v; rebuildColliders(); },
    rebuildColliders, planPath, walkable, colliders: () => colliders,
    setMood, goTo,
    teleport(x, z) {
      if (!walkable(x, z)) { const f = nearestFree(x, z, roomAt(x, z), { ignoreLocks: true }); if (f) { x = f[0]; z = f[1]; } }
      player.position.set(x, floorY(x, z), z); walk = null; marker.visible = false;
      const k = roomAt(x, z); if (k) { pendingRoom = null; fadeDir = 0; showRoom(k, true); }
    },
    screens: { tv: tvScreen, plan: planScreen, cam: camScreen, pc: pcScreen }, pcKeys,
    lamps: { lockLed, echoEye, echoLight, qingLight, glass, lampShade },
    statusLeds, blood, robot, shard, potG, roomRoot,
    toon, setTick(fn) { tick = fn; },
    renderer, player, gradTex, cam3, root, spot, camera, wallGroups: () => wallLines, fadedWalls: () => fadedWalls.size,
  };
})();
