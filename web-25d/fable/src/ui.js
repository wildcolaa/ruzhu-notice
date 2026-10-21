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
function closeModal() {
  if (detachVoice) { detachVoice(); detachVoice = null; }
  $('modal').classList.remove('show'); $('modal').innerHTML = ''; modalOpen = false; World.lock(false); setTimeout(flushSay, 120);
}
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
  $('dock').innerHTML = `<button class="npcbtn" id="btnPhone">手机（N）</button><button class="toolbtn" id="btnNotice">住户须知</button><button class="toolbtn" id="btnAI">AI 设置${NPC.hasGroq() ? ' ✓' : ''}</button><button class="toolbtn" id="btnReset">重新开始</button>`;
  $('btnPhone').onclick = openPhone;
  $('btnAI').onclick = () => openAISettings();
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

// ---------- 语音输入：按住空格说话，松开发送 ----------
const Voice = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, active = false, text = '', onDone = null, onStatus = null;
  function supported() { return !!SR; }
  function start(statusCb, doneCb) {
    if (!SR) { statusCb && statusCb('这个浏览器不支持语音识别，请用 Chrome 或 Edge，或直接打字。'); return false; }
    if (active) return true;
    onStatus = statusCb; onDone = doneCb; text = '';
    rec = new SR();
    rec.lang = 'zh-CN'; rec.interimResults = true; rec.continuous = true;
    rec.onresult = e => {
      let s = '';
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      text = s; onStatus && onStatus('正在听：' + s, s);
    };
    rec.onerror = e => {
      const msg = e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? '麦克风权限被拒绝。允许浏览器使用麦克风后，再按住空格。'
        : e.error === 'no-speech' ? '没有听到声音。' : '语音识别出错：' + e.error;
      onStatus && onStatus(msg); active = false;
    };
    rec.onend = () => { if (active) { active = false; const t = text.trim(); onDone && onDone(t); } };
    try { rec.start(); active = true; onStatus && onStatus('正在听……松开空格发送'); return true; }
    catch (e) { onStatus && onStatus('无法启动麦克风。'); return false; }
  }
  function stop() { if (rec && active) { try { rec.stop(); } catch (e) {} } }
  function cancel() { if (rec) { active = false; try { rec.abort(); } catch (e) {} } }
  return { supported, start, stop, cancel, isActive: () => active };
})();
// 切出浏览器时取消录音
window.addEventListener('blur', () => Voice.cancel());
document.addEventListener('visibilitychange', () => { if (document.hidden) Voice.cancel(); });

// 给一个对话窗口挂上「按住空格说话」
function attachVoice(sh, send) {
  const input = sh.querySelector('#msg');
  const status = sh.querySelector('#vstatus');
  const mic = sh.querySelector('#mic');
  let holding = false;
  const setStatus = (msg, live) => {
    status.textContent = msg || '';
    if (live != null) input.value = live;
  };
  const begin = () => {
    if (holding) return; holding = true;
    mic.classList.add('rec');
    Voice.start(setStatus, t => {
      mic.classList.remove('rec');
      if (t) { input.value = t; send(); setStatus(''); }
      else if (!status.textContent.startsWith('麦克风') && !status.textContent.startsWith('这个')) setStatus('没有识别到内容。');
    });
  };
  const end = () => { if (!holding) return; holding = false; Voice.stop(); };
  const onDown = e => {
    // 空格开始录音；Shift+空格仍然输入普通空格
    // 中文输入法用空格选字：组字过程中不拦截
    if (e.isComposing || e.keyCode === 229) return;
    if (e.code !== 'Space' || e.shiftKey || e.repeat) { if (e.code === 'Space' && e.repeat && holding) e.preventDefault(); return; }
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    e.preventDefault(); begin();
  };
  const onUp = e => { if (e.code === 'Space' && holding) { e.preventDefault(); end(); } };
  document.addEventListener('keydown', onDown, true);
  document.addEventListener('keyup', onUp, true);
  mic.addEventListener('pointerdown', e => { e.preventDefault(); begin(); });
  mic.addEventListener('pointerup', end);
  mic.addEventListener('pointerleave', end);
  if (!Voice.supported()) setStatus('提示：此浏览器不支持语音识别，可以直接打字。');
  // 对话关闭时卸载
  return () => { Voice.cancel(); document.removeEventListener('keydown', onDown, true); document.removeEventListener('keyup', onUp, true); };
}
let detachVoice = null;

