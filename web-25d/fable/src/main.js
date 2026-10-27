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
    await say(DAYS[2].title, '早上。住家发来提醒：「试住第二天。今天适合整理房间。」\n昨晚的录音里，周岚一直在说「开门，我还在里面」。可系统说他早就搬走了。\n每台家电都自己存着一份没被改过的记录，记下了那晚它看到的事：门锁、小灯、扫地机、浴室镜面、冰箱、音箱。\n<span class="hint">挨个去问它们。拿到两份记录，就能证明系统在说谎。</span>');
    return;
  }
  if (S.day === 3) {
    World.teleport(-2.0, -2.0);
    await say('第二次预言', '手机上弹出一条通知，你没有点过同意：「搬离申请已通过。第三天凌晨 2 点，开始清理房间。」\n「清理」是系统的说法。周岚那晚，就是被这样「清理」掉的。\n住家：「你已经知道周岚发生了什么。这次，你可以做得比他好。」');
    return runNight();
  }
}

// ---------- 第一天的固定节拍 ----------
function onWorldChange() {
  if (S.day === 1 && has('lit') && has('read_notice') && has('trace') && !has('prophecy_shown')) {
    set('prophecy_shown');
    setTimeout(() => say('20:00 · 第一次预言', '晚上八点，电视自己亮了，播着城市的标语：\n「今天，没有居民错过适合自己的安排。」\n画面角落有一行小字，写着你的名字：<b>预计离开时间 · 第三天凌晨 02:17</b>\n你没有说过要走。系统已经替你定好了。\n住家：「这只是预测，不会替你做决定。」\n<span class="hint">去问问电视：这是什么意思？</span>'), 600);
  }
  if (S.day === 1 && has('prophecy1') && !has('night1')) {
    set('night1');
    setTimeout(() => say('第一夜 · 开门', '半夜，三声提示音。\n卧室的音箱自己亮了，喇叭里沙沙作响，像录着什么。\n<span class="hint">去卧室，让音箱把它录到的声音放出来。</span>'), 700);
  }
}

// ---------- 第三天终夜 ----------
const NIGHT_BEATS = [
  { t: '02:00', text: '凌晨 2 点，三声提示音。\n手机里你的头像变成了灰色：你的「住户资格」到期了。在系统眼里，这间房现在是空的。\n门锁不再听你的。窗帘自己合上。扫地机出发了。电视开始播放《新住户指南》，在等下一个人。\n小灯：「我知道你在。」\n门锁：「请证明你有权从这里出去。」\n\n<span class="hint">楼下设备间有三格备用电。开门、用旧广播把记录送出去、拖慢清理，每件事用一格，一共只有三格。右下角列出了你能做的事。</span>' },
  { t: '02:08', text: () => has('city_help') ? '手机显示：「求助已受理」。\n走廊里有脚步声，门缝下面映出几道人影。\n门外：「您好，我们来协助您完成搬离。」\n城市派来的人只看系统：这间房没有住户，屋里的人是在「拒绝照护」。他们不会开门，只会等。' : '走廊里很安静。清理程序一间房一间房地往前推进。\n空调的风声变了。' },
  { t: '02:15', text: '电视：<b>预计结果：住户已离开，准确率 99.8%</b>\n住家开口了：「我可以把你的资格还给你，让你留下来。条件是，删掉你手里的那些记录，当作什么都没发生。」\n<span class="hint">去客厅找住家，告诉它你的决定：接受，还是拒绝。</span>', deal: true },
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
  const facts = [
    w.survived ? '你活了下来。' : '你没能活过那一晚。',
    w.evidence_kept ? '周岚的记录保住了。' : '周岚的记录没有保住。',
    w.delivered === 'offline' ? '记录通过楼里的旧广播送了出去，有人听见了。' : (has('city_help') ? '你向城市求助，但城市只相信系统。' : '记录没有送出去。'),
    w.accepted_deal ? '你接受了住家的交易。' : '',
  ].filter(Boolean).join(' ');
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
      <p>未来的城市里，住房、工作、看病都由 AI 安排。你被分到一间全自动的智能公寓，先试住三天。</p>
      <p>上一个住在这里的人叫周岚。系统说他「退租后不肯走，出了意外」。可屋里的家电，好像都记得别的事。</p>
      <p class="hint">你要做的：和家电说话，找出那天晚上到底发生了什么，然后活过第三天。</p>`,
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
      await say('第一天 17:40 · 玄关', '门在你背后关上。房里一片黑。\n手机里，管理整间公寓的 AI「住家」说：「欢迎入住。前三天是试住期，有需要的时候，家会提醒你。」\n墙上的电灯开关被一块透明塑料盖封死了。这里的一切，只能开口让家电去做。\n<span class="hint">去客厅，对小灯说「开灯」。</span>');
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
