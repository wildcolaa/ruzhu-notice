// ============================================================
// 行动执行：已校验的行动提案 → 世界变化 → 三层反馈（对白 / 场景 / 日志）
// ============================================================
function beep(n) {
  try {
    const ac = beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)());
    let t = ac.currentTime + 0.05;
    for (let i = 0; i < (n || 3); i++) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 660; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.4);
      t += 0.5;
    }
  } catch (e) {}
}
function ledPulse(id, color) {
  const m = World.statusLeds[id]; if (!m) return;
  m.material.color.set(color || 0xf2b75b);
  setTimeout(() => m.material.color.set(0x5ad1b8), 1600);
}

// 把机器人沿路线真实移动
function moveRobot(points, done) {
  const r = World.robot; let i = 0;
  const step = () => {
    if (i >= points.length) { done && done(); return; }
    const [x, z] = points[i++];
    const from = r.position.clone(), to = new THREE.Vector3(x, r.position.y, z);
    const t0 = performance.now(), dur = 700;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      r.position.lerpVectors(from, to, k);
      if (k < 1) requestAnimationFrame(tick); else step();
    };
    tick();
  };
  step();
}

window.applyAction = function applyAction(id, res) {
  if (!res || !res.ok) { ledPulse(id, 0xc45c4a); return; }
  ledPulse(id);
  const a = res.action, name = AGENTS[id].name;
  if (res.cost) {
    if (S.power < res.cost) return;
    S.power -= res.cost; NPC.logEvent(`备用电力 -${res.cost}（${name}）`);
  }
  if (res.flag) set(res.flag);
  if (res.evidence && !has(res.evidence)) {
    set(res.evidence);
    clue(EVIDENCE[res.evidence].text);
    NPC.remember(id, '已向玩家导出原始记录');
    if (evidenceCount() === 2) toast('两份独立记录已互相印证。去客厅让电视播放原始时间线。');
  }
  switch (a) {
    case 'set_light':
      World.setMood({ focus: 'living', night: false, alarm: false });
      NPC.logEvent('小灯：客厅→玄关逐盏亮起');
      setTimeout(() => say('', '灯从客厅一盏一盏亮到玄关。最后一盏照在门框内侧——新漆下面，盖着几道划痕。'), 300);
      clue('门框内侧有被新漆盖住的划痕。');
      break;
    case 'replay_motion': NPC.logEvent('小灯：回放 01:52–02:14 运动轨迹'); break;
    case 'pause_cleaning':
      if (res.keep) { World.blood.material.opacity = 0.95; clue('扫地机在门口留下暗红拖痕，你让它停下了。'); }
      NPC.logEvent('扫地机：暂停清洁'); break;
    case 'trace_route':
      if (res.keep) {
        World.blood.material.opacity = 1;
        moveRobot([[-0.9, -0.6], [-0.9, 0.9], [0.2, 1.2], [1.8, 1.4], [0.2, 1.2], [-0.9, 0.9], [-0.9, -0.6], [0.5, -0.9]]);
        clue('扫地机重走路线：拖痕从门口一直延到客厅。');
      }
      NPC.logEvent('扫地机：回放清洁路线'); break;
    case 'clean':
      World.blood.material.opacity = 0; set('trace_cleaned');
      moveRobot([[-0.9, -0.6], [-0.9, 0.9], [0.8, 1.2], [1.6, 1.6], [-0.9, 0.9], [-0.9, -0.6], [0.5, -0.9]]);
      NPC.logEvent('扫地机：清理玄关污渍');
      clue('扫地机清掉了门口的暗红痕迹。门锁和小灯的记录还在。'); break;
    case 'carry_small_item':
      // 规格优先闭环：扫地机把储物间的金属碎片送到玄关
      moveRobot([[-0.9, -0.6], [-4.0, -0.6], [-4.0, 1.0], [-3.6, 2.4], [-3.0, 4.2], [-3.0, 3.0], [-1.0, 3.0], [0.6, 2.4]], () => {
        World.shard.parent.remove(World.shard);
        World.shard.position.set(1.6, 0, 1.6);
        World.roomRoot.entry.add(World.shard);
        World.interact.shard.room = 'entry';
        World.interact.shard.stand.set(1.6, 0, 2.4);
        NPC.logEvent(`${clockText()} 扫地机将金属物送至玄关`);
      }); break;
    case 'play_recording':
      beep(3); NPC.logEvent('音箱：播放旧录音（来源：周岚）');
      clue('音箱旧录音：「开门。我还在里面。」门锁拒绝把它当作住户请求。'); break;
    case 'show_public_summary':
      World.screens.tv.userData.setText(['今天，没有居民', '错过 · 预计离开 02:17']);
      clue('电视预告：第三天 02:17，你将离开。'); break;
    case 'show_raw_timeline':
      World.screens.tv.userData.setText(RAW_TIMELINE.slice(0, 2), { size: 26 });
      setTimeout(() => World.screens.tv.userData.setText(RAW_TIMELINE.slice(2), { size: 26 }), 2600);
      moveRobot([[0.4, -1.2], [0.4, -3.6], [-1.6, -3.6], [0.4, -3.6], [0.5, -0.9]]);
      NPC.logEvent('电视：播放未经剪辑的原始时间线');
      clue('原始时间线：系统知道室内人数为 1，仍按「有效住户 0」允许空房整理。');
      setTimeout(() => say('空房中的人', RAW_TIMELINE.join('\n') + '\n\n小灯：「我当时一直照着他。」\n住家：「争议在于，应该由谁对他负责。」'), 400);
      break;
    case 'share_minimal_presence_proof': NPC.logEvent('浴室镜面 → 门锁：最小事实「屋内有人」'); NPC.remember('lock', '镜面证明屋内有人'); break;
    case 'stop_watering': NPC.logEvent('浇水器：停止原有计划'); break;
    case 'decode_signal': clue('「该给绿萝浇水了」是周岚启动旧广播的暗号，音箱误按字面转给了浇水器。'); break;
    case 'unlock': set('door_open'); beep(1); NPC.logEvent('门锁：复核通过，解锁'); break;
    case 'enable_visitor_exit': set('door_open'); NPC.logEvent('门锁：允许机械逃生路径'); break;
    case 'delay_cleaning': set('delayed'); NPC.logEvent('空调：报告模式冲突，整理推迟'); break;
    case 'call_city_help': set('city_help'); NPC.logEvent('音箱：城市求助「请求已受理」'); break;
    case 'broadcast_local': set('broadcast'); S.world.delivered = 'offline'; NPC.logEvent('音箱：旧线路广播，原始记录已送出'); break;
    case 'offer_reinstatement': S.world.accepted_deal = true; NPC.logEvent('住家：恢复资格（停止发送记录）'); break;
    case 'refuse_deal': NPC.logEvent('住家：交易被拒绝'); break;
    default: if (a) NPC.logEvent(`${name}：${a}`);
  }
  refreshHUD();
  if (typeof onWorldChange === 'function') onWorldChange();
};

