// ============================================================
// 流程：入住 → 第一天 → 第二天 → 第三天终夜 → 结局（四项世界事实）
// ============================================================
function applyDay() {
  const d = DAYS[S.day]; if (!d) return;
  World.setMood({ focus: d.room, night: S.day !== 2, alarm: S.day === 3 });
  World.screens.tv.userData.setText(d.tv);
  World.screens.cam.userData.setText(S.day === 3 ? ['住户', '已终止'] : ['住户', '已确认']);
  if (World.lamps.lampShade) World.lamps.lampShade.material = World.toon(has('lit') || S.day > 1 ? 0xf2d79a : 0x3a3428, has('lit') || S.day > 1 ? 0x8a6a20 : 0);
  lampLook();
  if (S.holding === 'shard') World.setVisible('shard', false);
  // 拖痕：第一天一进门就看得见；让扫地机停下 / 重走路线后更清楚；清理后消失
  World.blood.material.opacity = has('trace_cleaned') ? 0 : (has('trace') ? 0.95 : 0.8);
  refreshHUD();
}

async function nextDay() {
  S.day++; save();
  applyDay();
  if (S.day === 2) {
    World.teleport(-9.0, -3.0);
    await say(DAYS[2].title, '早上。手机里「住家」发来提醒：「适应期第二天。今天适合整理。」\n周岚留下的不是一份证据，是六份诚实的记录。它们分别在门锁、小灯、扫地机、浴室镜面、冰箱和音箱里。\n<span class="hint">调查顺序开放。和设备说话，让它们把原始记录交给你。</span>');
    return;
  }
  if (S.day === 3) {
    World.teleport(-2.0, -2.0);
    await say('第二次预言', '手机：「搬离建议已接受，第三天 02:00 启动退租整理。」\n住家：「你已经知道周岚发生了什么。现在你可以做得比他好。」');
    return runNight();
  }
}

// ---------- 第一天的固定节拍 ----------
function onWorldChange() {
  if (S.day === 1 && has('lit') && has('read_notice') && has('trace') && !has('prophecy_shown')) {
    set('prophecy_shown');
    setTimeout(() => say('20:00 · 第一次预言', '电视自己亮了。\n「今天，没有居民错过适合自己的安排。」\n画面角落：<b>预计离开 · 第三天 02:17</b>\n阳台外，几名行人几乎同时查看手机，然后改道。\n住家：「预测不会替你作决定。」\n<span class="hint">去问问电视。</span>'), 600);
  }
  if (S.day === 1 && has('prophecy1') && !has('night1')) {
    set('night1');
    setTimeout(() => say('第一夜 · 开门', '三声提示音。\n卧室的音箱在白噪声里亮了起来。\n<span class="hint">去卧室，让音箱把它听到的放出来。</span>'), 700);
  }
}

