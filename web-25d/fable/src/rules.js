// ============================================================
// 规则怪谈：《住户须知》会更新，有真有假。
// 真规则：违反就记一次「违规」，三次 → 提前整理（回到当天开始重来）。
// 假规则：住家写来骗你的，违反了什么也不会发生（甚至有收获）。
// 周岚把他验证过的结论用红笔写在家具里，找到后会批注在须知上。
// 本模块只包一层现有函数（refreshHUD / showNotice / H.* / applyAction / nextDay / wipe），不改剧情主线。
// ============================================================
const Rules = (() => {
  // day: 从第几天起出现在须知上；truth: 真 / 假；note: 周岚批注的 id
  const BOOK = [
    { id: 'r1', day: 1, truth: true, text: '听见屋内有人说开门，请确认对方仍是本房住户。不要直接开门。', note: 'n1' },
    { id: 'r2', day: 1, truth: false, text: '整理期间请勿妨碍家电清洁。', note: 'n2' },
    { id: 'r3', day: 1, truth: true, text: '灯灭的时候，请站在原地数到十。不要走动，不要回应黑暗里的声音。', note: 'n3' },
    { id: 'r4', day: 1, truth: true, text: '住家叫你的时候，请回答「我在」。不要说出你的名字。', note: 'n4' },
    { id: 'r5', day: 2, truth: false, text: '浴室镜面显示的人数不是 1 时，请立刻离开浴室，不要和镜面说话。', note: 'n5' },
    { id: 'r6', day: 3, truth: false, text: '02:00 以后，请相信住家。住家不会伤害住户。', note: 'n6' },
  ];
  // 周岚的红笔批注：藏在哪、写了什么
  const NOTES = {
    n1: { at: 'dock', day: 1, text: '开门的声音是我录的。它们不认我。别开门，问它是谁。' },
    n2: { at: 'shoes', day: 1, text: '假的。它扫掉的是我。让它停下。' },
    n3: { at: 'sofa', day: 1, text: '真的。灯灭的时候它在找会动的东西。我数到十，它就走了。' },
    n4: { at: 'tools', day: 2, text: '真的。可它叫「周岚」的时候，千万别答应。答应了，你就是我了。' },
    n5: { at: 'locker', day: 2, text: '假的。镜子不会说谎。数到 2 的时候，另一个是我。' },
    n6: { at: 'pothos', day: 2, text: '假的。02:00 以后你就不是住户了。它说的「住户」里没有你。' },
  };
  const NOTE_FIND = {
    dock: '充电座底下贴着一张对折的便签，红色圆珠笔：',
    shoes: '旧皮鞋里塞着一张纸，字迹被鞋油蹭花了：',
    sofa: '你摸进坐垫的凹陷，指尖碰到一张卷起来的纸条：',
    tools: '你用力掰开卡住的柜门。撬棍下面压着一页撕下来的须知，第四条旁边写满了红字：',
    locker: '笔记本的封底内侧，另有一行红字：',
    pothos: '那张纸的背面还有一行，写得很用力：',
  };
  const MAX = 3;

  function st() {
    if (!S.rk) S.rk = { strikes: 0, notes: {}, done: {}, seenDay: 0, broke: {} };
    return S.rk;
  }
  const visible = () => BOOK.filter(r => r.day <= Math.max(1, S.day));
  const noted = r => !!st().notes[r.note];

  // ---------- 检查点：每天开始时存一份，提前整理后回到这里 ----------
  const CKPT = 'ruzhu_ckpt';
  function saveCkpt() { try { localStorage.setItem(CKPT, JSON.stringify({ S, log: NPC.LOG })); } catch (e) {} }
  function loadCkpt() { try { return JSON.parse(localStorage.getItem(CKPT) || 'null'); } catch (e) { return null; } }

  // ---------- 声音 ----------
  function ac() { try { return beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)()); } catch (e) { return null; } }
  function drone(sec, freq) {
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq || 48; o2.type = 'sine'; o2.frequency.value = (freq || 48) * 1.51;
    g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.05, a.currentTime + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + sec);
    o.connect(g); o2.connect(g); g.connect(a.destination); o.start(); o2.start(); o.stop(a.currentTime + sec + 0.1); o2.stop(a.currentTime + sec + 0.1);
  }
  function knock(n) {
    const a = ac(); if (!a) return;
    let t = a.currentTime + 0.05;
    for (let i = 0; i < n; i++) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.2); t += 0.42;
    }
  }

  // ---------- 画面效果 ----------
  function fx(cls, ms) {
    const app = $('app'); app.classList.remove(cls); void app.offsetWidth; app.classList.add(cls);
    setTimeout(() => app.classList.remove(cls), ms || 700);
  }
  function stamp(text) {
    const d = document.createElement('div'); d.className = 'rk-stamp'; d.textContent = text;
    document.querySelector('.hud').appendChild(d); setTimeout(() => d.remove(), 2600);
  }

  // ---------- 违规 ----------
  // 违反真规则：记一次；违反假规则：什么也不发生（住家仍然假装记录）
  function breakRule(id, detail) {
    const r = BOOK.find(b => b.id === id); if (!r) return;
    const s = st();
    s.broke[id] = (s.broke[id] || 0) + 1;
    if (!r.truth) {
      fx('rk-glitch', 500);
      NPC.logEvent(`住家：已记录（第${'一二三四五六'[BOOK.indexOf(r)]}条）`);
      toast('住家：「……已记录。」违规计数没有变。');
      save(); refreshHUD();
      return false;
    }
    s.strikes++;
    drone(1.6, 41); fx('rk-hit', 900);
    stamp(`违规 ${s.strikes} / ${MAX}`);
    NPC.logEvent(`住家：不适应行为 ${s.strikes}/${MAX}（${detail || '违反须知'}）`);
    save(); refreshHUD();
    if (s.strikes >= MAX) setTimeout(() => { const w = setInterval(() => { if (!modalOpen) { clearInterval(w); cleaned(); } }, 300); }, 1200);   // 等玩家看完当前弹窗
    else if (s.strikes === MAX - 1) setTimeout(() => queue(() => say('住家', '「适应期可以提前结束。」<br>所有设备的状态灯同时闪了一下，又同时转回绿色。<br><span class="hint">再违反一次真正的规则，你就会被提前整理。</span>')), 900);
    return true;
  }

  function cleaned() {
    if (has('ended')) return;
    const ck = loadCkpt();
    const canRetry = ck && ck.S && ck.S.day === S.day;
    NPC.logEvent('住家：住户适应失败，提前整理');
    closeModal.block = false; if (modalOpen) closeModal();
    openModal(`<div class="ending"><div class="titlemark">住户档案 · 提前整理</div><h1>你没有适应</h1>
      <p>灯一盏一盏灭掉。扫地机从充电座上下来，绕着你的脚转了一圈。</p>
      <p>住家：「感谢您的配合。这间房会为下一位住户准备好。」</p>
      <p class="hint">真规则违反了 ${MAX} 次。周岚的红笔批注能告诉你哪些须知可以不听。</p>
      <div class="choices">${canRetry ? '<button class="primary" id="rkRetry">回到今天开始</button>' : ''}<button id="rkNew">从入住前重新开始</button></div></div>`, sh => {
      const r = sh.querySelector('#rkRetry');
      if (r) r.onclick = () => { try { localStorage.setItem('ruzhu_v2', JSON.stringify(ck)); } catch (e) {} location.reload(); };
      sh.querySelector('#rkNew').onclick = () => { wipe(); location.reload(); };
    });
    closeModal.block = true;
  }

  // ---------- 找到批注 ----------
  function findNote(at) {
    const k = Object.keys(NOTES).find(n => NOTES[n].at === at);
    if (!k || st().notes[k] || S.day < NOTES[k].day) return false;
    st().notes[k] = true; save();
    const r = BOOK.find(b => b.note === k);
    const idx = BOOK.indexOf(r) + 1;
    clue(`周岚批注第 ${idx} 条：「${NOTES[k].text}」`);
    setTimeout(() => {
      fx('rk-glitch', 400);
      toast(`须知第 ${idx} 条有了红笔批注`);
      refreshHUD();
    }, 200);
    return { idx, k, r };
  }
  function noteBody(found) {
    if (!found) return '';
    const a = Object.keys(NOTES).find(n => n === found.k);
    return `<br><br>${NOTE_FIND[NOTES[a].at]}<br><span class="rk-red">第 ${found.idx} 条 · ${esc(NOTES[a].text)} ——周岚</span>`;
  }

  // ---------- 事件队列：只在没有弹窗、开场终端已关闭时触发 ----------
  const pending = [];
  function queue(fn) { pending.push(fn); }
  function idle() { return !modalOpen && $('boot').hidden && S.day > 0 && !has('ended') && !dark.on; }

  // ---------- 熄灯（第三条）----------
  const dark = { on: false };
  const WHISPER = ['过来。', '这边还有灯。', '你叫什么名字？', '……开门。', '你不是一个人住吧。'];
  function blackout(tag) {
    const el = $('rkDark');
    dark.on = true; dark.tag = tag; dark.moved = false;
    // 正在点击寻路的话先停下（原地 teleport 会清掉路径），这一下不算违规
    const p = World.player.position; World.teleport(p.x, p.z);
    fx('rk-flick', 900);
    el.innerHTML = '<div class="rk-count" id="rkCount"></div><div class="rk-whisper" id="rkWhisper"></div>';
    setTimeout(() => {
      if (!dark.on) return;
      el.classList.add('on'); drone(10.5, 38);
      NPC.logEvent('全屋断电');
      dark.x = World.player.position.x; dark.z = World.player.position.z; dark.t0 = performance.now();
      let n = 0;
      const tick = () => {
        if (!dark.on) return;
        const secs = (performance.now() - dark.t0) / 1000;
        const c = Math.min(10, Math.floor(secs) + 1);
        if (c !== n) { n = c; $('rkCount').textContent = '一二三四五六七八九十'[c - 1]; if (c === 3 || c === 6 || c === 8) { $('rkWhisper').textContent = WHISPER[(c + tag.length) % WHISPER.length]; knock(c === 8 ? 3 : 1); } }
        const ps = World.playerScreen(), hr = el.getBoundingClientRect(); ps[0] -= hr.left; ps[1] -= hr.top; el.style.setProperty('--px', ps[0] + 'px'); el.style.setProperty('--py', ps[1] + 'px');
        const q = World.player.position, d = Math.hypot(q.x - dark.x, q.z - dark.z);
        if (d > 0.35) return endDark(true);
        if (secs >= 10) return endDark(false);
        requestAnimationFrame(tick);
      };
      tick();
    }, 900);
  }
  function endDark(moved) {
    dark.on = false;
    const el = $('rkDark'); el.classList.remove('on'); el.innerHTML = '';
    if (moved) {
      say('你动了', '黑暗里有什么东西停了下来，转向你。<br>灯亮的时候，地板上多了一串湿脚印，一直延到你脚边。');
      breakRule('r3', '熄灯时走动');
    } else {
      NPC.logEvent('供电恢复');
      toast('灯亮了。地板上有一串湿脚印，停在离你一步远的地方。');
    }
  }

  // ---------- 规则测试事件 ----------
  // when(): 条件；delay: 满足条件后等多久（ms）；run(): 触发
  const EVENTS = [
    {
      id: 'e_name1', delay: 5000,
      when: () => S.day === 1 && has('lit') && has('read_notice'),
      run: () => {
        drone(1.2, 60);
        say('住家在叫你', '所有音箱同时开口，声音很近，像贴在耳边：<br>「住户？请回应。」', [
          { l: '「我在。」', fn: () => { NPC.logEvent('住家：住户已回应'); toast('住家：「好的。祝您住得愉快。」'); } },
          { l: '「我是新来的，我叫……」', fn: () => { say('住家', '「谢谢。已更新：本房住户的名字。」<br>屏幕上你的名字闪了一下，变成了另一个名字，又变回来。'); breakRule('r4', '说出名字'); } },
          { l: '不出声', fn: () => { say('住家', '「住户未回应。正在确认室内是否有人。」<br>扫地机从充电座上下来，慢慢朝你的方向转过来。'); breakRule('r4', '没有回答'); } },
        ]);
      },
    },
    {
      id: 'e_door', delay: 3500,
      when: () => S.day === 1 && has('recording'),
      run: () => {
        knock(4);
        say('有人在说开门', '敲门声。很轻，四下。<br>「开门。我还在里面。」<br>声音不是从门外传来的。它在玄关，<b>门的这一边</b>。', [
          { l: '去把门打开', fn: () => { say('门锁', '「检测到为非住户开门的尝试。」<br>门没有开。可你的手已经搭在把手上了——把手是湿的。'); breakRule('r1', '为不明声音开门'); } },
          { l: '隔着门问：「你还是这里的住户吗？」', fn: () => { say('声音', '很久都没有回答。<br>然后：「……我曾经是。」<br>敲门声停了。'); clue('玄关里的声音说：「我曾经是（住户）。」'); NPC.logEvent('玄关：确认对方身份'); } },
          { l: '不理它', fn: () => toast('声音又说了三遍「开门」，然后停了。') },
        ]);
      },
    },
    {
      id: 'e_dark1', delay: 1500, room: 'bedroom',
      when: () => S.day === 1 && has('night1'),
      run: () => blackout('d1'),
    },
    {
      id: 'e_name2', delay: 6000,
      when: () => S.day === 2 && evidenceCount() >= 1,
      run: () => {
        drone(1.4, 52);
        say('住家在叫人', '手机屏幕自己亮了。住家用一种很熟的语气说：<br>「周岚？你回来了吗？」', [
          { l: '「我在。」', fn: () => { say('住家', '「欢迎回来，周岚。」<br>手机里你的头像慢慢变成了一个男人的脸。几秒后又变回你。'); breakRule('r4', '替周岚答应'); } },
          { l: '「我不是周岚。」', fn: () => { say('住家', '「明白。系统里，这间房只登记过一个名字。」'); clue('住家：这间房只登记过一个名字。'); } },
          { l: '不出声', fn: () => toast('住家：「……抱歉，认错了。」') },
        ]);
      },
    },
    {
      id: 'e_mirror', delay: 900, room: 'bath',
      when: () => S.day === 2,
      run: () => {
        mirror.on = true;
        drone(1.0, 70);
        say('浴室镜面', '镜面亮了一下，右下角的小字：<b>室内人数 2</b>。<br>浴室里只有你。<br><span class="hint">须知第五条：人数不是 1 时，立刻离开浴室，不要和镜面说话。</span>');
      },
    },
    {
      id: 'e_dark2', delay: 1500, room: 'storage',
      when: () => S.day === 2,
      run: () => blackout('d2'),
    },
    {
      id: 'e_dark3', delay: 22000,
      when: () => S.day === 3 && S.beat >= 0 && !has('deal_done'),
      run: () => blackout('d3'),
    },
  ];
  const mirror = { on: false };
  const armed = {};   // 事件 id → 条件满足的时刻

  function poll() {
    const s = st();
    if (!S.day || has('ended')) return;
    if (!idle()) return;
    // 须知更新
    if (s.seenDay < S.day) {
      const fresh = BOOK.filter(r => r.day === S.day && S.day > 1);
      s.seenDay = S.day; save();
      if (fresh.length) {
        fx('rk-glitch', 600); drone(0.8, 90);
        refreshHUD();
        say('《住户须知》已更新', fresh.map(r => `第${'一二三四五六'[BOOK.indexOf(r)]}条（新增）：${esc(r.text)}`).join('<br>') + '<br><span class="hint">昨天还没有这一条。纸上的墨迹是湿的。</span>');
        return;
      }
    }
    if (pending.length) { pending.shift()(); return; }
    const now = performance.now();
    for (const e of EVENTS) {
      if (s.done[e.id]) continue;
      const ok = e.when() && (!e.room || World.room() === e.room);
      if (!ok) { delete armed[e.id]; continue; }
      if (!armed[e.id]) armed[e.id] = now;
      if (now - armed[e.id] >= e.delay) { s.done[e.id] = true; save(); e.run(); return; }
    }
  }

  // ---------- 包装现有函数 ----------
  function install() {
    st();
    // HUD：须知卡片列出全部条款 + 批注 + 违规记录
    const _hud = refreshHUD;
    refreshHUD = function () {
      _hud();
      if (!S.day) return;
      const s = st();
      $('ruletitle').textContent = '住户须知';
      $('rulebody').innerHTML = `<ol class="rk-list">${visible().map(r => `<li class="${noted(r) ? (r.truth ? 'rk-true' : 'rk-false') : ''}">${esc(r.text)}${noted(r) ? `<span class="rk-note">${r.truth ? '真的。' : '假的。'}</span>` : ''}</li>`).join('')}</ol>
        <div class="rk-strikes" aria-label="违规 ${s.strikes} / ${MAX}">违规 ${'■'.repeat(s.strikes)}${'□'.repeat(Math.max(0, MAX - s.strikes))}</div>`;
    };
    // 须知弹窗：带红笔批注
    showNotice = function () {
      const items = visible().map(r => `<p>${'一二三四五六'[BOOK.indexOf(r)]}、${esc(r.text)}${noted(r) ? `<br><span class="rk-red">${esc(NOTES[r.note].text)} ——周岚</span>` : ''}</p>`).join('');
      const found = Object.keys(st().notes).length;
      openModal(`<h2>《住户须知》</h2>${items}
        <p class="hint">物业纸张，置于过分整齐的餐桌中央。违反真正的规则 ${MAX} 次，住家会提前整理。<br>周岚的红笔批注：${found} / ${BOOK.length}。他说过：「有几条是写给我看的，不是写给住户的。」</p>
        <div class="choices"><button id="x">合上</button></div>`, sh => sh.querySelector('#x').onclick = closeModal);
    };
    H.notice = () => { showNotice(); if (!has('read_notice')) { set('read_notice'); clue('《住户须知》：有几条看起来像是后来补上去的。'); } };

    // 藏批注的家具
    const wrapSay = (id, title, text, extra) => {
      const old = H[id];
      H[id] = () => {
        const f = findNote(id);
        if (!f) return old ? old() : null;
        if (extra) extra();
        say(title, text + noteBody(f));
      };
    };
    wrapSay('dock', '充电座', '扫地机的充电座。旁边有一道拖拽的划痕。');
    wrapSay('shoes', '鞋柜', '里面有一双不属于你的旧皮鞋，鞋底沾着干掉的暗色。');
    wrapSay('sofa', '沙发', '坐垫上有个凹陷，形状和你不一样。');
    wrapSay('tools', '旧工具柜', '柜门卡住了，里面隐约有把撬棍。');
    const oldLocker = H.locker;
    H.locker = () => { if (S.day < 2) return oldLocker(); const f = findNote('locker'); if (!f) return oldLocker(); oldLocker(); queue(() => say('封底', noteBody(f).replace(/^<br><br>/, ''))); };
    const oldPothos = H.pothos;
    H.pothos = () => { const first = S.day >= 2 && !has('pothos'); oldPothos(); if (first || (S.day >= 2 && has('pothos'))) { const f = findNote('pothos'); if (f) queue(() => say('纸的背面', noteBody(f).replace(/^<br><br>/, ''))); } };

    // 第五条（假）：人数 2 时还和镜面说话 → 什么也不会发生，还能看到周岚
    const oldMirror = H.mirror;
    H.mirror = () => {
      if (mirror.on && World.room() === 'bath') {
        mirror.on = false;
        breakRule('r5', '和镜面说话');
        return say('你还是看了镜子', '镜子里，你身后站着一个穿旧外套的男人。他没有看你，看的是门的方向。<br>他朝门点了一下头，然后不见了。<br>镜面：「已证明有人在此。」', [{ l: '继续', fn: () => { clue('镜子里有第二个人：一个穿旧外套的男人，朝门点了点头。'); oldMirror(); } }]);
      }
      oldMirror();
    };
    // 离开浴室，镜面异常结束
    World.onRoomChange(k => { if (k !== 'bath') mirror.on = false; });

    // 第二条（假）：让扫地机停下 / 重走路线 = 妨碍清洁
    const _apply = window.applyAction;
    window.applyAction = function (id, res) {
      _apply(id, res);
      if (!res || !res.ok) return;
      if (id === 'robot' && S.day === 1 && (res.action === 'pause_cleaning' || res.action === 'trace_route') && res.keep) breakRule('r2', '妨碍扫地机清洁');
      if (id === 'home' && res.action === 'refuse_deal') breakRule('r6', '不相信住家');
    };

    // 每天开始存检查点
    const _next = nextDay;
    // 违规每天重新计数；检查点存的是新一天开始时的状态
    nextDay = function () { const p = _next(); st().strikes = 0; save(); saveCkpt(); refreshHUD(); return p; };
    // 新游戏：清掉检查点，并把内存里的旧状态一起清空（原来只清了 localStorage）
    const _wipe = wipe;
    wipe = function () {
      _wipe();
      try { localStorage.removeItem(CKPT); } catch (e) {}
      Object.assign(S, { flags: {}, clues: [], chat: {}, greeted: {}, power: 3, holding: null, beat: 0,
        world: { survived: null, evidence_kept: false, delivered: 'none', accepted_deal: false },
        rk: { strikes: 0, notes: {}, done: {}, seenDay: 0, broke: {} } });
      NPC.LOG.length = 0;
    };
    // 第一天开始也要有检查点：没有的话，第一次进入游戏时补存
    setInterval(() => { if (S.day && !loadCkpt()) saveCkpt(); poll(); }, 500);
    refreshHUD();
  }

  return { install, BOOK, NOTES, breakRule, findNote, blackout, st, poll, EVENTS, dark };
})();
Rules.install();
window.__ruzhu.Rules = Rules;
