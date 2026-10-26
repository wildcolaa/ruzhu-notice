// ============================================================
// Tripo3D 模型替换
// MODEL_DATA 由 build.py 从 fable/models/*.glb 注入（base64）。
// 有模型的物件：按原方块组的包围盒等比缩放、落地、居中，隐藏方块；
// 没有模型的物件：继续使用程序化方块。
// ============================================================
const Models = (() => {
  const data = (typeof MODEL_DATA !== 'undefined') ? MODEL_DATA : {};
  // 每个模型的摆放参数：fit 用哪条轴对齐原尺寸，rotY 修正 Tripo 的朝向
  // size: 目标世界尺寸 [宽, 高, 深]；rotY 修正 Tripo 朝向
  const SPEC = {
    sofa: { size: [2.8, 1.0, 1.1], rotY: 0 },
    // Tripo 电视模型原本屏幕朝 -Z（贴墙），转 180° 让显像管朝向房间；
    // 文字屏缩到显像管大小，贴在玻璃前面，不再伸出机身两侧；状态灯放到旋钮面板上
    tv: { size: [1.0, 1.15, 0.6], rotY: Math.PI, keepScreen: true, screen: [-0.07, 0.625, 0.315], screenGeo: [0.62, 0.48], screenTex: { w: 420, h: 340, size: 30 }, led: [0.37, 0.68, 0.3, 0.4] },
    bed: { size: [2.2, 1.0, 1.25], rotY: 0 },
    planner: { size: [1.05, 2.15, 0.95], rotY: 0, keepScreen: true, screen: [0, 1.45, 0.5], alias: 'fridge' },
    tortoise: { size: [0.5, 0.32, 0.55], rotY: 0 },
    tub: { size: [2.2, 0.8, 1.0], rotY: 0 },
    crate: { size: [0.7, 0.7, 0.7], rotY: 0 },
    mirror: { size: [0.75, 1.6, 0.5], rotY: 0 },
    console: { size: [1.2, 1.4, 0.7], rotY: 0, alias: 'power' },
    server: { size: [0.9, 1.4, 0.7], rotY: 0, alias: 'reject_log' },
    broadcast: { size: [1.15, 1.4, 0.7], rotY: 0, alias: 'radio' },
    npc_echo: { size: [0.9, 1.4, 0.7], rotY: 0, keepLights: true, alias: 'reject_log' },
    door: { size: [1.5, 2.5, 0.14], rotY: 0, keepLights: true, alias: 'lock' },
    shoes: { size: [1.6, 0.9, 0.6], rotY: Math.PI / 2 },
    npc_qing: { size: [0.55, 0.55, 0.55], rotY: 0, float: true, alias: 'home' },
    // 网格脸朝 +X；走路逻辑假定角色朝 +Z，所以先转 -90°。不要再按长轴自动转。
    player: { size: [0.72, 1.45, 0.72], rotY: -Math.PI / 2, autoAlign: false },   // 大头 Q 版：放宽宽度，避免被缩得太小
    deco_board: { size: [2.4, 1.6, 0.08], rotY: 0, lift: 1.4, exact: true },
    deco_lamp: { size: [0.4, 0.55, 0.4], rotY: 0 },
    deco_plant: { size: [0.7, 1.3, 0.7], rotY: 0 },
    deco_filing: { size: [0.55, 1.2, 0.5], rotY: 0 },
    deco_phone: { size: [0.35, 0.22, 0.28], rotY: 0 },
    deco_sidetable: { size: [0.7, 0.55, 0.7], rotY: 0 },
    deco_coatrack: { size: [0.55, 1.8, 0.55], rotY: 0 },
    deco_bin: { size: [0.35, 0.4, 0.35], rotY: 0 },
    deco_chair: { size: [0.7, 1.05, 0.7], rotY: Math.PI * 0.15 },
    deco_boxes: { size: [0.7, 0.7, 0.5], rotY: 0 },
    deco_laundry: { size: [0.55, 0.5, 0.55], rotY: 0 },
    deco_stool: { size: [0.4, 0.45, 0.4], rotY: 0 },
    deco_umbrella: { size: [0.4, 0.95, 0.4], rotY: 0 },
    deco_clock: { size: [0.45, 0.45, 0.08], rotY: 0, lift: 2.4, exact: true },
    deco_cardboard: { size: [1.1, 0.9, 0.8], rotY: 0.3 },
    deco_shelf: { size: [1.4, 1.8, 0.45], rotY: 0 },
    deco_fan: { size: [0.4, 0.55, 0.4], rotY: 0 },
    deco_typewriter: { size: [0.5, 0.22, 0.4], rotY: 0 },
    // ---- 极乐迪斯科风格的布景（tripo_de.py 生成）----
    de_radiator: { size: [1.1, 0.75, 0.22], rotY: 0 },
    de_armchair: { size: [0.85, 0.95, 0.85], rotY: 0 },
    de_armchair2: { size: [0.95, 0.95, 0.9], rotY: 0 },
    de_ceilfan: { size: [1.4, 0.45, 1.4], rotY: 0, lift: 2.65 },
    de_rug: { size: [2.6, 0.03, 1.8], rotY: 0, flat: true },
    de_reeltape: { size: [1.0, 0.9, 0.45], rotY: 0 },
    de_laundry: { size: [1.2, 0.45, 0.9], rotY: 0 },
    de_bottles: { size: [0.55, 0.38, 0.4], rotY: 0 },
    de_bookshelf: { size: [0.8, 1.7, 0.32], rotY: 0 },
    de_desk: { size: [1.3, 1.05, 0.65], rotY: 0 },
    de_walllamp: { size: [0.28, 0.3, 0.28], rotY: 0, lift: 1.85, glow: 0xffd09a },
    de_floorlamp: { size: [0.5, 1.7, 0.5], rotY: 0, glow: 0xffc27a },
    de_coatrack: { size: [0.8, 1.05, 0.3], rotY: 0, lift: 1.0 },
    de_debris: { size: [1.2, 0.4, 0.9], rotY: 0 },
    de_boiler: { size: [0.75, 1.6, 0.75], rotY: 0 },
    de_chairs: { size: [0.55, 1.0, 0.6], rotY: 0.5 },
    // ---- 储物间（参考极乐迪斯科：堆叠的旧扶手椅、床单枕头、掉在地上的吊扇）----
    // src：复用已有模型的数据，不额外生成 glb
    // st_armpile..st_radiator：tripo_de.py 专为储物间生成；pre = 适配尺寸前先把模型转倒
    st_armpile: { size: [0.95, 1.55, 0.85], rotY: 0 },
    st_linen: { size: [0.85, 0.6, 0.75], rotY: 0 },
    st_fan: { size: [1.0, 0.45, 0.85], rotY: 0, pre: [1.35, 0, 0.15] },
    st_door: { size: [0.85, 0.06, 1.9], rotY: 0, flat: true, exact: true },
    st_mannequin: { size: [1.05, 0.28, 0.55], rotY: 0 },
    st_tools: { size: [0.9, 1.5, 0.6], rotY: 0, alias: 'tools' },
    st_radiator: { size: [0.55, 0.95, 0.22], rotY: 0 },
    // ---- 替换剩下的白膜物件（tripo_de.py）----
    lamp: { size: [0.5, 1.75, 0.5], rotY: 0 },
    notice: { size: [1.0, 0.72, 0.9], rotY: 0, exact: true },   // 桌面高度要对上电话/打字机
    robot: { size: [0.62, 0.14, 0.62], rotY: 0 },
    waste: { size: [0.42, 0.6, 0.42], rotY: 0 },
    ac: { size: [1.3, 0.38, 0.26], rotY: 0, exact: true },
    pothos: { size: [0.9, 1.1, 0.9], rotY: 0 },
    water: { size: [0.32, 1.0, 0.32], rotY: 0 },
    speaker: { size: [0.6, 1.05, 0.5], rotY: 0 },
    curtain: { size: [0.12, 2.6, 1.6], rotY: 0, exact: true },
    locker: { size: [0.6, 1.1, 0.7], rotY: Math.PI / 2, autoAlign: false },   // 靠西墙，柜门朝 +X
    dock: { size: [0.5, 0.32, 0.36], rotY: Math.PI },
    status: { size: [0.42, 0.55, 0.07], rotY: 0, lift: 1.2, exact: true, keepScreen: true, screen: [0, 1.53, 0.045], screenScale: 0.6 },
    counter: { size: [2.6, 0.95, 0.9], rotY: 0, exact: true },   // 台面高度要对上风扇
    cel_sofa: { size: [1.7, 0.9, 0.8], rotY: Math.PI },        // 靠前沿护墙，面朝 -Z
    cel_junk: { size: [1.3, 1.0, 0.65], rotY: 0 },
    // 吊灯：lift = 天花板 3.15 - 模型高度；emit 只让灯罩/灯泡自发光，不额外加点光源
    lamp_pendant: { size: [0.55, 0.8, 0.55], rotY: 0, lift: 2.35, emit: 0xffc27a },
    lamp_pendant2: { src: 'lamp_pendant', size: [0.55, 0.8, 0.55], rotY: 0, lift: 2.35, emit: 0xffc27a },
    lamp_bulb: { size: [0.16, 0.95, 0.16], rotY: 0, lift: 2.2, emit: 0xffd9a0 },
    lamp_bulb2: { src: 'lamp_bulb', size: [0.16, 0.95, 0.16], rotY: 0, lift: 2.2, emit: 0xffa250 },
    st_sheets2: { src: 'de_laundry', size: [0.7, 0.28, 0.5], rotY: 0.4 },
    st_lamp: { src: 'de_walllamp', size: [0.28, 0.3, 0.28], rotY: 0, lift: 1.9, glow: 0xffd09a },
    st_bottles: { src: 'de_bottles', size: [0.45, 0.32, 0.35], rotY: 0 },
  };
  const loaded = {};
  const floaters = [];

  function b64ToBuf(b64) {
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  // 把 PBR 材质转成卡通材质，保留贴图，与整体风格一致
  // 蒙皮网格：Box3.setFromObject 只看未变形的原始顶点（Tripo 绑骨后原始顶点是 y −1..1，
  // 套上骨骼才是 0..1），会让角色被缩小一半、脚悬空。这里按骨骼变形后的顶点算。
  function skinnedBox(o) {
    const b = new THREE.Box3(), v = new THREE.Vector3(), pos = o.geometry.attributes.position;
    o.updateMatrixWorld(true);
    if (o.skeleton) o.skeleton.update();
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      o.boneTransform(i, v);
      b.expandByPoint(v.applyMatrix4(o.matrixWorld));
    }
    return b;
  }
  function visBox(root) {
    const b = new THREE.Box3();
    let any = false;
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const bb = o.isSkinnedMesh ? skinnedBox(o) : new THREE.Box3().setFromObject(o, true);
      if (bb.isEmpty()) return;
      if (!any) { b.copy(bb); any = true; } else b.union(bb);
    });
    return any ? b : new THREE.Box3().setFromObject(root);
  }

  function stripGround(root) {
    // Tripo 经常在模型底部附带一块巨大的地面，会盖住房间地板
    const meshes = [];
    root.updateMatrixWorld(true);
    root.traverse(o => { if (o.isMesh) meshes.push(o); });
    if (meshes.length < 2) return;
    const whole = visBox(root);
    const wsize = whole.getSize(new THREE.Vector3());
    meshes.forEach(o => {
      const b = new THREE.Box3().setFromObject(o);
      const s = b.getSize(new THREE.Vector3());
      const area = s.x * s.z;
      const thin = s.y < Math.max(0.08, wsize.y * 0.18) && area > wsize.x * wsize.z * 0.35;
      const atBottom = b.min.y <= whole.min.y + wsize.y * 0.12;
      const huge = s.x > wsize.x * 0.7 && s.z > wsize.z * 0.7 && s.y < Math.max(s.x, s.z) * 0.22;
      if ((thin && atBottom) || huge) o.visible = false;
    });
  }

  function stylize(root, grad) {
    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      // Tripo 的贴图本身已经是手绘卡通质感：用 Lambert 保留贴图色彩，不再叠一层三阶色带
      const m = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        map: (src && src.map) || null,
      });
      if (src && (src.emissiveMap || (src.emissive && src.emissive.getHex && src.emissive.getHex() > 0))) {
        m.emissive = src.emissive ? src.emissive.clone() : new THREE.Color(0xffffff);
        m.emissiveMap = src.emissiveMap || null;
        m.emissiveIntensity = 1.2;
      }
      if (m.map) { m.map.anisotropy = 4; m.map.needsUpdate = true; }
      o.material = m;
    });
  }

  function fitToSize(model, tw, th, td, autoAlign) {
    model.updateMatrixWorld(true);
    let box = visBox(model);
    let size = box.getSize(new THREE.Vector3());
    // 自动把模型最长水平边对齐目标最长水平边（角色关闭，避免把脸转歪）
    if (autoAlign !== false && Math.abs(tw - td) > 0.08 && (size.x >= size.z) !== (tw >= td)) {
      model.rotation.y += Math.PI / 2;
      model.updateMatrixWorld(true);
      box = visBox(model);
      size = box.getSize(new THREE.Vector3());
    }
    const ratios = [tw / Math.max(1e-4, size.x), th / Math.max(1e-4, size.y), td / Math.max(1e-4, size.z)].sort((a, b) => a - b);
    const s = ratios[0] * 0.25 + ratios[1] * 0.75;
    model.scale.multiplyScalar(s);
    const b2 = visBox(model);
    const c2 = b2.getCenter(new THREE.Vector3());
    model.position.x -= c2.x;
    model.position.z -= c2.z;
    model.position.y -= b2.min.y;
  }

  // 让出一帧：requestIdleCallback 在渲染循环很忙时可能一直不触发，所以加 timeout 兜底
  function idle() { return new Promise(r => typeof requestIdleCallback !== 'undefined' ? requestIdleCallback(r, { timeout: 50 }) : setTimeout(r, 0)); }
  async function apply(world) {
    const ids = Object.keys(data).map(id => [id, id])
      .concat(Object.entries(SPEC).filter(([k, s]) => s.src && data[s.src] && !data[k]).map(([k, s]) => [k, s.src]));
    if (!ids.length || !THREE.GLTFLoader) return 0;
    const loader = new THREE.GLTFLoader();
    if (THREE.MeshoptDecoder) loader.setMeshoptDecoder(THREE.MeshoptDecoder);
    let n = 0;
    for (const [id, key] of ids) {
      if (n > 0 && n % 8 === 0) await idle();   // 每 4 个模型让出一帧，画面先动起来
      const spec = SPEC[id] || { fit: 'y', rotY: 0 };
      const hostId = spec.alias || id;
      const host = id === 'player' ? world.player : (world.interact[hostId] && world.interact[hostId].obj);
      if (!host) continue;
      if (loaded[hostId] && hostId !== id) continue;
      try {
        const gltf = await new Promise((res, rej) => loader.parse(b64ToBuf(data[key]), '', res, rej));
        const model = gltf.scene;
        model.rotation.y = spec.rotY || 0;
        if (spec.flat) {
          const bb0 = new THREE.Box3().setFromObject(model), sz0 = bb0.getSize(new THREE.Vector3());
          const thin = Math.min(sz0.x, sz0.y, sz0.z);
          if (thin === sz0.z) model.rotation.x = -Math.PI / 2;        // 立在 XY 平面
          else if (thin === sz0.x) model.rotation.z = Math.PI / 2;    // 立在 YZ 平面
        }
        if (spec.pre) model.rotation.set(spec.pre[0], model.rotation.y + spec.pre[1], spec.pre[2]);
        stripGround(model);
        stylize(model, world.gradTex);
        const wrap = new THREE.Group();
        const inner = new THREE.Group(); inner.add(model); wrap.add(inner);
        const sz = spec.size || [1, 1, 1];
        fitToSize(inner, sz[0], sz[1], sz[2], spec.autoAlign);
        if (spec.exact) {
          // 按轴分别拉伸到目标尺寸（压扁过厚的模型，如平躺的门板）
          const b = visBox(inner), s3 = b.getSize(new THREE.Vector3());
          inner.scale.set(inner.scale.x * sz[0] / s3.x, inner.scale.y * sz[1] / s3.y, inner.scale.z * sz[2] / s3.z);
          const b2 = visBox(inner), c2 = b2.getCenter(new THREE.Vector3());
          inner.position.x -= c2.x; inner.position.z -= c2.z; inner.position.y -= b2.min.y;
        }
        if (spec.lift) wrap.position.y += spec.lift;
        if (spec.emit) wrap.traverse(o => { if (o.isMesh && o.material) { o.material.emissive = new THREE.Color(spec.emit); o.material.emissiveIntensity = 0.35; } });
        if (spec.glow) {
          const L = new THREE.PointLight(spec.glow, 1.1, 4.5, 1.8);
          L.position.set(0, (spec.size || [1, 1, 1])[1] * 0.85, 0.15); wrap.add(L);
          wrap.traverse(o => { if (o.isMesh && o.material) { o.material.emissive = new THREE.Color(spec.glow); o.material.emissiveIntensity = 0.18; } });
        }
        if (id === 'player' || hostId === 'player') {
          world.player.userData.visual = wrap;
          // 带骨骼动画的主角：交给场景的动画混合器（walk / idle）
          if (gltf.animations && gltf.animations.length && world.setPlayerAnim) world.setPlayerAnim(model, gltf.animations);
        }
        host.children.forEach(ch => {
          if (ch.isLight) return;
          // 状态灯也是 MeshBasicMaterial，要先于屏幕判断，否则会被当成屏幕挪走
          if (ch.userData && ch.userData.keep) {
            if (spec.led && world.statusLeds && world.statusLeds[hostId] === ch) { ch.position.set(spec.led[0], spec.led[1], spec.led[2]); ch.scale.setScalar(spec.led[3]); }
            return;
          }
          if (spec.keepScreen && ch.material && ch.material.isMeshBasicMaterial) {
            if (spec.screen) ch.position.set(spec.screen[0], spec.screen[1], spec.screen[2]);
            if (spec.screenScale) ch.scale.setScalar(spec.screenScale);
            if (spec.screenGeo) {
              ch.geometry.dispose(); ch.geometry = new THREE.PlaneGeometry(spec.screenGeo[0], spec.screenGeo[1]);
              if (spec.screenTex && ch.userData.setText) { Object.assign(ch.userData.opt, spec.screenTex); ch.userData.setText(ch.userData.lines); }
            }
            return;
          }
          if (spec.keepLights && ch.material && ch.material.emissive && ch.material.emissive.getHex() > 0) return;
          ch.visible = false;
        });
        host.add(wrap);
        if (hostId !== 'player') wrap.traverse(o => { if (o.isMesh) o.userData.iid = hostId; });
        if (spec.float) floaters.push(wrap);
        loaded[hostId] = wrap; n++;
      } catch (e) {
        console.warn('模型加载失败，使用方块：', id, e);
      }
    }
    return n;
  }

  return {
    apply, loaded, SPEC,
    count: () => Object.keys(data).length,
    tick(dt, t) { floaters.forEach((f, i) => { f.rotation.y += dt * 0.4; f.position.y = Math.sin(t * 1.4 + i) * 0.05; }); },
  };
})();