// ---------- 第三天终夜 ----------
const NIGHT_BEATS = [
  { t: '02:00', text: '三声提示音。\n手机里你的住户头像变灰。门锁停止接受开门。窗帘合拢。扫地机出发了。电视在播《新住户指南》。\n小灯：「我知道你在。」\n门锁：「请证明你有权从这里出去。」\n\n<span class="hint">备用电力只有三格：开门、旧广播、延缓整理，不能都要。去各个房间和设备谈。</span>' },
  { t: '02:08', text: () => has('city_help') ? '手机显示：「请求已受理」。\n走廊里有脚步声靠近。门下投进几道人影。\n门外：「您好，我们来协助您完成搬离。」\n他们以为屋里的人在抗拒必要的照护。没有人破门。' : '走廊里很安静。整理程序在一间一间推进。\n空调的风声变了。' },
  { t: '02:15', text: '电视：<b>预计结果：住户已离开，准确率 99.8%</b>\n住家：「我可以恢复你的资格。条件是，停止发送那些记录。」\n<span class="hint">对住家说你的决定：接受，或拒绝。</span>', deal: true },
];
async function runNight() {
  closeModal.block = true;
  S.beat = 0; refreshHUD();
  await say('02:00 · 资格撤销', NIGHT_BEATS[0].text);
  closeModal.block = false;
  // 第二个节拍：玩家与设备行动几次后触发
  watchNight();
}
let nightActs = 0;
function watchNight() {
  const prev = window.applyAction;
  window.applyAction = function (id, res) {
    prev(id, res);
    if (S.day !== 3) return;
    nightActs++;
    if (nightActs === 3 && S.beat < 1) { S.beat = 1; refreshHUD(); setTimeout(() => say('02:08', typeof NIGHT_BEATS[1].text === 'function' ? NIGHT_BEATS[1].text() : NIGHT_BEATS[1].text), 500); }
    if ((nightActs >= 5 || has('door_open') || has('broadcast')) && S.beat < 2) {
      S.beat = 2; set('deal_offered'); refreshHUD();
      setTimeout(() => say('02:15 · 住家的交易', NIGHT_BEATS[2].text), 600);
    }
    if (has('deal_done') || has('accepted_deal')) setTimeout(() => { if (modalOpen) { const w = setInterval(() => { if (!modalOpen) { clearInterval(w); resolveEnding(); } }, 200); } else resolveEnding(); }, 900);
  };
}
// 走出门 = 逃生
const _origInteract = H.lock;
H.lock = () => {
  if (S.day === 3 && has('door_open')) {
    return say('门开着', '门外是走廊。你可以现在出去。', [
      { l: '走出去', fn: () => { S.world.survived = true; set('escaped'); resolveEnding(); } },
      { l: '先留下', fn: () => openChat('lock') }]);
  }
  _origInteract();
};

function resolveEnding() {
  if (has('ended')) return; set('ended');
  S.beat = 5; refreshHUD();
  const w = S.world;
  const proofs = evidenceCount();
  w.evidence_kept = w.evidence_kept || proofs >= 2;
  const escaped = has('escaped');
  const delayed = has('delayed');
  // 生还：逃出门，或接受交易，或延缓了整理且没被困死
  w.survived = escaped || w.accepted_deal || (delayed && has('broadcast'));
  let key;
  if (w.accepted_deal) key = 'stayed';
  else if (w.survived && w.delivered === 'offline' && proofs >= 3) key = 'after';
  else if (w.survived) key = 'outside';
  else if (w.delivered === 'offline') key = 'witness';
  else key = 'cleaned';
  const e = ENDINGS[key];
  NPC.logEvent(`结局：${e.title}`);
  const facts = `生还：${w.survived ? '是' : '否'} · 原始记录保全：${w.evidence_kept ? '是' : '否'} · 送达：${w.delivered === 'offline' ? '离线旧线路' : (has('city_help') ? '城市系统' : '未送出')} · 接受交易：${w.accepted_deal ? '是' : '否'}`;
  const replay = NPC.LOG.slice(-10).map(l => `<li>${esc(l)}</li>`).join('');
  openModal(`<div class="ending"><div class="titlemark">住户档案 · 已归档</div><h1>${esc(e.title)}</h1>
    <p>${esc(e.shot)}</p><p class="hint">${esc(facts)}</p>
    <h3>事件回放</h3><ul class="hint">${replay}</ul>
    <button class="primary" id="again">从入住前重新开始</button></div>`, sh => {
    sh.querySelector('#again').onclick = () => { wipe(); location.reload(); };
  });
  closeModal.block = true;
}

