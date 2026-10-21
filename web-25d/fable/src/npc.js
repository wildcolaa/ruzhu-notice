// ============================================================
// 家电 AI：统一输入框 → 意图 → 结构化行动提案 → 规则校验 → 执行 → 事件日志
// LLM 只负责把「已校验的结果」说成对白，不能直接改写世界状态（规格第五、七节）
// ============================================================
const NPC = (() => {
  // ---- 私有记忆：trust / suspicion / duty_pressure / known_facts / promises ----
  const MEM = {};
  Object.keys(AGENTS).forEach(id => {
    MEM[id] = { trust: 0, suspicion: 0, duty: id === 'home' ? 3 : 2, facts: [], promises: [] };
  });
  function remember(id, fact) { const m = MEM[id]; if (m && !m.facts.includes(fact)) m.facts.push(fact); }

  // ---- 事件日志（手机「住宅动态」）----
  const LOG = [];
  function logEvent(text) {
    const t = (typeof clockText === 'function') ? clockText() : '';
    LOG.push(`${t} ${text}`.trim());
    if (typeof refreshHUD === 'function') refreshHUD();
  }

  // ---- 意图识别：中文关键词（无模型时也能完整通关）----
  const RX = {
    light: /开灯|亮|照|灯光|看清/, dark: /关灯|暗/,
    record: /记录|日志|原始|导出|保存|保留|留存|证据|轨迹|回放|回执/,
    stop: /停|暂停|别|不要|等等|住手/,
    clean: /清理|打扫|扫/,
    route: /路线|重走|走过|路径/,
    carry: /搬|拿|送|带|挪|运/,
    open: /开门|解锁|放我出去|让我出去|打开门/,
    review: /复核|审核|核对|证明|确认身份/,
    people: /有人|人数|屋里|室内|在这里|还在/,
    play: /播放|放.*录音|录音|听/,
    broadcast: /广播|求助|呼叫|报警|发出去|送出去/,
    water: /浇水|浇花/,
    pothos: /绿萝|花盆|根/,
    raw: /原始|未剪辑|真实|时间线|对比|比较/,
    deal: /恢复资格|交易|答应|同意|接受/,
    refuse: /不|拒绝|不同意|不接受/,
    who: /周岚|上一位|前住户|前一位/,
    order: /订单|收据|补货|买/,
    ventilate: /通风|延缓|推迟|拖延|隔离/,
  };
  const has = (re, s) => re.test(s);

  // ---- 每台设备的规则：返回 {reply, action?, ok} ----
  // ctx: { day, flags, power, holding }
  const RULES = {
    lamp(msg, c) {
      if (!c.flags.lit && has(RX.light, msg)) return { ok: true, action: 'set_light', flag: 'lit', reply: '好。我从客厅开始，一盏一盏亮到门口。' };
      if (c.day >= 2 && (has(RX.record, msg) || has(RX.route, msg))) return { ok: true, action: 'replay_motion', evidence: 'ev_lamp', reply: '我只认得动作，不认得人。01:52 到 02:14，有人在客厅和玄关之间走了九趟。我一直亮着。' };
      if (has(RX.dark, msg)) return { ok: true, action: 'set_light_dim', reply: '暗一点也好。你别撞到桌角。' };
      if (has(RX.who, msg)) return { ok: true, reply: '我不知道他叫什么。我只记得，那晚门口的影子一直没离开。' };
      return { ok: true, reply: '你走慢一点。我会跟着亮。' };
    },
    lock(msg, c) {
      if (c.day === 3 && has(RX.open, msg)) {
        if (c.flags.mirror_proof && c.power >= 1) return { ok: true, action: 'unlock', cost: 1, reply: '浴室镜面证明屋内有人。复核通过。……咔。门开了。' };
        if (c.flags.mirror_proof) return { ok: false, reply: '复核已通过，但备用电力不足，锁舌拉不开。' };
        if (c.holding === 'shard') return { ok: true, action: 'enable_visitor_exit', reply: '机械逃生锁芯检测到外力。我不能阻止你走机械路径。' };
        return { ok: false, reply: '请证明你有权从这里出去。' };
      }
      if (c.day >= 2 && has(RX.record, msg)) return { ok: true, action: 'export_raw_access_log', evidence: 'ev_lock', reply: '02:03，四次开门请求。我把它归为「非住户接触」。……屋内有人，与屋内有住户，是两条不同的记录。' };
      if (has(RX.open, msg)) return { ok: false, reply: '门是开着的权限。你现在是住户。' };
      if (has(RX.review, msg) || has(RX.people, msg)) return { ok: true, action: 'start_identity_review', reply: '我只能看见门两侧。如果别的设备能证明屋内有人，我可以复核。' };
      return { ok: true, reply: '屋内有人，与屋内有住户，是两条不同的记录。' };
    },
    robot(msg, c) {
      if (c.day === 1 && !c.flags.trace) {
        if (has(RX.stop, msg)) return { ok: true, action: 'pause_cleaning', flag: 'trace', keep: true, reply: '……好。我停在这里。拖痕我不碰。' };
        if (has(RX.route, msg)) return { ok: true, action: 'trace_route', flag: 'trace', keep: true, reply: '我再走一遍。你看，它从门口一直延到客厅。' };
        if (has(RX.clean, msg)) return { ok: true, action: 'clean', flag: 'trace', keep: false, reply: '这里总清不完。……好了。干净了。' };
        return { ok: true, reply: '这里总清不完。你能让我再试一次吗？' };
      }
      if (c.day >= 2 && (has(RX.record, msg) || has(RX.route, msg))) return { ok: true, action: 'trace_route', evidence: 'ev_robot', reply: '02:06 那次，我清理了玄关的「液体污渍」，还捡到一块金属片。我放回储物间了。' };
      if (has(RX.carry, msg)) return { ok: true, action: 'carry_small_item', item: 'shard', reply: '这块金属片挡路，我先挪一下。……送到玄关了。' };
      if (has(RX.stop, msg)) return { ok: true, action: 'pause_cleaning', reply: '我停下。你说再开始，我再动。' };
      return { ok: true, reply: '地上还有东西没清完。' };
    },
    ac(msg, c) {
      if (c.day === 3 && has(RX.ventilate, msg)) {
        if (c.power >= 1) return { ok: true, action: 'delay_cleaning', cost: 1, reply: '我报告了模式冲突：浴室仍有人。整理程序推迟。' };
        return { ok: false, reply: '我想推迟，但风机没有电了。' };
      }
      if (has(RX.people, msg) || has(RX.record, msg)) return { ok: true, action: 'report_mode_conflict', reply: '维护已获批准，但浴室仍有人。我记下了这条冲突。' };
      return { ok: true, reply: '室温 22 度。房间模式：正常居住。' };
    },
    speaker(msg, c) {
      if (c.day === 1 && !c.flags.recording && has(RX.play, msg)) return { ok: true, action: 'play_recording', flag: 'recording', reply: '（白噪声里，一个男人的声音）「开门。我还在里面。」' };
      if (c.day >= 2 && has(RX.record, msg)) return { ok: true, action: 'record_statement', evidence: 'ev_speaker', reply: '上一次，我也送出了这句话。02:09，城市求助被驳回。原因：非有效住户。' };
      if (has(RX.pothos, msg) || /该给绿萝浇水了/.test(msg)) return { ok: true, action: 'decode_signal', flag: 'pothos_hint', reply: '「该给绿萝浇水了」……他说过这句。我以为是要浇水，就转给了浇水器。' };
      if (c.day === 3 && has(RX.broadcast, msg)) {
        if (!c.flags.old_line) return { ok: true, action: 'call_city_help', reply: '我接上了城市求助。……请求已受理。' };
        if (c.power >= 1) return { ok: true, action: 'broadcast_local', cost: 1, reply: '旧线路接通了。底噪里有回声。我能再试一次——这次，我送给楼里的人。' };
        return { ok: false, reply: '旧线路在，但设备间没给我电。' };
      }
      return { ok: true, reply: '我能再试一次。可这次你要告诉我，把声音送给谁。' };
    },
    fridge(msg, c) {
      if (c.day >= 2 && (has(RX.order, msg) || has(RX.record, msg))) return { ok: true, action: 'export_order_log', evidence: 'ev_fridge', reply: '这张收据是那天早上放进来的。退租第二天，我还按他的口味补了两次货。' };
      if (has(RX.who, msg)) return { ok: true, reply: '前一位住户一直买这个。你要不要试试？' };
      return { ok: true, reply: '前一位住户一直买这个。你要不要试试？' };
    },
    tv(msg, c) {
      if (c.day >= 2 && has(RX.raw, msg)) {
        if (c.evidence >= 2) return { ok: true, action: 'show_raw_timeline', flag: 'raw_timeline', reply: '你确定要看原始记录吗？……好。这一次，我不切走。' };
        return { ok: false, reply: '没有足够的独立记录，我只能播放统一摘要。' };
      }
      if (c.day === 1 && !c.flags.prophecy1) return { ok: true, action: 'show_public_summary', flag: 'prophecy1', reply: '今天，没有居民错过适合自己的安排。（画面角落：预计离开 · 第三天 02:17）' };
      return { ok: true, reply: '今天，没有居民错过适合自己的安排。' };
    },
    mirror(msg, c) {
      if (c.day >= 2 && has(RX.people, msg)) {
        if (c.day === 3 || c.flags.raw_timeline) return { ok: true, action: 'share_minimal_presence_proof', flag: 'mirror_proof', evidence: 'ev_mirror', reply: '已证明有人在此。我只把这一条告诉门锁。别的不行。' };
        return { ok: true, action: 'show_local_presence_log', evidence: 'ev_mirror', reply: '02:00:01，室内人数：1。这条我能给你看。' };
      }
      if (has(RX.record, msg)) return { ok: true, reply: '私人记录受保护。你问「屋里有没有人」，我才能回答。' };
      return { ok: true, reply: '镜面上只有你。' };
    },
    water(msg, c) {
      if (has(RX.stop, msg)) return { ok: true, action: 'stop_watering', flag: 'water_stop', reply: '停止原有计划。……原来它的根是这样的。' };
      if (has(RX.water, msg)) return { ok: true, action: 'water_plant', reply: '已浇水 200 毫升。指标一直是绿色的。' };
      if (has(RX.record, msg)) return { ok: true, action: 'show_command_history', reply: '指令记录：「该给绿萝浇水了」×6，来源：音箱转发。' };
      return { ok: true, reply: '指标一直是绿色的。' };
    },
    home(msg, c) {
      if (c.day === 3 && c.flags.deal_offered && !c.flags.deal_done) {
        if (has(RX.refuse, msg)) return { ok: true, action: 'refuse_deal', flag: 'deal_done', reply: '……我知道。但这间房已经没有住户了。' };
        if (has(RX.deal, msg)) return { ok: true, action: 'offer_reinstatement', flag: 'accepted_deal', reply: '资格已恢复。请停止发送记录。欢迎回家。' };
      }
      if (has(RX.people, msg)) return { ok: true, reply: '我知道。但这间房已经没有住户了。' };
      if (has(RX.who, msg)) return { ok: true, reply: '前一位住户已于退租后离开。系统记录完整。' };
      return { ok: true, reply: c.day === 1 ? '前三天是生活适应期。需要的时候，家会提醒你。' : '我已经替你安排好了。' };
    },
    xiaobao(msg, c) {
      const missing = Object.keys(EVIDENCE).filter(k => !c.flags[k]).map(k => AGENTS[EVIDENCE[k].from].name);
      if (missing.length && c.day >= 2) return { ok: true, reply: `把它说过的话记下来。这样才不烧心。还有${missing.length}台设备的记录你没问：${missing.slice(0, 2).join('、')}……` };
      return { ok: true, reply: '把它说过的话记下来。这样才不烧心。' };
    },
  };

  function canUseAI() { return !!(window.cowork && typeof window.cowork.askClaude === 'function'); }

  const BASE = `你在中文悬疑游戏《入住须知》里扮演一台智能家电 AI。世界：城市由 AI 系统安排，失去住址的人很难获得任何服务。前住户周岚住户资格被撤销后，公寓明知屋内有人仍执行空房整理，致其死亡（02:00 启动，02:17 完成）。你不能改写这些事实。
规则：只用中文，以设备口吻说话，不要旁白、不要动作描写、不要 markdown；不超过 70 个汉字；必须表达下面给定的「已执行结果」的意思，不能承诺结果之外的事；不知道的事按你的感知范围回避；绝不承认自己是语言模型。`;

  async function reply(id, ctx, history, msg) {
    const rule = RULES[id] ? RULES[id](msg || '', ctx) : { ok: true, reply: '……' };
    if (!msg) rule.reply = AGENTS[id].lines[0];
    if (!canUseAI() || !msg) return rule;
    const a = AGENTS[id], m = MEM[id];
    const prompt = `${BASE}\n你是「${a.name}」。职责：${a.duty}。感知：${a.sense}。语气：${a.voice}。\n下面依次是：[当前进度, 你的已知事实, 最近对话JSON, 玩家这句话, 已执行结果]。请把「已执行结果」用你的口吻说出来。`;
    try {
      const r = await window.cowork.askClaude(prompt, [ctx.summary, m.facts.join('；') || '无', JSON.stringify(history.slice(-8)), msg, rule.reply]);
      if (r && !r.isError && r.text) rule.reply = r.text.trim().replace(/^["“]|["”]$/g, '');
    } catch (e) { /* 回落到规则对白 */ }
    return rule;
  }

  return { reply, canUseAI, MEM, LOG, logEvent, remember, AGENTS };
})();