// ---------- 设备对话：统一输入框 ----------
function ctxSummary() {
  return `第${S.day}天，${clockText()}。已发现：${S.clues.slice(-6).join('；') || '无'}。独立记录 ${evidenceCount()} 份。`;
}
async function openChat(id) {
  const a = AGENTS[id];
  S.chat[id] = S.chat[id] || [];
  const hist = S.chat[id];
  const html = `<h2>${esc(a.name)}<span class="hint" style="margin-left:10px">${esc(a.duty)} · ${esc(NPC.aiLabel())}</span></h2>
    <p class="hint">感知：${esc(a.sense)}</p>
    <div class="chatlog" id="log" aria-live="polite"></div>
    <div class="row"><input id="msg" placeholder="按住空格说话，或打字后回车" aria-label="对设备说话" autocomplete="off"/><button class="mic" id="mic" type="button" aria-label="按住说话" title="按住说话"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><button class="primary" id="send" style="margin-top:0">发送</button></div>
    <p class="hint" id="vstatus" aria-live="polite"></p>
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
      const st = sh.querySelector('#vstatus');
      if (res.aiError && st) st.textContent = `AI 暂时不可用（${res.aiError}），这句用的是规则对白。`;
      else if (st && st.textContent.startsWith('AI 暂时')) st.textContent = '';
      if (msg) window.applyAction(id, res);
      save();
    };
    sh.querySelector('#bye').onclick = closeModal;
    const send = () => { const i = sh.querySelector('#msg'); const v = i.value.trim(); if (!v) return; i.value = ''; speak(v); };
    sh.querySelector('#send').onclick = send;
    sh.querySelector('#msg').onkeydown = e => { if (e.key === 'Enter') send(); };
    detachVoice = attachVoice(sh, send);
    render();
    if (S.greeted[id] !== S.day) { S.greeted[id] = S.day; await speak(null); }
  });
}

// ---------- AI 设置：Groq 免费 API Key（只存在本机浏览器）----------
function openAISettings(after) {
  const c = NPC.AI.cfg();
  const masked = c.key ? c.key.slice(0, 4) + '…' + c.key.slice(-4) : '';
  const models = NPC.AI_MODELS.map(([v, l]) => `<option value="${esc(v)}" ${(c.model || NPC.AI_MODELS[0][0]) === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  openModal(`<h2>AI 设置</h2>
    <p>家电可以接上 <b>Groq</b> 的免费模型，用自然语言和它们对话。没有 Key 时仍是规则对白，同样可以通关。</p>
    <p class="hint">1. 打开 <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a>，用邮箱或 Google 登录，点 Create API Key。<br>
    2. 把 <code>gsk_</code> 开头的 Key 粘贴到下面。</p>
    <label class="hint" for="aikey">Groq API Key${masked ? `（已保存：${esc(masked)}）` : ''}</label>
    <div class="row" style="margin-top:4px"><input id="aikey" type="password" placeholder="${masked ? '留空则保留已保存的 Key' : 'gsk_...'}" autocomplete="off" spellcheck="false"/></div>
    <label class="hint" for="aimodel" style="display:block;margin-top:12px">模型</label>
    <div class="row" style="margin-top:4px"><select id="aimodel" style="flex:1;padding:10px;background:#f7f0e0;border:1px solid rgba(42,33,24,.18);font-size:14px">${models}</select></div>
    <p class="hint" id="aistatus" aria-live="polite"></p>
    <p class="hint">Key 只保存在这台电脑的浏览器里（localStorage），对话时直接发给 Groq，不经过其他服务器，也不会写进游戏文件。在公用电脑上玩完记得点「清除 Key」。家电说什么由 AI 生成，但开门、导出记录、结局等结果仍由游戏规则决定。</p>
    <div class="choices">
      <button id="aisave">保存并测试连接</button>
      ${c.key ? '<button id="aiclear">清除 Key，改回规则对白</button>' : ''}
      <button id="aiclose">关闭</button>
    </div>`, sh => {
    const st = sh.querySelector('#aistatus');
    const done = () => { closeModal(); refreshHUD(); after && after(); };
    sh.querySelector('#aiclose').onclick = done;
    const clr = sh.querySelector('#aiclear');
    if (clr) clr.onclick = () => { NPC.AI.clear(); toast('已清除 Key，改用规则对白'); done(); };
    sh.querySelector('#aisave').onclick = async () => {
      const key = sh.querySelector('#aikey').value.trim() || c.key || '';
      const model = sh.querySelector('#aimodel').value;
      if (!/^gsk_[A-Za-z0-9]{20,}$/.test(key)) { st.textContent = 'Key 格式不对：应以 gsk_ 开头。'; return; }
      NPC.AI.save({ key, model, enabled: true });
      st.textContent = '正在测试……';
      try {
        const out = await NPC.testAI();
        st.textContent = `连接成功。小灯：「${out}」`;
        toast('AI 对话已开启');
        refreshHUD();
      } catch (e) {
        st.textContent = '连接失败：' + e.message + (e.message.includes('无效') ? '。请检查 Key 是否复制完整。' : '');
      }
    };
  });
}