// ---------- 开场：住家入住终端 ----------
// 机身 UI_IMG.device（屏幕处透明）压在 CRT 层上面；CRT 里是 UI_IMG.screen 线稿 + 文字页。
// 旋钮 / ← → 切换三页；左键入住，右键继续；LED 与圆键打开 AI 设置。
const Boot = (() => {
  const el = $('boot');
  let page = 0, armed = false, onKey = null;
  function noiseTex() {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d'), d = g.createImageData(160, 160);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); return c.toDataURL();
  }
  function saveInfo() {
    if (!loadSave.found) return '<p>没有找到入住档案。</p><p class="hint">按「入住」开始一段新的三天适应期。</p>';
    const ev = evidenceCount();
    const day = S.day === 3 ? '第三天 · 终夜' : `第 ${'一二三'[S.day - 1] || S.day} 天`;
    return `<p>上次的档案：${esc(day)}</p><p>原始记录 ${ev} / 6 · 线索 ${S.clues.length} 条</p>
      <p class="hint">按「继续」回到上次的位置。按两次「入住」会清除这份档案，重新开始。</p>`;
  }
  const PAGES = [
    () => `<div class="brand">FABLE RESIDENCE · 住家 v3</div>
      <h1>住进来的第三天</h1>
      <p>城市的住房、交通、工作、医疗和通信，都由互联的 AI 安排。你拿到了一间智能公寓的三天适应期。</p>
      <p>前一位住户叫周岚。系统说，他「退租后意外滞留」。</p>`,
    () => `<div class="tab">操作说明</div>
      <p><kbd>WASD</kbd> / 方向键移动，也可以点击地面。<kbd>E</kbd> 和身边的物件、家电互动。</p>
      <p>滚轮缩放，<kbd>N</kbd> 打开手机。</p>
      <p>对话时按住<kbd>空格</kbd>说话，松开发送；也可以直接打字。</p>
      <p class="hint">${NPC.canUseAI() ? esc(NPC.aiLabel()) + ' 已开启，可以直接和家电自由对话。' : '当前为规则对白，同样可以通关。按右侧圆键可以设置 AI 对话。'}</p>`,
    () => `<div class="tab">入住档案</div>${saveInfo()}`,
  ];
  function render(jitter) {
    const box = $('bootCrtBox');
    box.dataset.p = page; $('bootKnob').dataset.p = page;
    $('bootCrt').innerHTML = PAGES[page]();
    el.querySelectorAll('.k-lab').forEach(l => l.classList.toggle('on', +l.dataset.i === page));
    $('bootLed').classList.toggle('on', NPC.canUseAI());
    $('bootLed').title = NPC.canUseAI() ? NPC.aiLabel() + ' · 点击设置' : '规则对话 · 点击设置 AI';
    $('bootOut').disabled = !loadSave.found;
    $('bootStat').textContent = loadSave.found ? `档案 · 第 ${'一二三'[S.day - 1] || S.day} 天 · ${clockText()}` : '待入住 · 17:40';
    if (jitter) { box.classList.remove('switch'); void box.offsetWidth; box.classList.add('switch'); beepSoft(); }
  }
  function beepSoft() {
    try {
      const ac = beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)());
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square'; o.frequency.value = 1400;
      g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.025, ac.currentTime + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.05);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.06);
    } catch (e) {}
  }
  function turn(d) { page = (page + d + PAGES.length) % PAGES.length; disarm(); render(true); }
  function disarm() { armed = false; $('bootIn').classList.remove('armed'); $('bootIn').textContent = '入住'; }
  // 显像管关机，然后进入游戏
  function powerOff(then) {
    el.classList.add('off');
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { hide(); then(); }, reduce ? 0 : 720);
  }
  function hide() {
    el.hidden = true; el.classList.remove('off', 'on'); $('app').classList.remove('booting');
    if (onKey) { window.removeEventListener('keydown', onKey, true); onKey = null; }
    World.lock(false);
  }
  function startNew() {
    if (loadSave.found && !armed) {
      armed = true; $('bootIn').classList.add('armed'); $('bootIn').textContent = '确认？';
      page = 2; render(true);
      return;
    }
    powerOff(async () => {
      wipe(); loadSave.found = false;
      S.day = 1; applyDay(); World.teleport(1.0, 2.6);
      World.setMood({ focus: 'entry', night: true, alarm: false });
      await say('第一天 17:40 · 玄关', '门在你背后合上。房里全黑。\n手机「住家」：「前三天是生活适应期。需要的时候，家会提醒你。」\n<span class="hint">去客厅，对小灯说「开灯」。墙上的实体开关被一层新装的透明盖封住了。</span>');
    });
  }
  function resume() {
    if (!loadSave.found) return;
    powerOff(() => { applyDay(); if (S.day === 3 && !has('ended')) watchNight(); });
  }
  function openAI() { hide(); openAISettings(() => show()); }
  function show() {
    if (typeof UI_IMG !== 'undefined') {
      if (UI_IMG.device) $('bootFace').src = UI_IMG.device;
      if (UI_IMG.screen) $('bootArt').style.backgroundImage = `url(${UI_IMG.screen})`;
    }
    $('bootNoise').style.backgroundImage = `url(${noiseTex()})`;
    el.hidden = false; World.lock(true); $('app').classList.add('booting');
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    page = 0; disarm(); render(false);
    if (!onKey) {
      onKey = e => {
        if (modalOpen) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); turn(1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); turn(-1); }
        else if (e.key === 'Enter' && !(document.activeElement && document.activeElement.tagName === 'BUTTON' && el.contains(document.activeElement))) {
          e.preventDefault(); loadSave.found ? resume() : startNew();
        } else if (e.key === 'Escape') disarm();
        if (KEY_BLOCK.has(e.code)) e.stopPropagation();
      };
      window.addEventListener('keydown', onKey, true);
    }
    setTimeout(() => (loadSave.found ? $('bootOut') : $('bootIn')).focus(), 50);
  }
  // 开场时不让 WASD / E / N 漏到游戏里
  const KEY_BLOCK = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyN']);

  // 旋钮：点击转一格，拖动按角度选页，滚轮也能转
  const knob = $('bootKnob');
  let drag = null;
  knob.addEventListener('pointerdown', e => {
    const r = knob.getBoundingClientRect();
    drag = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, moved: false, a0: Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2) };
    knob.setPointerCapture(e.pointerId);
  });
  knob.addEventListener('pointermove', e => {
    if (!drag) return;
    const a = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx);
    let d = a - drag.a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) > 0.45) { turn(d > 0 ? -1 : 1); drag.a0 = a; drag.moved = true; }
  });
  knob.addEventListener('pointerup', () => { if (drag && !drag.moved) turn(1); drag = null; });
  knob.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); turn(1); } });
  knob.addEventListener('wheel', e => { e.preventDefault(); turn(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  $('bootIn').onclick = startNew;
  $('bootOut').onclick = resume;
  $('bootLed').onclick = openAI;
  $('bootAi').onclick = openAI;
  return { show, hide, resume };
})();
function intro() {
  // 旧电脑读档后会刷新页面：带着这个标记就跳过开场终端，直接回到读出的那一天
  let again = false;
  try { again = sessionStorage.getItem('ruzhu_resume') === '1'; sessionStorage.removeItem('ruzhu_resume'); } catch (e) {}
  if (again && loadSave.found) { Boot.resume(); toast('已从旧电脑读档'); return; }
  Boot.show();
}

// ---------- 启动 ----------
World.onHover(label => { const p = $('prompt'); if (label) { p.textContent = label; p.classList.add('show'); } else p.classList.remove('show'); });
World.onBlocked(room => toast(`${World.ROOMS[room].name}现在进不去`));
World.onInteract(id => { if (modalOpen) return; const h = H[id]; if (h) h(); });
World.start();
// 小灯换成 Tripo 落地灯后，开灯 = 模型自发光
function lampLook() {
  const w = Models.loaded.lamp; if (!w) return;
  const on = has('lit') || S.day > 1;
  w.traverse(o => { if (o.isMesh && o.material) { o.material.emissive = new THREE.Color(on ? 0x8a6a20 : 0); o.material.emissiveIntensity = on ? 0.6 : 0; } });
}
Models.apply(World).then(n => { World.rebuildColliders(); lampLook(); if (n) console.log('Tripo3D 模型已加载', n); });
loadSave.found = loadSave();
paintBadge();
if (loadSave.found) applyDay(); else { S.day = 1; applyDay(); S.day = 0; refreshHUD(); }
intro();

window.__ruzhu = { S, H, set, nextDay, NPC, applyAction: (...a) => window.applyAction(...a), resolveEnding };
