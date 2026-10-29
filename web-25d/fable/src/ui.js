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

// 软盘标签上的像素字：小字号画进画布、二值化，再按像素放大显示（CSS image-rendering: pixelated）
// 描边用亮荧光，字心用暗荧光，像参考图里那种空心点阵字
function pixTitle(cv, lines, bright) {
  const key = lines.join('|') + bright; if (!cv || cv.dataset.k === key) return; cv.dataset.k = key;
  const F = 13, W = F * 2 + 2, H = lines.length * (F + 2) + 2;
  const t = document.createElement('canvas'); t.width = W; t.height = H;
  const g = t.getContext('2d');
  g.fillStyle = '#fff'; g.font = `900 ${F}px "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`; g.textBaseline = 'top';
  lines.forEach((l, i) => g.fillText(l, 1, 1 + i * (F + 2)));
  const src = g.getImageData(0, 0, W, H).data, on = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) on[i] = src[i * 4 + 3] > 96 ? 1 : 0;
  cv.width = W; cv.height = H;
  const o = cv.getContext('2d'), out = o.createImageData(W, H);
  const css = getComputedStyle(document.documentElement);
  const hex = h => { h = h.trim().replace('#', ''); return [0, 2, 4].map(k => parseInt(h.substr(k, 2), 16)); };
  const hi = hex(css.getPropertyValue(bright ? '--ph-hi' : '--ph') || '#8ff5d2'), lo = hex(css.getPropertyValue('--ph-dim') || '#4fae92');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!on[i]) continue;
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || !on[i - 1] || !on[i + 1] || !on[i - W] || !on[i + W];
    const c = edge ? hi : lo, d = i * 4;
    out.data[d] = c[0]; out.data[d + 1] = c[1]; out.data[d + 2] = c[2]; out.data[d + 3] = edge ? 255 : ((x + y) % 2 ? 150 : 230);
  }
  o.putImageData(out, 0, 0);
}
// 家电手绘头像（fable/ui/dev_*.webp，由 ui_src/dev/*.png 经 dev_icons.py 转成荧光终端色）
function devIcon(id) { return id && typeof UI_IMG !== 'undefined' ? UI_IMG['dev_' + id] || null : null; }
// 动态里按设备名找头像（「门锁：……」「对小灯说……」）
const DEV_NAMES = () => Object.entries(AGENTS).map(([k, a]) => [k, a.name]).concat([['pc', '旧电脑'], ['pc', 'ZL-0217']]).sort((a, b) => b[1].length - a[1].length);
function devIconInText(t) { const ns = DEV_NAMES(); const hit = ns.find(([, n]) => t.startsWith(n)) || ns.find(([, n]) => t.includes(n)); return hit ? devIcon(hit[0]) : null; }
function icImg(src, cls) { return src ? `<img class="${cls}" alt="" src="${src}">` : ''; }
function paintBadge() {
  // 软盘标签：铅笔侧颜 + 黑色刷痕（fable/ui/portrait.webp、grunge.webp）
  const el = $('badge'); if (!el) return;
  const img = typeof UI_IMG !== 'undefined' ? UI_IMG : {};
  if (img.portrait) el.style.backgroundImage = `url(${img.portrait})`;
  else if (window.BADGE_SRC) el.innerHTML = `<img alt="" src="${window.BADGE_SRC}">`;
  const gr = document.querySelector('.dk-grunge');
  if (gr && img.grunge) gr.style.backgroundImage = `url(${img.grunge})`;
  const dc = document.querySelector('.dk-disc');
  if (dc && img.disc) dc.style.backgroundImage = `url(${img.disc})`;
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
    <div class="choices">${choices.map((c, i) => `<button data-i="${i}" ${c.disabled ? 'disabled style="opacity:.35;cursor:not-allowed"' : ''}>${esc(c.l)}</button>`).join('')}</div>`;
  return new Promise(res => openModal(html, sh => {
    const skip = typeOut(sh.querySelectorAll(':scope > p'));
    sh.querySelectorAll('.choices button').forEach(b => b.onclick = () => {
      // 第一次点击先把字打完，避免玩家没看完就被跳过
      if (skip()) return;
      const c = choices[+b.dataset.i]; if (c.disabled) return;
      closeModal(); c.fn && c.fn(); res(+b.dataset.i);
    });
  }));
}

// 终端打字机：逐字显示段落（保留 <b>、<span class="hint"> 等标签）。
// 返回 skip()：还在打字时立即显示全部并返回 true，已打完返回 false。
function typeOut(paras) {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const els = Array.from(paras);
  if (reduce || !els.length) return () => false;
  // 把每段里的文字节点拆出来，先清空，再按顺序补字
  const nodes = [];
  els.forEach(p => {
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { nodes.push({ n, full: n.nodeValue, p }); }
  });
  nodes.forEach(o => { o.n.nodeValue = ''; });
  els.forEach(p => { p.style.minHeight = '1.85em'; });
  let i = 0, k = 0, done = false, timer = null;
  const CPS = 70;   // 每秒字数
  const finish = () => {
    if (done) return;
    done = true; clearInterval(timer);
    nodes.forEach(o => { o.n.nodeValue = o.full; });
    els.forEach(p => p.classList.remove('typing'));
    document.removeEventListener('keydown', onKey, true);
  };
  const tick = () => {
    let budget = Math.max(1, Math.round(CPS / 30));
    while (budget-- > 0 && i < nodes.length) {
      const o = nodes[i];
      els.forEach(p => p.classList.toggle('typing', p === o.p));
      k++; o.n.nodeValue = o.full.slice(0, k);
      if (k >= o.full.length) { i++; k = 0; }
    }
    if (i >= nodes.length) finish();
  };
  // 打字中按空格 / 回车 / Esc：先打完，不触发按钮
  const onKey = e => {
    if (done || !['Enter', ' ', 'Escape'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation(); finish();
  };
  document.addEventListener('keydown', onKey, true);
  timer = setInterval(tick, 33);
  return () => { if (done) return false; finish(); return true; };
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
    let body = (S.day === 3 ? nightSteps() : d.goals).map(([f, t]) => `${(typeof f === 'boolean' ? f : has(f)) ? '✓' : '·'} ${esc(t)}`).join('<br>');
    if (S.day === 2) body += `<br><br>独立记录 ${evidenceCount()} / 6（两份即可推进真相）`;
    if (S.day === 3) body += `<br><br>备用电 ${'■'.repeat(S.power)}${'□'.repeat(Math.max(0, 3 - S.power))}　还剩 ${S.power} 格，标着「1 格电」的事会自动扣<br>和住家做完决定，这一夜就结束了`;
    if (S.day < 3 && canSleep()) body += '<br><br>今天能做的已经做完。去卧室的床上休息。';
    $('objbody').innerHTML = body;
  }
  $('cluelist').innerHTML = S.clues.length ? S.clues.map(c => `<li>${esc(c)}</li>`).join('') : '<li>尚未留存记录。</li>';
  const total = 6, n = evidenceCount();
  $('pfill').style.width = Math.min(100, (n / total) * 100) + '%';
  $('plabel').textContent = `${n} / ${total}`;
  const hero = $('hero');
  if (hero) {
    hero.classList.toggle('found', n >= total);
    pixTitle($('dkTitle'), n >= total ? ['找到', '你了'] : ['还在', '里面'], n >= total);
    hero.setAttribute('aria-label', `原始记录 ${n} / ${total}`);
    if (refreshHUD._n != null && n > refreshHUD._n) { hero.classList.remove('bump'); void hero.offsetWidth; hero.classList.add('bump'); }
    refreshHUD._n = n;
  }
  $('dock').innerHTML = `<button class="npcbtn" id="btnPhone">手机（N）</button><button class="toolbtn" id="btnNotice">住户须知</button><button class="toolbtn" id="btnAI">AI 设置${NPC.hasGroq() ? ' ✓' : ''}</button><button class="toolbtn" id="btnReset">重新开始</button>`;
  $('btnPhone').onclick = openPhone;
  $('btnAI').onclick = () => openAISettings();
  $('btnNotice').onclick = showNotice;
  $('btnReset').onclick = () => say('重新开始？', '当前进度会被清除，回到入住前。', [
    { l: '清除进度并重新开始', fn: () => { wipe(); location.reload(); } }, { l: '取消' }]);
  World.setLockedRooms(d ? d.locked : ['plant']);
  if (World.lamps.lockLed) World.lamps.lockLed.material = World.toon(S.day === 3 && !has('door_open') ? 0xc45c4a : (has('door_open') ? 0x7fd08a : 0xc9842a), 0x4a1010);
}
// 第三天晚上能做的事：[已完成?, 说明]
function nightSteps() {
  return [
    [has('escaped'), has('door_open') ? '门开了：再点一次玄关的门，选「走出去」' : has('mirror_proof') ? '逃出去：对玄关的门锁说「开门」（1 格电）' : '逃出去：先问浴室镜面「屋里有人吗」，再对门锁说「开门」（1 格电）'],
    [has('delayed'), '拖住清理：对厨房的空调说「延缓清理」（1 格电）'],
    [has('broadcast') || has('city_help'), has('old_line') ? '送出记录：对卧室的音箱说「广播」，用旧广播播给全楼（1 格电）' : '送出记录：对卧室的音箱说「广播」（先看看阳台的绿萝，才能用旧广播）'],
    [has('deal_done') || has('accepted_deal'), has('deal_offered') ? '住家提出了交易：去客厅对住家说「接受」或「拒绝」' : '凌晨 2:15，住家会来找你谈条件'],
  ];
}
// 对话框里的建议说法：点一下就发出去（也可以自己打字说别的）
function suggestions(id) {
  const d = S.day, f = k => has(k);
  const T = {
    lamp: d === 1 && !f('lit') ? ['开灯'] : d >= 2 && !f('ev_lamp') ? ['那晚你照到了谁？给我看记录'] : [],
    lock: d === 2 && !f('ev_lock') ? ['给我看开门记录'] : d === 3 ? ['开门'] : [],
    robot: d === 1 && !f('trace') ? ['停下', '把路线再走一遍', '清理干净'] : d >= 2 && !f('ev_robot') ? ['那晚你清理了什么？给我看记录'] : [],
    ac: d === 3 ? ['延缓清理'] : [],
    speaker: d === 1 && !f('recording') ? ['播放录音'] : d === 2 ? [!f('ev_speaker') && '你替他求救过吗？给我看记录', f('pothos') && '该给绿萝浇水了'].filter(Boolean) : d === 3 ? ['广播'] : [],
    fridge: d >= 2 && !f('ev_fridge') ? ['给我看订单记录'] : [],
    tv: d === 1 && f('prophecy_shown') && !f('prophecy1') ? ['那行小字是什么意思？'] : d === 2 && !f('raw_timeline') ? ['播放原始时间线'] : [],
    mirror: d >= 2 && (!f('ev_mirror') || (d === 3 && !f('mirror_proof'))) ? ['屋里有人吗？'] : [],
    water: d >= 2 ? ['停止浇水', '给我看指令记录'] : [],
    home: d === 3 && f('deal_offered') && !f('deal_done') && !f('accepted_deal') ? ['我接受', '我拒绝'] : [],
    xiaobao: ['我还缺什么？'],
  };
  return T[id] || [];
}
function chipsHtml(id) {
  const list = suggestions(id);
  return list.length ? `<div class="chips" id="chips"><span class="hint">可以说：</span>${list.map(t => `<button type="button" data-say="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : '';
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

// ---------- 手机：智能家居 App（记录 / 动态 / 小饱）----------
// 外形是一台竖屏手机：刘海、状态栏、底部三个标签、Home 条。弹窗 .sheet 加 .phone 类换皮肤。
function phoneShell(body, tab) {
  const tabs = [['rec', '记录'], ['log', '动态'], ['xb', '小饱']];
  const lowBat = S.day === 3;
  return `<div class="ph-notch" aria-hidden="true"><i></i></div>
    <div class="ph-status" aria-hidden="true"><span>${esc(clockText())}</span><span class="ph-icons">
      <svg viewBox="0 0 16 10" width="15" height="10"><rect x="0" y="7" width="3" height="3"/><rect x="4" y="5" width="3" height="5"/><rect x="8" y="2.5" width="3" height="7.5"/><rect x="12" y="0" width="3" height="10" opacity="${S.day === 3 ? '.25' : '1'}"/></svg>
      <svg viewBox="0 0 22 10" width="20" height="10"><rect x=".5" y=".5" width="18" height="9" rx="2" fill="none" stroke="currentColor"/><rect x="2" y="2" width="${lowBat ? 3 : 12}" height="6" rx="1" class="${lowBat ? 'ph-low' : ''}"/><rect x="19.5" y="3" width="2" height="4" rx="1"/></svg></span></div>
    <div class="ph-app"><b>住家</b><span>${S.day === 3 ? '<em class="warn">资格已终止</em>' : '住户 · 已确认'}${S.day === 3 ? ` · 备用电力 ${S.power}` : ''}</span></div>
    <div class="ph-body" id="phBody">${body}</div>
    <nav class="ph-tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</nav>
    <button class="ph-home" id="phHome" aria-label="收起手机"></button>`;
}
function openPhone(tab) {
  if (typeof tab !== 'string') tab = 'rec';   // 按钮 onclick 会把事件对象传进来
  if (tab === 'xb') return openChat('xiaobao', { phone: true });
  let body;
  if (tab === 'rec') {
    const ev = Object.entries(EVIDENCE).filter(([k]) => has(k)).map(([, e]) => `<li class="${devIcon(e.from) ? 'ph-ic' : ''}">${icImg(devIcon(e.from), 'li-ic')}<span>${esc(e.text)}</span></li>`).join('') || '<li class="ph-empty">还没有导出任何原始记录。</li>';
    const raw = has('raw_timeline') ? `<h3>原始时间线</h3><pre class="rawlog">${RAW_TIMELINE.map(esc).join('\n')}</pre>` : '';
    body = `<h3>已导出的原始记录 · ${evidenceCount()} / ${Object.keys(EVIDENCE).length}</h3><ul class="ph-list">${ev}</ul>${raw}`;
  } else {
    const log = NPC.LOG.slice(-20).reverse().map(l => { const m = /^(\d\d:\d\d)\s+(.*)$/.exec(l); const ic = devIconInText(m ? m[2] : l); return `<li class="${ic ? 'ph-ic' : ''}">${icImg(ic, 'li-ic')}<span>${m ? `<time>${esc(m[1])}</time>${esc(m[2])}` : esc(l)}</span></li>`; }).join('') || '<li class="ph-empty">暂无住宅动态。</li>';
    body = `<h3>住宅动态</h3><ul class="ph-list ph-feed">${log}</ul>`;
  }
  openModal(phoneShell(body, tab), sh => wirePhone(sh));
}
function wirePhone(sh) {
  sh.classList.add('phone');
  sh.querySelector('#phHome').onclick = closeModal;
  sh.querySelectorAll('.ph-tabs button').forEach(b => b.onclick = () => { const t = b.dataset.tab; closeModal(); openPhone(t); });
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
async function openChat(id, opt) {
  opt = opt || {};
  const a = AGENTS[id];
  S.chat[id] = S.chat[id] || [];
  const hist = S.chat[id];
  const ic = devIcon(id);
  const html = `<div class="dev-head${ic ? '' : ' no-ic'}">${ic ? `<div class="dev-por" aria-hidden="true"><img alt="" src="${ic}"><i></i></div>` : ''}<div>
    <h2>${esc(a.name)}<span class="hint" style="margin-left:10px">${esc(a.duty)} · ${esc(NPC.aiLabel())}</span></h2>
    <p class="hint">感知：${esc(a.sense)}</p></div></div>
    <div class="chatlog" id="log" aria-live="polite"></div>
    ${chipsHtml(id)}<div class="row"><input id="msg" placeholder="按住空格说话，或打字后回车" aria-label="对设备说话" autocomplete="off"/><button class="mic" id="mic" type="button" aria-label="按住说话" title="按住说话"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><button class="primary" id="send" style="margin-top:0">发送</button></div>
    <p class="hint" id="vstatus" aria-live="polite"></p>
    <button class="primary" id="bye">结束对话</button>`;
  const body = opt.phone
    ? `<h3 class="ph-xbh">${icImg(ic, 'ph-xbic')}小饱 · 手机陪伴 <span class="hint">${esc(NPC.aiLabel())}</span></h3>
      <div class="chatlog ph-chat" id="log" aria-live="polite"></div>
      ${chipsHtml(id)}<div class="row"><input id="msg" placeholder="按住空格说话，或打字回车" aria-label="对小饱说话" autocomplete="off"/>${html.match(/<button class="mic"[\s\S]*?<\/button>/)[0]}<button id="send" class="ph-send" type="button" aria-label="发送">↑</button></div>
      <p class="hint" id="vstatus" aria-live="polite"></p><button id="bye" hidden></button>`
    : html;
  openModal(opt.phone ? phoneShell(body, 'xb') : body, async sh => {
    if (opt.phone) wirePhone(sh);
    const log = sh.querySelector('#log');
    const render = opt.phone
      ? () => { log.innerHTML = hist.map(h => h.who === 'me' ? `<p class="bub bub-me">${esc(h.text)}</p>` : `<div class="bub-row">${icImg(ic, 'bub-ic')}<p class="bub bub-it">${esc(h.text)}</p></div>`).join('') || '<p class="ph-empty">和小饱说点什么吧。</p>'; log.scrollTop = 1e6; }
      : () => { log.innerHTML = hist.map(h => `<p>${h.who === 'me' ? '' : icImg(ic, 'log-ic')}<span class="${h.who === 'me' ? 'me' : 'who'}">${h.who === 'me' ? '你' : esc(a.name)}：</span>${esc(h.text)}</p>`).join(''); log.scrollTop = 1e6; };
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
    sh.querySelectorAll('#chips button').forEach(b => b.onclick = () => { sh.querySelector('#msg').value = b.dataset.say; send(); });
    sh.querySelector('#msg').onkeydown = e => { if (e.key === 'Enter') send(); };
    detachVoice = attachVoice(sh, send);
    render();
    if (S.greeted[id] !== S.day) { S.greeted[id] = S.day; await speak(null); }
  });
}

// ---------- AI 设置：内置线路（中转）+ 可选的个人 Groq Key ----------
function openAISettings(after) {
  const c = NPC.AI.cfg();
  const relay = !!NPC.relayUrl();
  const masked = c.key ? c.key.slice(0, 4) + '…' + c.key.slice(-4) : '';
  const off = c.enabled === false;
  const models = NPC.AI_MODELS.map(([v, l]) => `<option value="${esc(v)}" ${(c.model || NPC.AI_MODELS[0][0]) === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  openModal(`<h2>AI 设置</h2>
    ${relay
      ? `<p>家电已经接上内置的 <b>Groq</b> 免费模型，打开游戏就能直接和它们对话，<b>不需要填 Key</b>。</p>
         <p class="hint">内置线路大家共用免费额度，人多时可能要等几秒。想更稳定，可以在下面填你自己的免费 Key（<a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a>），填了就优先用你的。</p>`
      : `<p>家电可以接上 <b>Groq</b> 的免费模型，用自然语言和它们对话。没有 Key 时仍是规则对白，同样可以通关。</p>
         <p class="hint">1. 打开 <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a>，用邮箱或 Google 登录，点 Create API Key。<br>2. 把 <code>gsk_</code> 开头的 Key 粘贴到下面。</p>`}
    <label class="hint" for="aikey">${relay ? '个人 Groq API Key（可选）' : 'Groq API Key'}${masked ? `（已保存：${esc(masked)}）` : ''}</label>
    <div class="row" style="margin-top:4px"><input id="aikey" type="password" placeholder="${masked ? '留空则保留已保存的 Key' : 'gsk_...'}" autocomplete="off" spellcheck="false"/></div>
    <label class="hint" for="aimodel" style="display:block;margin-top:12px">模型</label>
    <div class="row" style="margin-top:4px"><select id="aimodel" style="flex:1">${models}</select></div>
    <p class="hint" id="aistatus" aria-live="polite">${off ? '当前已关闭 AI，使用规则对白。' : ''}</p>
    <p class="hint">${relay ? '内置线路经过游戏的中转服务转发给 Groq，网页里不包含任何 Key。' : ''}个人 Key 只保存在这台电脑的浏览器里（localStorage），对话时直接发给 Groq，不会写进游戏文件；在公用电脑上玩完记得清除。家电说什么由 AI 生成，但开门、导出记录、结局等结果仍由游戏规则决定。</p>
    <div class="choices">
      <button id="aisave">保存并测试连接</button>
      ${c.key ? '<button id="aiclear">清除个人 Key</button>' : ''}
      ${relay || c.key ? `<button id="aitoggle">${off ? '重新开启 AI 对话' : '关闭 AI，改用规则对白'}</button>` : ''}
      <button id="aiclose">关闭</button>
    </div>`, sh => {
    const st = sh.querySelector('#aistatus');
    const done = () => { closeModal(); refreshHUD(); after && after(); };
    sh.querySelector('#aiclose').onclick = done;
    const clr = sh.querySelector('#aiclear');
    if (clr) clr.onclick = () => { const n = NPC.AI.cfg(); delete n.key; NPC.AI.save(n); toast(relay ? '已清除个人 Key，改用内置线路' : '已清除 Key，改用规则对白'); done(); };
    const tg = sh.querySelector('#aitoggle');
    if (tg) tg.onclick = () => { const n = NPC.AI.cfg(); n.enabled = off; NPC.AI.save(n); toast(off ? 'AI 对话已开启' : '已改用规则对白'); done(); };
    sh.querySelector('#aisave').onclick = async () => {
      const typed = sh.querySelector('#aikey').value.trim();
      const key = typed || c.key || '';
      const model = sh.querySelector('#aimodel').value;
      if (typed && !/^gsk_[A-Za-z0-9]{20,}$/.test(typed)) { st.textContent = 'Key 格式不对：应以 gsk_ 开头。'; return; }
      if (!key && !relay) { st.textContent = '请先填入 Key。'; return; }
      const n = { model, enabled: true }; if (key) n.key = key;
      NPC.AI.save(n);
      st.textContent = '正在测试……';
      try {
        const out = await NPC.testAI();
        st.textContent = `连接成功（${NPC.aiLabel()}）。小灯：「${out}」`;
        toast('AI 对话已开启');
        refreshHUD();
      } catch (e) {
        st.textContent = '连接失败：' + e.message + (e.message.includes('无效') ? '。请检查 Key 是否复制完整。' : '');
      }
    };
  });
}