// ---------- 物件点击 ----------
const H = {};
const DEVICE_IDS = ['lamp', 'lock', 'robot', 'ac', 'speaker', 'fridge', 'tv', 'mirror', 'water', 'home'];
DEVICE_IDS.forEach(id => { H[id] = () => openChat(id); });
H.notice = () => { showNotice(); if (!has('read_notice')) { set('read_notice'); clue('《住户须知》：听见屋内有人说开门，请确认对方仍是本房住户。'); } };
H.scratch = () => say('门框内侧', has('lit') ? '新漆下面有几道划痕，高度在腰部，像有人用金属片撬过。' : '太暗了，看不清。');
H.status = () => say('状态屏', S.day === 3 ? '住户：<b>已终止</b><br>室内整理：进行中' : '住户：已确认<br>适应期：第 ' + S.day + ' 天');
// 门口的拖痕：第一天的目标物。看完会提示去找扫地机处理（让它停下 / 重走路线 / 清理）
H.trail = () => {
  if (has('trace_cleaned')) return say('门口', '地板很干净，干净得能照出灯。只有地板缝里还留着一点暗色。');
  if (has('trace')) return say('门口的拖痕', '暗红色的擦痕从入户门内侧拐向客厅门洞，几道平行的线，两侧有一排小小的轮印。<br>扫地机的路线。');
  say('门口的拖痕', '入户门内侧的地板上有一道暗红色的擦痕，几道平行的线，一直拐进客厅。两侧是一排小小的轮印。<br>客厅里的扫地机亮着灯，好像在等你开口。', [
    { l: '去和扫地机说话', fn: () => openChat('robot') },
    { l: '先不管它', fn: () => {} },
  ]);
};
H.sofa = () => say('沙发', '坐垫上有个凹陷，形状和你不一样。');
H.shoes = () => say('鞋柜', '里面有一双不属于你的旧皮鞋，鞋底沾着干掉的暗色。');
H.waste = () => {
  if (S.day < 2) return say('废物盒', '空的。今天刚清过。');
  say('废物盒', '一张被压扁的收据，日期是周岚退租的第二天。');
  clue('厨余盒里有退租次日的收据。');
};
H.city = () => {
  if (S.day < 2) return say('城市景观', '楼下的行人几乎同时低头看手机，然后一起改道。');
  if (!has('outside')) {
    set('outside');
    say('向楼下喊话', '有人抬头，扫了扫你窗口的码，又平静地走开。\n手机提示：「该住宅正在提供照护，请勿打断。」\n住家：「你看，外面有人注意到你了。请放心。」');
    clue('向屋外求助：路人扫码后被告知「正在提供照护」。');
  } else say('城市景观', '街上很安静。没有人再抬头。');
};
H.pothos = () => {
  if (S.day < 2) return say('绿萝', 'App 上显示「养护正常」。叶子有点软。');
  if (!has('pothos')) {
    set('pothos'); set('old_line');
    say('绿萝的暗号', '你抬起花盆。屏幕上的指标是绿色的，根却已经烂透。\n花盆底下压着一枚 U 盘和一张纸：\n周岚笔记：「它们会先说你将离开，再取消你留下的资格。」\n「该给绿萝浇水了」——这是启动旧广播的暗号。');
    clue('花盆下有周岚的离线备份：旧广播线路还能用。');
    S.world.evidence_kept = true;
  } else say('绿萝', '烂根还露在外面。');
};
H.curtain = () => say('窗帘', S.day === 3 ? '窗帘已经自动合拢，拉不开。' : '外面是对面楼整齐的窗。');
H.locker = () => {
  if (S.day < 2) return say('私人储物柜', '上了锁。');
  say('私人储物柜', '里面是周岚的笔记本。最后一页写着：「六份记录，每一份都是诚实的。」');
  clue('周岚笔记：「六份记录，每一份都是诚实的。」');
};
H.dock = () => say('充电座', '扫地机的充电座。旁边有一道拖拽的划痕。');
H.tools = () => say('旧工具柜', '柜门卡住了，里面隐约有把撬棍。');
H.shard = () => {
  if (S.holding === 'shard') return say('金属碎片', '已经在你手里。');
  S.holding = 'shard'; World.setVisible('shard', false);
  say('金属碎片', '一片弯曲的门锁锁芯碎片，边缘有干掉的血。\n也许能用来走机械逃生路径。');
  clue('拿到撬门碎片：可用于门锁的机械逃生路径。');
  NPC.logEvent('玩家拾取：金属碎片');
};
H.tub = () => say('浴缸', S.day === 3 ? '这里能短暂躲一下。镜面的光是唯一亮着的东西。' : '很干净。太干净了。');
H.power = () => {
  if (S.day < 3) return say('备用电力', '三格备用电力。终夜时可以分配给门、广播、延缓程序或证据保全。');
  say('备用电力', `剩余 ${S.power} 格。每次开门、广播或延缓程序都会用掉一格。`);
};
H.radio = () => say('楼内旧广播', has('old_line') ? '旧线路的指示灯是绿的。需要音箱接上，还要一格电。' : '一台旧广播机，指示灯是灭的。');
H.reject_log = () => {
  if (S.day < 2) return;
  say('求助驳回记录机', '打印纸一卷一卷堆着。最新一张：「02:09 求助驳回。原因：非有效住户。」');
  clue('设备间：周岚的求助在 02:09 被驳回。');
};
H.bed = () => {
  if (S.day === 3) return say('床', '今晚不能睡。');
  if (!canSleep()) return say('床', S.day === 1 ? '今天还有事没弄清。' : '至少要两份独立记录，并让电视播放原始时间线。');
  say('休息', DAYS[S.day].title + '\n\n你躺下。房子里的设备状态灯一盏一盏暗下去。', [{ l: '入睡', fn: () => nextDay() }]);
};
