// ============================================================
// 状态、HUD、对话框
// ============================================================
const $ = id => document.getElementById(id);
const S = {
  day: 0, flags: {}, clues: [], chat: {}, greeted: {},
  power: 3,          // 终夜备用电力：开门 / 广播 / 延缓程序 / 保全证据，不能同时满足
  holding: null,     // 玩家手上的道具
  beat: 0,           // 终夜节拍
  world: { survived: null, evidence_kept: false, delivered: 'none', accepted_deal: false },
};
const has = f => !!S.flags[f];
function set(f) { S.flags[f] = true; save(); refreshHUD(); }
function save() { try { localStorage.setItem('ruzhu_v2', JSON.stringify({ S, log: NPC.LOG })); } catch (e) {} }
function loadSave() {
  try {
    const v = JSON.parse(localStorage.getItem('ruzhu_v2') || 'null');
    if (v && v.S && v.S.day) { Object.assign(S, v.S); NPC.LOG.push(...(v.log || [])); return true; }
  } catch (e) {}
  return false;
}
function wipe() { try { localStorage.removeItem('ruzhu_v2'); } catch (e) {} }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function clockText() {
  if (S.day === 3) return ['02:00', '02:04', '02:08', '02:12', '02:15', '02:17'][Math.min(S.beat, 5)];
  const d = DAYS[S.day]; return d ? d.time : '17:40';
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}
function clue(text) {
  if (S.clues.includes(text)) return;
  S.clues.push(text); save(); refreshHUD(); toast('手机已留存一条记录');
}
function evidenceCount() { return Object.keys(EVIDENCE).filter(k => has(k)).length; }

function paintBadge() {
  const el = $('badge'); if (!el || !window.BADGE_SRC) return;
  el.innerHTML = `<img alt="" src="${window.BADGE_SRC}">`;
}

// ---------- 模态 ----------
let modalOpen = false;
function openModal(html, onMount) {
  const m = $('modal');
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  m.classList.add('show'); modalOpen = true; World.lock(true);
  const first = m.querySelector('input, button'); first && first.focus();
  onMount && onMount(m.firstChild);
}
function closeModal() { $('modal').classList.remove('show'); $('modal').innerHTML = ''; modalOpen = false; World.lock(false); setTimeout(flushSay, 120); }
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalOpen && !closeModal.block) closeModal();
  if ((e.key === 'n' || e.key === 'N') && !modalOpen && S.day) openPhone();
});
// 对话框打开时，剧情弹窗排队，等玩家结束对话再出现
const sayQueue = [];
function flushSay() { if (!modalOpen && sayQueue.length) { const q = sayQueue.shift(); sayNow(q.title, q.body, q.choices).then(q.res); } }
function say(title, body, choices) {
  if (modalOpen && document.querySelector('#modal #msg')) return new Promise(res => sayQueue.push({ title, body, choices, res }));
  return sayNow(title, body, choices);
}
function sayNow(title, body, choices) {
  choices = choices || [{ l: '继续' }];
  const html = `${title ? `<h2>${esc(title)}</h2>` : ''}${body.split('\n').map(p => `<p>${p}</p>`).join('')}
    <div class="choices">${choices.map((c, i) => `<button data-i="${i}" ${c.disabled ? 'disabled style="opacity:.45;cursor:not-allowed"' : ''}>${esc(c.l)}</button>`).join('')}</div>`;
  return new Promise(res => openModal(html, sh => {
    sh.querySelectorAll('.choices button').forEach(b => b.onclick = () => {
      const c = choices[+b.dataset.i]; if (c.disabled) return;
      closeModal(); c.fn && c.fn(); res(+b.dataset.i);
    });
  }));
}

// ---------- HUD ----------
function refreshHUD() {
  const d = DAYS[S.day];
  $('daychip').textContent = S.day ? `第 ${'一二三'[S.day - 1]} 天` : '入住前';
  $('clock').textContent = clockText();
  if (d) {
    $('ruletitle').textContent = d.rule[0];
    $('rulebody').textContent = d.rule[1];
    $('sealn').innerHTML = S.day === 3 ? '终<br>夜' : `第<br>${'一二'[S.day - 1]}`;
    $('objtitle').textContent = d.title;
    const left = d.goals.filter(([f]) => !has(f));
    let body = d.goals.map(([f, t]) => `${has(f) ? '✓' : '·'} ${esc(t)}`).join('<br>');
    if (S.day === 2) body += `<br><br>独立记录 ${evidenceCount()} / 6（两份即可推进真相）`;
    if (S.day === 3) body += `<br>备用电力 ${'■'.repeat(S.power)}${'□'.repeat(Math.max(0, 3 - S.power))}`;
    if (S.day < 3 && canSleep()) body += '<br><br>今天能做的已经做完。去卧室的床上休息。';
    $('objbody').innerHTML = body;
  }
  $('cluelist').innerHTML = S.clues.length ? S.clues.map(c => `<li>${esc(c)}</li>`).join('') : '<li>尚未留存记录。</li>';
  const total = 6, n = evidenceCount();
  $('pfill').style.width = Math.min(100, (n / total) * 100) + '%';
  $('plabel').textContent = `原始记录 ${n} / ${total}`;
  $('dock').innerHTML = `<button class="npcbtn" id="btnPhone">手机（N）</button><button class="toolbtn" id="btnNotice">住户须知</button><button class="toolbtn" id="btnReset">重新开始</button>`;
  $('btnPhone').onclick = openPhone;
  $('btnNotice').onclick = showNotice;
  $('btnReset').onclick = () => say('重新开始？', '当前进度会被清除，回到入住前。', [
    { l: '清除进度并重新开始', fn: () => { wipe(); location.reload(); } }, { l: '取消' }]);
  World.setLockedRooms(d ? d.locked : ['plant']);
  if (World.lamps.lockLed) World.lamps.lockLed.material = World.toon(S.day === 3 && !has('door_open') ? 0xc45c4a : (has('door_open') ? 0x7fd08a : 0xc9842a), 0x4a1010);
}
function canSleep() {
  const d = DAYS[S.day]; if (!d) return false;
  if (S.day === 1) return d.goals.every(([f]) => has(f));
  if (S.day === 2) return evidenceCount() >= 2 && has('raw_timeline');
  return false;
}

