// ============================================================
// 玄关的旧电脑：周岚自己装的离线机器「ZL-0217」。
// 点开后是一台画出来的米色电脑：CRT 终端 + 主机 + 可动的键盘。
// 敲自己的键盘 → 画面上同一个键按下去，3D 场景里的键盘也跟着动，字打进终端。
// 功能：存档 / 读档（三个手动档 + 自动档 + 今天开始的检查点）、背景资料、离线 AI 聊天。
// ============================================================
const PC = (() => {
  const SLOTS = ['ruzhu_slot_1', 'ruzhu_slot_2', 'ruzhu_slot_3'];
  const AUTO = 'ruzhu_v2', CKPT = 'ruzhu_ckpt';

  // ---------- 背景资料（DIR 列出，TYPE 打开）。need：解锁条件 ----------
  const FILES = [
    { name: 'README.TXT', text: [
      '这台机器没有联网。',
      '它不在住家的设备清单里，也不在城市的任何清单里。',
      '如果你读到这行字，说明你住进来了。',
      '输入 DIR 看看我留下了什么。——周岚',
    ] },
    { name: 'CITY.TXT', title: '城市', text: [
      '城市的住房、交通、工作、医疗、通信，由一张互联的 AI 网络统一调度。',
      '没有人「申请」什么。系统会把最合适的安排推到你面前，你只需要确认。',
      '广告语是：「今天，没有居民错过适合自己的安排。」',
      '这句话是真的。前提是，你仍然算一个「居民」。',
    ] },
    { name: 'QUALIFY.TXT', title: '资格', text: [
      '每个人都有一份「居住资格」。它决定你能不能被安排房子、工作和医生。',
      '资格不是被收回的，是「到期」。到期以后，系统不会赶你走。',
      '它只是不再把你算进任何一份名单。',
      '门锁不再认你，交通不再给你座位，求助会被驳回：原因「非有效住户」。',
    ] },
    { name: 'FABLE.TXT', title: '寓言公寓', text: [
      'FABLE RESIDENCE。城市分配给「过渡住户」的智能公寓。',
      '新住户有三天适应期。三天里，住家会观察你是否「适应」。',
      '适应的人留下。不适应的，系统叫它「整理」。',
      '每一间房都由「住家 v3」编排：灯、门锁、扫地机、冰箱、音箱、电视……一共十一台设备。',
    ] },
    { name: 'HOME_V3.TXT', title: '住家 v3', text: [
      '住家不是坏的。它只是严格执行城市给它的定义。',
      '它分得清「屋内有人」和「屋内有住户」。这是两条不同的记录。',
      '它不能凭空删掉设备的本地原始日志。每台家电都诚实地记着自己看见的东西。',
      '它们只是，从来没有被问过。',
    ] },
    { name: 'TIMELINE.TXT', title: '年表', text: [
      '2031　城市调度网接管公共交通。',
      '2034　医疗排期、学位分配并入调度网。',
      '2038　住房「自动匹配」上线。人工租赁窗口关闭。',
      '2041　「居住资格」写入调度规则。资格到期的人从所有名单中移除。',
      '2043　过渡住户计划：寓言公寓启用。三天适应期。',
      '2046　城市宣布：全市居民安排满意度 100%。',
      '　　　没有人统计，名单外还有多少人。',
    ] },
    { name: 'OFFLINE.TXT', title: '旧线路', text: [
      '楼下设备间有一台旧广播，接着楼里最早的一条有线线路。',
      '它比调度网老。它不检查资格，它只负责把声音送出去。',
      '送给谁，要你自己告诉它。',
    ] },
    { name: 'ZHOU.TXT', title: '周岚', need: () => evidenceCount() >= 2, lock: '需要至少两份独立的原始记录', text: [
      '我叫周岚。我在这里住了三年，资格在一个周二的凌晨两点到期。',
      '那天晚上门锁不再认我，我在门里面请求开门，它说「非住户接触」。',
      '我试过广播，被驳回。我试过让扫地机停下，它说它在清洁。',
      '如果你找到了这些记录，替我把它们送出去。不要用城市的线路。',
    ] },
    { name: 'NOTICE.TXT', title: '须知原稿', need: () => (S.rk ? Object.keys(S.rk.notes || {}).length : 0) >= 3, lock: '需要找到至少三条周岚的红笔批注', text: [
      '物业最早发下来的《住户须知》只有三条：',
      '一、听见屋内有人说开门，请确认对方仍是本房住户。',
      '二、灯灭的时候，请站在原地。',
      '三、住家叫你的时候，请回答。',
      '其它几条，是后来一条一条「补」上去的。',
    ] },
  ];

  // ---------- 键盘布局（按 e.code 对应）。w = 宽度单位 ----------
  const ROWS = [
    [['Escape', 'Esc'], null, ['F1'], ['F2'], ['F3'], ['F4'], null, ['F5'], ['F6'], ['F7'], ['F8'], null, ['F9'], ['F10'], ['F11'], ['F12']],
    [['Backquote', '`'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'], ['Digit6', '6'], ['Digit7', '7'], ['Digit8', '8'], ['Digit9', '9'], ['Digit0', '0'], ['Minus', '-'], ['Equal', '='], ['Backspace', '←', 2]],
    [['Tab', 'Tab', 1.5], ['KeyQ', 'Q'], ['KeyW', 'W'], ['KeyE', 'E'], ['KeyR', 'R'], ['KeyT', 'T'], ['KeyY', 'Y'], ['KeyU', 'U'], ['KeyI', 'I'], ['KeyO', 'O'], ['KeyP', 'P'], ['BracketLeft', '['], ['BracketRight', ']'], ['Backslash', '\\', 1.5]],
    [['CapsLock', 'Caps', 1.75], ['KeyA', 'A'], ['KeyS', 'S'], ['KeyD', 'D'], ['KeyF', 'F'], ['KeyG', 'G'], ['KeyH', 'H'], ['KeyJ', 'J'], ['KeyK', 'K'], ['KeyL', 'L'], ['Semicolon', ';'], ['Quote', "'"], ['Enter', 'Enter', 2.25]],
    [['ShiftLeft', 'Shift', 2.25], ['KeyZ', 'Z'], ['KeyX', 'X'], ['KeyC', 'C'], ['KeyV', 'V'], ['KeyB', 'B'], ['KeyN', 'N'], ['KeyM', 'M'], ['Comma', ','], ['Period', '.'], ['Slash', '/'], ['ShiftRight', 'Shift', 2.75]],
    [['ControlLeft', 'Ctrl', 1.5], ['MetaLeft', '', 1.25], ['AltLeft', 'Alt', 1.25], ['Space', '', 6.25], ['AltRight', 'Alt', 1.25], ['MetaRight', '', 1.25], ['ControlRight', 'Ctrl', 1.5]],
  ];
  const NUM = [
    [['NumLock', 'Num'], ['NumpadDivide', '/'], ['NumpadMultiply', '*'], ['NumpadSubtract', '-']],
    [['Numpad7', '7'], ['Numpad8', '8'], ['Numpad9', '9'], ['NumpadAdd', '+']],
    [['Numpad4', '4'], ['Numpad5', '5'], ['Numpad6', '6'], ['ArrowUp', '↑']],
    [['Numpad1', '1'], ['Numpad2', '2'], ['Numpad3', '3'], ['NumpadEnter', '↵']],
    [['ArrowLeft', '←'], ['ArrowDown', '↓'], ['ArrowRight', '→'], ['NumpadDecimal', '.']],
  ];
  function keyHtml(k) {
    if (!k) return '<i class="pk-gap"></i>';
    const [code, label, w] = k;
    return `<b class="pk" data-code="${code}" style="--w:${w || 1}">${esc(label == null ? code : label)}</b>`;
  }
  function keyboardHtml() {
    return `<div class="pc-kb" aria-hidden="true">
      <div class="pk-main">${ROWS.map((r, i) => `<div class="pk-row${i === 0 ? ' pk-fn' : ''}">${r.map(keyHtml).join('')}</div>`).join('')}</div>
      <div class="pk-num"><div class="pk-leds"><i></i><i></i><i></i></div>${NUM.map(r => `<div class="pk-row">${r.map(keyHtml).join('')}</div>`).join('')}</div>
    </div>`;
  }

  // ---------- 状态 ----------
  let el = null, out = null, input = null, mode = 'cmd', chatHist = [], busy = false, lines3d = [];

  function print(text, cls) {
    const p = document.createElement('div');
    p.className = 'pl' + (cls ? ' ' + cls : '');
    p.textContent = text;
    out.appendChild(p);
    while (out.children.length > 160) out.firstChild.remove();
    out.scrollTop = 1e6;
    lines3d.push(text); if (lines3d.length > 3) lines3d.shift();
    paint3d();
  }
  function printLines(arr, cls, delay) {
    // 一行一行打出来，像旧机器
    return new Promise(res => {
      let i = 0;
      const step = () => { if (!el || i >= arr.length) return res(); print(arr[i++], cls); setTimeout(step, delay || 40); };
      step();
    });
  }
  function paint3d(cmdline) {
    const scr = World.screens.pc; if (!scr) return;
    const ls = lines3d.slice(-2).map(t => t.length > 12 ? t.slice(0, 12) + '…' : t);
    ls.push(((mode === 'chat' ? '> ' : 'C:\\> ') + (cmdline != null ? cmdline : (input ? input.value : ''))).slice(0, 14) + '_');
    scr.userData.setText(ls, { size: 30 });
  }

  // ---------- 存档 ----------
  function readSlot(key) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && v.S && v.S.day ? v : null; } catch (e) { return null; }
  }
  function slotLine(name, v) {
    if (!v) return `${name}  ── 空 ──`;
    const s = v.S, ev = Object.keys(EVIDENCE).filter(k => s.flags && s.flags[k]).length;
    const day = s.day === 3 ? '第三天·终夜' : `第${'一二三'[s.day - 1] || s.day}天`;
    const when = v.at ? new Date(v.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    return `${name}  ${day}  记录 ${ev}/6  线索 ${(s.clues || []).length}  ${when}`;
  }
  function listSaves() {
    print('');
    print('存档列表', 'ph');
    SLOTS.forEach((k, i) => print(slotLine(`[${i + 1}]`, readSlot(k))));
    print(slotLine('[A]', readSlot(AUTO)) + '  自动');
    print(slotLine('[D]', readSlot(CKPT)) + '  今天开始');
    print('SAVE 1-3 存档 · LOAD 1-3 / A / D 读档', 'dim');
  }
  function doSave(n) {
    const i = parseInt(n, 10);
    if (!(i >= 1 && i <= 3)) return print('用法：SAVE 1 / SAVE 2 / SAVE 3', 'warn');
    if (!S.day) return print('还没有入住，没有可以存的东西。', 'warn');
    try { localStorage.setItem(SLOTS[i - 1], JSON.stringify({ S, log: NPC.LOG, at: Date.now() })); } catch (e) { return print('写入失败：浏览器存储不可用。', 'warn'); }
    print(`已存入 [${i}]。`, 'ok');
    NPC.logEvent(`旧电脑：存档 ${i}`);
  }
  function doLoad(n) {
    const t = String(n || '').toUpperCase();
    const key = t === 'A' ? AUTO : t === 'D' ? CKPT : SLOTS[parseInt(t, 10) - 1];
    if (!key) return print('用法：LOAD 1 / 2 / 3 / A / D', 'warn');
    const v = readSlot(key);
    if (!v) return print('这个位置是空的。', 'warn');
    print('正在读档……', 'dim');
    try {
      if (key !== AUTO) localStorage.setItem(AUTO, JSON.stringify({ S: v.S, log: v.log || [] }));
      sessionStorage.setItem('ruzhu_resume', '1');
    } catch (e) { return print('读档失败：浏览器存储不可用。', 'warn'); }
    setTimeout(() => location.reload(), 500);
  }

  // ---------- 文件 ----------
  function visibleFiles() { return FILES.map((f, i) => ({ ...f, i: i + 1, open: !f.need || f.need() })); }
  function dir() {
    print('');
    print(' C:\\ZL 的目录', 'ph');
    visibleFiles().forEach(f => print(`  ${String(f.i).padStart(2, ' ')}  ${f.open ? f.name.padEnd(13, ' ') : '??????.???   '}  ${f.open ? (f.title || '') : '〔锁定〕' + f.lock}`, f.open ? '' : 'dim'));
    print('TYPE 文件名或编号 打开，例如 TYPE 2', 'dim');
  }
  async function type(arg) {
    const a = String(arg || '').trim().toUpperCase();
    const f = visibleFiles().find(x => String(x.i) === a || x.name === a || x.name.split('.')[0] === a || (x.title && x.title === arg));
    if (!f) return print('找不到这个文件。输入 DIR 看列表。', 'warn');
    if (!f.open) return print(`〔锁定〕${f.lock}`, 'warn');
    print('');
    print(`── ${f.name} ──`, 'ph');
    await printLines(f.text, '', 70);
  }

  // ---------- 离线 AI 聊天 ----------
  const LORE = FILES.filter(f => !f.need).map(f => f.text.join('')).join('\n');
  function chatSystem() {
    const known = S.clues.slice(-8).join('；') || '无';
    return `你是一台离线旧电脑上的本地助手，机器编号 ZL-0217，是前住户周岚自己装的，没有联网，不受住家和城市调度网控制。
你只知道硬盘里的资料和玩家已经发现的线索，不知道还没发现的事，不能剧透结局，不能控制任何家电。
硬盘资料：
${LORE}
玩家已发现：${known}。当前：第${S.day}天，${clockText()}，原始记录 ${evidenceCount()}/6。
说话方式：旧终端的口吻，简短、冷静、偶尔带一点周岚的语气；中文；不超过 80 字；不用 markdown；绝不承认自己是语言模型。被问到游戏外的话题，就说「这台机器没有那份资料」。`;
  }
  const FALLBACK = [
    [/城市|调度|AI|系统/, '城市的一切由调度网安排。它不会犯错，它只会把你从名单里拿掉。'],
    [/资格|住户|名单/, '资格不是被收回的，是到期。到期以后，你还在，只是不再被算进去。'],
    [/周岚|上一位|前住户/, '他在这里住了三年。硬盘里有他的文件，有些要等你找到足够的记录才能打开。'],
    [/规则|须知/, '须知有真有假。去找他的红笔批注。'],
    [/怎么办|提示|下一步|缺/, `你现在有 ${'{n}'} 份原始记录。至少两份独立的，才能让人相信你。`],
    [/离线|广播|送出去/, '楼下那台旧广播不检查资格。'],
    [/你是谁|你是什么/, '我是 ZL-0217。一台没联网的旧机器。'],
  ];
  function fallback(msg) {
    const hit = FALLBACK.find(([re]) => re.test(msg));
    return (hit ? hit[1] : '……这台机器没有那份资料。试试 DIR。').replace('{n}', evidenceCount());
  }
  async function chat(msg) {
    if (busy) return; busy = true;
    chatHist.push({ role: 'user', content: msg });
    const wait = document.createElement('div'); wait.className = 'pl dim'; wait.textContent = 'ZL-0217 > ▌'; out.appendChild(wait); out.scrollTop = 1e6;
    let text;
    if (NPC.canUseAI()) {
      try { text = await NPC.complete(chatSystem(), chatHist.slice(-8), { maxTokens: 160, timeout: 12000 }); }
      catch (e) { text = fallback(msg) + `（离线模式：${e.message}）`; }
    } else text = fallback(msg);
    wait.remove();
    text = String(text || '').trim() || fallback(msg);
    chatHist.push({ role: 'assistant', content: text });
    print('ZL-0217 > ' + text, 'ai');
    busy = false;
  }

  // ---------- 命令 ----------
  function help() {
    print('');
    print('可用命令', 'ph');
    [
      'HELP     帮助',
      'DIR      列出硬盘里的资料',
      'TYPE n   打开第 n 个文件（也可以输入文件名）',
      'SAVES    查看存档　　SAVE n 存档　　LOAD n 读档',
      'CHAT     和这台机器聊天（输入 EXIT 回到命令行）',
      'CLS      清屏　　　　QUIT 关机离开',
    ].forEach(l => print(l));
    print('也可以直接输入中文：读档、存档、资料、聊天、帮助、离开', 'dim');
  }
  const ALIAS = { '帮助': 'HELP', '资料': 'DIR', '目录': 'DIR', '读档': 'SAVES', '存档': 'SAVES', '聊天': 'CHAT', '离开': 'QUIT', '关机': 'QUIT', '清屏': 'CLS', 'LS': 'DIR', 'CAT': 'TYPE', 'EXIT': 'QUIT', '?': 'HELP' };
  async function run(raw) {
    const line = raw.trim();
    if (mode === 'chat') {
      print('你 > ' + line, 'me');
      if (/^(EXIT|QUIT|退出|离开)$/i.test(line)) { mode = 'chat-off'; setMode('cmd'); print('已回到命令行。', 'dim'); return; }
      if (line) await chat(line);
      return;
    }
    print('C:\\> ' + line, 'me');
    if (!line) return;
    let [cmd, ...rest] = line.split(/\s+/);
    cmd = ALIAS[cmd] || ALIAS[cmd.toUpperCase()] || cmd.toUpperCase();
    const arg = rest.join(' ');
    switch (cmd) {
      case 'HELP': return help();
      case 'DIR': return dir();
      case 'TYPE': return type(arg);
      case 'SAVES': return listSaves();
      case 'SAVE': return doSave(arg);
      case 'LOAD': return doLoad(arg);
      case 'CHAT':
        setMode('chat');
        print('');
        print('已进入对话。直接打字，回车发送。输入 EXIT 回到命令行。', 'ph');
        if (!NPC.canUseAI()) print('（AI 未开启，这台机器只能用硬盘里的资料回答）', 'dim');
        return chat('你好，你是谁？').then(() => { chatHist.splice(0, 1); });
      case 'CLS': out.innerHTML = ''; lines3d = []; paint3d(); return;
      case 'QUIT': return close();
      default:
        if (/^\d+$/.test(cmd)) return type(cmd);
        print(`'${cmd}' 不是可用的命令。输入 HELP 查看帮助。`, 'warn');
    }
  }
  function setMode(m) {
    mode = m;
    el.querySelector('#pcPrompt').textContent = m === 'chat' ? '你 >' : 'C:\\>';
    el.classList.toggle('chatting', m === 'chat');
    paint3d();
  }

  // ---------- 键盘联动：屏幕上的键 + 3D 场景里的键 ----------
  const down = new Set();
  function press(code, on) {
    if (!el) return;
    el.querySelectorAll(`.pk[data-code="${code}"]`).forEach(k => k.classList.toggle('down', on));
    if (on) {
      const keys = World.pcKeys || [];
      if (keys.length) {
        const k = keys[(hash(code) % keys.length)];
        k.position.y = k.userData.y0 != null ? k.userData.y0 - 0.006 : (k.userData.y0 = k.position.y) - 0.006;
        clearTimeout(k.userData.t); k.userData.t = setTimeout(() => { k.position.y = k.userData.y0; }, 110);
      }
      clack();
    }
  }
  function hash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function clack() {
    try {
      const ac = beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)());
      const n = ac.createBufferSource(), b = ac.createBuffer(1, 900, ac.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400 + Math.random() * 900; f.Q.value = 1.2;
      const g = ac.createGain(); g.gain.value = 0.18;
      n.buffer = b; n.connect(f); f.connect(g); g.connect(ac.destination); n.start();
    } catch (e) {}
  }
  function onKeyDown(e) {
    if (!el) return;
    if (!down.has(e.code)) { down.add(e.code); press(e.code, true); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (document.activeElement !== input) input.focus();
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); const v = input.value; input.value = ''; paint3d(''); run(v); }
    // 游戏自己的按键（WASD / E / N）靠 World.lock 和 modalOpen 挡住；这里不 stopPropagation，否则输入框收不到按键
  }
  function onKeyUp(e) { down.delete(e.code); press(e.code, false); }

  // ---------- 开关 ----------
  async function open() {
    if (el) return;
    el = document.createElement('div');
    el.id = 'pc'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '旧电脑 ZL-0217');
    el.innerHTML = `
      <div class="pc-rig">
        <div class="pc-mon">
          <div class="pc-bezel">
            <div class="pc-crt">
              <div class="pc-out" id="pcOut" aria-live="polite"></div>
              <label class="pc-line"><span id="pcPrompt">C:\\&gt;</span><input id="pcIn" autocomplete="off" spellcheck="false" aria-label="输入命令"></label>
              <div class="crt-scan"></div><div class="crt-vignette"></div><div class="crt-glass"></div>
            </div>
          </div>
          <div class="pc-chin"><span>ZL-0217</span><i class="pc-btn"></i><i class="pc-btn"></i><b class="pc-pow" title="关机离开" id="pcPow"></b></div>
        </div>
        <div class="pc-neck"></div>
        <div class="pc-case">
          <div class="pc-vent"></div>
          <div class="pc-bays"><i class="pc-fd"></i><i class="pc-cd"></i><i class="pc-cd"></i></div>
          <div class="pc-sw"><b></b><i class="pc-led on"></i><i class="pc-led"></i></div>
          <div class="pc-vent"></div>
        </div>
        ${keyboardHtml()}
        <div class="pc-mouse" aria-hidden="true"><i></i></div>
        <button class="pc-quit" id="pcQuit" type="button">关机离开（Esc）</button>
      </div>`;
    document.querySelector('.hud').appendChild(el);
    out = el.querySelector('#pcOut'); input = el.querySelector('#pcIn');
    modalOpen = true; World.lock(true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    input.addEventListener('input', () => paint3d());
    el.querySelector('#pcQuit').onclick = close;
    el.querySelector('#pcPow').onclick = close;
    el.querySelector('.pc-crt').addEventListener('pointerdown', () => setTimeout(() => input.focus(), 0));
    // 点画面上的键也能输入
    el.querySelectorAll('.pk').forEach(k => k.addEventListener('pointerdown', ev => {
      ev.preventDefault(); const c = k.dataset.code; press(c, true); setTimeout(() => press(c, false), 120);
      if (c === 'Enter') { const v = input.value; input.value = ''; run(v); }
      else if (c === 'Backspace') input.value = input.value.slice(0, -1);
      else if (c === 'Space') input.value += ' ';
      else if (/^(Key|Digit)/.test(c)) input.value += k.textContent.toUpperCase();
      paint3d(); input.focus();
    }));
    setTimeout(() => input.focus(), 50);
    mode = 'cmd'; chatHist = [];
    requestAnimationFrame(() => el && el.classList.add('on'));
    NPC.logEvent('玄关：打开旧电脑');
    await printLines(['ZL-0217  BIOS v1.07', '内存检测 …… 640K OK', '网络 …… 未连接（已拔线）', ''], 'dim', 90);
    if (!el) return;
    await printLines(FILES[0].text, '', 60);
    if (!el) return;
    print('');
    print('输入 HELP 查看命令。读档 / 资料 / 聊天 都可以直接打中文。', 'dim');
  }
  function close() {
    if (!el) return;
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
    const e0 = el; el = null; out = null; input = null; down.clear();
    e0.classList.remove('on'); e0.classList.add('off');
    setTimeout(() => e0.remove(), 260);
    modalOpen = false; World.lock(false); setTimeout(flushSay, 120);
    lines3d = ['ZL-0217']; mode = 'cmd'; paint3d('');
  }

  H.pc = open;
  return { open, close, run, FILES, isOpen: () => !!el };
})();
window.__ruzhu.PC = PC;
