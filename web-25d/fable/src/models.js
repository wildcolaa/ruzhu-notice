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
    sofa: { size: [3.0, 1.15, 1.2], rotY: 0 },
    tv: { size: [2.4, 1.7, 0.7], rotY: 0, keepScreen: true, screen: [0, 1.5, 0.16] },
    bed: { size: [2.2, 0.9, 1.55], rotY: 0 },
    planner: { size: [1.05, 2.15, 0.95], rotY: 0, keepScreen: true, screen: [0, 1.45, 0.5], alias: 'fridge' },
    tortoise: { size: [0.5, 0.32, 0.55], rotY: 0 },
    tub: { size: [2.4, 0.85, 1.15], rotY: 0 },
    crate: { size: [0.7, 0.7, 0.7], rotY: 0 },
    mirror: { size: [0.95, 1.6, 0.12], rotY: 0, lift: 0.7 },
    console: { size: [1.2, 1.4, 0.7], rotY: 0, alias: 'power' },
    server: { size: [0.9, 1.4, 0.7], rotY: 0, alias: 'reject_log' },
    broadcast: { size: [1.15, 1.4, 0.7], rotY: 0, alias: 'radio' },
    npc_echo: { size: [0.9, 1.4, 0.7], rotY: 0, keepLights: true, alias: 'reject_log' },
    door: { size: [1.5, 2.5, 0.14], rotY: 0, keepLights: true, alias: 'lock' },
    shoes: { size: [0.6, 0.9, 1.8], rotY: 0 },
    npc_qing: { size: [0.55, 0.55, 0.55], rotY: 0, float: true, alias: 'home' },
    // 网格脸朝 +X；走路逻辑假定角色朝 +Z，所以先转 -90°。不要再按长轴自动转。
    player: { size: [0.55, 1.55, 0.55], rotY: -Math.PI / 2, autoAlign: false },
    deco_board: { size: [2.4, 1.6, 0.08], rotY: 0, lift: 1.4 },
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
    deco_clock: { size: [0.45, 0.45, 0.08], rotY: 0, lift: 2.4 },
    deco_cardboard: { size: [1.1, 0.9, 0.8], rotY: 0.3 },
    deco_shelf: { size: [1.4, 1.8, 0.45], rotY: 0 },
    deco_fan: { size: [0.4, 0.55, 0.4], rotY: 0 },
    deco_typewriter: { size: [0.5, 0.22, 0.4], rotY: 0 },
  };
  const loaded = {};
  const floaters = [];

  function b64ToBuf(b64) {
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  // 把 PBR 材质转成卡通材质，保留贴图，与整体风格一致
  function visBox(root) {
    const b = new THREE.Box3();
    let any = false;
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const bb = new THREE.Box3().setFromObject(o);
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

  async function apply(world) {
    const ids = Object.keys(data);
    if (!ids.length || !THREE.GLTFLoader) return 0;
    const loader = new THREE.GLTFLoader();
    if (THREE.MeshoptDecoder) loader.setMeshoptDecoder(THREE.MeshoptDecoder);
    let n = 0;
    for (const id of ids) {
      const spec = SPEC[id] || { fit: 'y', rotY: 0 };
      const hostId = spec.alias || id;
      const host = id === 'player' ? world.player : (world.interact[hostId] && world.interact[hostId].obj);
      if (!host) continue;
      if (loaded[hostId] && hostId !== id) continue;
      try {
        const gltf = await new Promise((res, rej) => loader.parse(b64ToBuf(data[id]), '', res, rej));
        const model = gltf.scene;
        model.rotation.y = spec.rotY || 0;
        stripGround(model);
        stylize(model, world.gradTex);
        const wrap = new THREE.Group();
        const inner = new THREE.Group(); inner.add(model); wrap.add(inner);
        const sz = spec.size || [1, 1, 1];
        fitToSize(inner, sz[0], sz[1], sz[2], spec.autoAlign);
        if (spec.lift) wrap.position.y += spec.lift;
        if (id === 'player' || hostId === 'player') world.player.userData.visual = wrap;
        host.children.forEach(ch => {
          if (ch.isLight) return;
          if (spec.keepScreen && ch.material && ch.material.isMeshBasicMaterial) {
            if (spec.screen) ch.position.set(spec.screen[0], spec.screen[1], spec.screen[2]);
            return;
          }
          if (spec.keepLights && ch.material && ch.material.emissive && ch.material.emissive.getHex() > 0) return;
          if (ch.userData && ch.userData.keep) return;
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