function showNotice() {
  openModal(`<h2>《住户须知》</h2>
    <p>一、听见屋内有人说开门，请确认对方仍是本房住户。</p>
    <p>二、整理期间请勿妨碍家电清洁。</p>
    <p>三、屏幕预告离开时间时，请提前收拾。</p>
    <p>四、第三天结束前，请勿关闭住家。</p>
    <p class="hint">物业纸张，置于过分整齐的餐桌中央。</p>
    <div class="choices"><button id="x">合上</button></div>`, sh => sh.querySelector('#x').onclick = closeModal);
}

// ---------- 手机：智能家居 App（日志/记录）+ 小饱 ----------
function openPhone() {
  const ev = Object.entries(EVIDENCE).filter(([k]) => has(k)).map(([, e]) => `<li>${esc(e.text)}</li>`).join('') || '<li>还没有导出任何原始记录。</li>';
  const log = NPC.LOG.slice(-12).reverse().map(l => `<li>${esc(l)}</li>`).join('') || '<li>暂无住宅动态。</li>';
  const raw = has('raw_timeline') ? `<h3>原始时间线</h3><pre style="font-size:13px;background:#1c1814;color:#efe4c8;padding:10px">${RAW_TIMELINE.map(esc).join('\n')}</pre>` : '';
  openModal(`<h2>住家 · 智能家居</h2>
    <p class="hint">住户状态：${S.day === 3 ? '<b style="color:#9c3b32">资格已终止</b>' : '已确认'}${S.day === 3 ? ` · 备用电力 ${S.power}` : ''}</p>
    <h3>已导出的原始记录</h3><ul>${ev}</ul>${raw}
    <h3>住宅动态</h3><ul>${log}</ul>
    <div class="choices"><button id="xb">打开「小饱」聊天</button><button id="x">收起手机</button></div>`, sh => {
    sh.querySelector('#x').onclick = closeModal;
    sh.querySelector('#xb').onclick = () => { closeModal(); openChat('xiaobao'); };
  });
}

// ---------- 设备对话：统一输入框 ----------
function ctxSummary() {
  return `第${S.day}天，${clockText()}。已发现：${S.clues.slice(-6).join('；') || '无'}。独立记录 ${evidenceCount()} 份。`;
}
async function openChat(id) {
  const a = AGENTS[id];
  S.chat[id] = S.chat[id] || [];
  const hist = S.chat[id];
  const html = `<h2>${esc(a.name)}<span class="hint" style="margin-left:10px">${esc(a.duty)} · ${NPC.canUseAI() ? '实时对话' : '规则对话'}</span></h2>
    <p class="hint">感知：${esc(a.sense)}</p>
    <div class="chatlog" id="log" aria-live="polite"></div>
    <div class="row"><input id="msg" placeholder="问、说服、指挥，或做个实验……回车发送" aria-label="对设备说话" autocomplete="off"/><button class="primary" id="send" style="margin-top:0">发送</button></div>
    <button class="primary" id="bye">结束对话</button>`;
  openModal(html, async sh => {
    const log = sh.querySelector('#log');
    const render = () => { log.innerHTML = hist.map(h => `<p><span class="${h.who === 'me' ? 'me' : 'who'}">${h.who === 'me' ? '你' : esc(a.name)}：</span>${esc(h.text)}</p>`).join(''); log.scrollTop = 1e6; };
    let busy = false;
    const speak = async msg => {
      if (busy) return; busy = true;
      if (msg) hist.push({ who: 'me', text: msg });
      hist.push({ who: id, text: '……' }); render();
      const ctx = { day: S.day, flags: S.flags, power: S.power, holding: S.holding, evidence: evidenceCount(), summary: ctxSummary() };
      const res = await NPC.reply(id, ctx, hist.slice(0, -1), msg);
      hist[hist.length - 1].text = res.reply; render(); busy = false;
      if (msg) window.applyAction(id, res);
      save();
    };
    sh.querySelector('#bye').onclick = closeModal;
    const send = () => { const i = sh.querySelector('#msg'); const v = i.value.trim(); if (!v) return; i.value = ''; speak(v); };
    sh.querySelector('#send').onclick = send;
    sh.querySelector('#msg').onkeydown = e => { if (e.key === 'Enter') send(); };
    render();
    if (S.greeted[id] !== S.day) { S.greeted[id] = S.day; await speak(null); }
  });
}
