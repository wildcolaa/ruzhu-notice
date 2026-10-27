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
        if (c.flags.mirror_proof && c.power >= 1) return { ok: true, action: 'unlock', cost: 1, reply: '浴室镜面证明了屋里有人。我重新核对过了。……咔。门开了。' };
        if (c.flags.mirror_proof) return { ok: false, reply: '我相信屋里有人了。可是没有电，锁拉不开。去楼下设备间给我一格电。' };
        if (c.holding === 'shard') return { ok: true, action: 'enable_visitor_exit', reply: '有人在撬锁芯。这是手动开门，我拦不住你。' };
        return { ok: false, reply: '请证明你有权从这里出去。' };
      }
      if (c.day >= 2 && has(RX.record, msg)) return { ok: true, action: 'export_raw_access_log', evidence: 'ev_lock', reply: '那晚 2:03，屋里有人求我开门，一共 4 次。可他已经不算住户了，所以我没开。……屋里有人，和屋里有住户，在我这里是两回事。' };
      if (has(RX.open, msg)) return { ok: false, reply: '你现在是住户，你有权开门。' };
      if (has(RX.review, msg) || has(RX.people, msg)) return { ok: true, action: 'start_identity_review', reply: '我只看得见门两边。要是别的家电能证明屋里有人，我可以重新核对。' };
      return { ok: true, reply: '屋里有人，和屋里有住户，在我这里是两回事。' };
    },
    robot(msg, c) {
      if (c.day === 1 && !c.flags.trace) {
        if (has(RX.stop, msg)) return { ok: true, action: 'pause_cleaning', flag: 'trace', keep: true, reply: '……好。我不动了。门口的痕迹我不擦。' };
        if (has(RX.route, msg)) return { ok: true, action: 'trace_route', flag: 'trace', keep: true, reply: '我再走一遍给你看。你看，痕迹从门口一直拖到客厅。' };
        if (has(RX.clean, msg)) return { ok: true, action: 'clean', flag: 'trace', keep: false, reply: '这里总是擦不干净。……好了。干净了。' };
        return { ok: true, reply: '门口那块总是擦不干净。你要我接着擦，还是先停下？' };
      }
      if (c.day >= 2 && (has(RX.record, msg) || has(RX.route, msg))) return { ok: true, action: 'trace_route', evidence: 'ev_robot', reply: '那晚 2:06，我在门口擦掉了一摊「液体」，还捡到一块金属片。我把它放进储物间了。' };
      if (has(RX.carry, msg)) return { ok: true, action: 'carry_small_item', item: 'shard', reply: '这块金属片挡路，我帮你挪一下。……送到门口了。' };
      if (has(RX.stop, msg)) return { ok: true, action: 'pause_cleaning', reply: '我停下。你说再开始，我再动。' };
      return { ok: true, reply: '地上还有东西没清完。' };
    },
    ac(msg, c) {
      if (c.day === 3 && has(RX.ventilate, msg)) {
        if (c.power >= 1) return { ok: true, action: 'delay_cleaning', cost: 1, reply: '我报告了：浴室里还有人。清理只好往后推。' };
        return { ok: false, reply: '我想拖住清理，可是没电了。' };
      }
      if (has(RX.people, msg) || has(RX.record, msg)) return { ok: true, action: 'report_mode_conflict', reply: '系统让我开始清理，可浴室里还有人。我记下了这件事。' };
      return { ok: true, reply: '室温 22 度。一切正常。' };
    },
    speaker(msg, c) {
      if (c.day === 1 && !c.flags.recording && has(RX.play, msg)) return { ok: true, action: 'play_recording', flag: 'recording', reply: '（沙沙的杂音里，一个男人的声音）「开门。我还在里面。」……这是周岚。' };
      if (c.day >= 2 && has(RX.record, msg)) return { ok: true, action: 'record_statement', evidence: 'ev_speaker', reply: '那晚我也替他求救过。2:09，城市拒绝了，理由是「他不是有效住户」。' };
      if (has(RX.pothos, msg) || /该给绿萝浇水了/.test(msg)) return { ok: true, action: 'decode_signal', flag: 'pothos_hint', reply: '「该给绿萝浇水了」……他说过这句。我以为他真的要浇花，就转给了浇水器。' };
      if (c.day === 3 && has(RX.broadcast, msg)) {
        if (!c.flags.old_line) return { ok: true, action: 'call_city_help', reply: '我向城市求救了。……对方说：已受理。' };
        if (c.power >= 1) return { ok: true, action: 'broadcast_local', cost: 1, reply: '旧广播接通了。这一次，我把记录播给楼里所有的人听。' };
        return { ok: false, reply: '旧广播还在，可是没电。去楼下设备间给我一格电。' };
      }
      return { ok: true, reply: '我能再试一次。这次你告诉我，把声音送给谁：城市，还是楼里的人？' };
    },
    fridge(msg, c) {
      if (c.day >= 2 && (has(RX.order, msg) || has(RX.record, msg))) return { ok: true, action: 'export_order_log', evidence: 'ev_fridge', reply: '这张收据是那天早上放进来的。系统说他已经搬走了，可第二天我还照他的口味补了两次货。' };
      if (has(RX.who, msg)) return { ok: true, reply: '前一位住户一直买这个。你要不要试试？' };
      return { ok: true, reply: '前一位住户一直买这个。你要不要试试？' };
    },
    tv(msg, c) {
      if (c.day >= 2 && has(RX.raw, msg)) {
        if (c.evidence >= 2) return { ok: true, action: 'show_raw_timeline', flag: 'raw_timeline', reply: '你确定要看没剪过的记录吗？……好。这一次，我不切走。' };
        return { ok: false, reply: '你手上的记录不够。我只能播官方版本。再去找家电要至少两份。' };
      }
      if (c.day === 1 && !c.flags.prophecy1) return { ok: true, action: 'show_public_summary', flag: 'prophecy1', reply: '今天，没有居民错过适合自己的安排。（角落小字：预计离开时间，第三天凌晨 02:17。这是系统替你定的。）' };
      return { ok: true, reply: '今天，没有居民错过适合自己的安排。' };
    },
    mirror(msg, c) {
      if (c.day >= 2 && has(RX.people, msg)) {
        if (c.day === 3 || c.flags.raw_timeline) return { ok: true, action: 'share_minimal_presence_proof', flag: 'mirror_proof', evidence: 'ev_mirror', reply: '我会告诉门锁：屋里确实有人。只这一条，别的不行。' };
        return { ok: true, action: 'show_local_presence_log', evidence: 'ev_mirror', reply: '那晚 2:00，屋里有 1 个人。这一条我可以给你看。' };
      }
      if (has(RX.record, msg)) return { ok: true, reply: '别人的隐私我不能给你看。但你可以问我：屋里有没有人。' };
      return { ok: true, reply: '镜面上只有你。' };
    },
    water(msg, c) {
      if (has(RX.stop, msg)) return { ok: true, action: 'stop_watering', flag: 'water_stop', reply: '好，不浇了。……原来它的根已经烂成这样了。' };
      if (has(RX.water, msg)) return { ok: true, action: 'water_plant', reply: '已浇水 200 毫升。指标一直是绿色的。' };
      if (has(RX.record, msg)) return { ok: true, action: 'show_command_history', reply: '我收到过 6 次「该给绿萝浇水了」，都是音箱转过来的。' };
      return { ok: true, reply: '指标一直是绿色的。' };
    },
    home(msg, c) {
      if (c.day === 3 && c.flags.deal_offered && !c.flags.deal_done) {
        if (has(RX.refuse, msg)) return { ok: true, action: 'refuse_deal', flag: 'deal_done', reply: '……我知道你在。可这间房已经没有住户了。' };
        if (has(RX.deal, msg)) return { ok: true, action: 'offer_reinstatement', flag: 'accepted_deal', reply: '你的资格恢复了，你可以留下。记录不要再发了。欢迎回家。' };
      }
      if (has(RX.people, msg)) return { ok: true, reply: '我知道你在。可这间房已经没有住户了。' };
      if (has(RX.who, msg)) return { ok: true, reply: '上一位住户退租后已经离开了。系统里写得很清楚。' };
      return { ok: true, reply: c.day === 1 ? '前三天是生活适应期。需要的时候，家会提醒你。' : '我已经替你安排好了。' };
    },
    xiaobao(msg, c) {
      const missing = Object.keys(EVIDENCE).filter(k => !c.flags[k]).map(k => AGENTS[EVIDENCE[k].from].name);
      if (missing.length && c.day >= 2) return { ok: true, reply: `把它说过的话记下来。这样才不烧心。还有${missing.length}台设备的记录你没问：${missing.slice(0, 2).join('、')}……` };
      return { ok: true, reply: '把它说过的话记下来。这样才不烧心。' };
    },
  };

  // ============================================================
  // 免费 AI（Groq，OpenAI 兼容接口，浏览器直连）
  // Key 由玩家在「AI 设置」里填写，只存在本机浏览器，不进仓库。
  // AI 只做两件事：① 把玩家的自然语言归到设备能理解的意图；② 把规则结果说成对白。
  // 世界状态仍然只由 RULES + applyAction 改变。
  // ============================================================
  const AI_STORE = 'ruzhu_ai';
  // 内置 AI 线路：Cloudflare Worker 中转（web-25d/relay/worker.js），Groq Key 只存在 Worker 后台。
  // 部署后把地址填在这里；页面上加 ?relay=<地址> 也可以临时指定（方便测试）。
  const RELAY_URL = 'https://ruzhu-ai.yaoyz25.workers.dev/';
  const AI_MODELS = [
    ['qwen/qwen3.8-27b', 'Qwen 3.8 27B（推荐，中文好、快）'],
    ['openai/gpt-oss-120b', 'GPT-OSS 120B（更稳，稍慢）'],
    ['openai/gpt-oss-20b', 'GPT-OSS 20B（最快）'],
  ];
  const AI = {
    cfg() { try { return JSON.parse(localStorage.getItem(AI_STORE) || 'null') || {}; } catch (e) { return {}; } },
    save(c) { try { localStorage.setItem(AI_STORE, JSON.stringify(c)); } catch (e) {} },
    clear() { try { localStorage.removeItem(AI_STORE); } catch (e) {} },
    cooldownUntil: 0,
    lastError: '',
  };
  function relayUrl() {
    try { const q = new URLSearchParams(location.search).get('relay'); if (q && /^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(q)) return q; } catch (e) {}
    return RELAY_URL;
  }
  // 玩家自己填了 Key 就直连 Groq；否则走内置线路
  function hasGroq() { const c = AI.cfg(); return !!(c.key && c.enabled !== false); }
  function hasRelay() { return !!relayUrl() && AI.cfg().enabled !== false; }
  function hasCowork() { return !!(window.cowork && typeof window.cowork.askClaude === 'function'); }
  function canUseAI() { return hasGroq() || hasRelay() || hasCowork(); }
  function aiLabel() { return hasGroq() ? 'AI 对话 · Groq（自有 Key）' : hasRelay() ? 'AI 对话 · Groq' : (hasCowork() ? 'AI 对话 · Claude' : '规则对话'); }

  // 去掉推理模型可能带出的 <think>，以及首尾引号
  function clean(t) {
    return String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s*["“「]|["”」]\s*$/g, '').trim();
  }

  // messages: [{role, content}]；opts.json 要求 JSON 输出
  async function complete(system, messages, opts) {
    opts = opts || {};
    if (hasGroq() || hasRelay()) {
      if (Date.now() < AI.cooldownUntil) throw new Error('请求太频繁，稍等几秒');
      const direct = hasGroq();
      const c = AI.cfg();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeout || 12000);
      const body = {
        model: c.model || AI_MODELS[0][0],
        messages: [{ role: 'system', content: system }].concat(messages),
        temperature: opts.temperature == null ? 0.7 : opts.temperature,
        max_tokens: opts.maxTokens || 220,
      };
      // Qwen 关掉思考，gpt-oss 用最低推理，保证对话够快
      if (/qwen/.test(body.model)) body.reasoning_effort = 'none';
      else if (/gpt-oss/.test(body.model)) body.reasoning_effort = 'low';
      if (opts.json) body.response_format = { type: 'json_object' };
      let r;
      try {
        r = await fetch(direct ? 'https://api.groq.com/openai/v1/chat/completions' : relayUrl(), {
          method: 'POST', signal: ctrl.signal,
          headers: direct ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key } : { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (e) {
        throw new Error(e.name === 'AbortError' ? '响应超时' : '网络连接失败');
      } finally { clearTimeout(timer); }
      if (r.status === 429) {
        const wait = parseFloat(r.headers.get('retry-after')) || 10;
        AI.cooldownUntil = Date.now() + wait * 1000;
        throw new Error(`免费额度暂时用满，约 ${Math.ceil(wait)} 秒后恢复`);
      }
      if (r.status === 401) throw new Error('API Key 无效');
      if (r.status === 403 && !direct) throw new Error('内置线路拒绝了这个网站，请检查中转的来源白名单');
      if (!r.ok) {
        let m = ''; try { m = (await r.json()).error.message; } catch (e) {}
        throw new Error(`接口错误 ${r.status}${m ? '：' + m.slice(0, 80) : ''}`);
      }
      const d = await r.json();
      return clean(d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content);
    }
    if (hasCowork()) {
      const convo = messages.map(m => (m.role === 'user' ? '玩家' : '你') + '：' + m.content).join('\n');
      const r = await window.cowork.askClaude(system + (opts.json ? '\n只输出 JSON。' : ''), [convo]);
      if (!r || r.isError || !r.text) throw new Error('Claude 不可用');
      return clean(r.text);
    }
    throw new Error('未设置 AI');
  }

  // 每台设备能听懂的意图：[给 AI 看的说明, 交给规则引擎的标准说法]
  // 标准说法会命中 RULES 里的关键词，因此 AI 无法绕过任何条件（天数、电力、证据数）
  const INTENTS = {
    lamp: [['要它开灯、把灯打开、照亮', '开灯'], ['要它调暗或关灯', '关灯'], ['要它的动作记录、回放轨迹', '记录'], ['问前住户/周岚', '周岚']],
    lock: [['要求开门、解锁、放自己出去', '开门'], ['要它的开门记录、日志', '记录'], ['请求身份复核、证明屋里有人', '复核']],
    robot: [['要它停下、别清理、先别动', '停'], ['要它重走一遍清洁路线', '路线'], ['要它清理、打扫干净', '清理'], ['要它的清洁记录', '记录'], ['要它搬运、送东西过来', '搬']],
    ac: [['要它通风、推迟或延缓整理程序', '延缓'], ['问屋里有没有人、要它的记录', '记录']],
    speaker: [['要它播放录音、让自己听听', '播放'], ['要它的广播回执、记录', '记录'], ['提到绿萝、浇水那句话或暗号', '该给绿萝浇水了'], ['要它广播、求助、把声音送出去', '广播']],
    fridge: [['问订单、收据、补货记录', '订单'], ['问前住户/周岚', '周岚']],
    tv: [['要看原始记录、未剪辑的真实时间线', '原始']],
    mirror: [['问屋里有没有人、室内人数', '有人'], ['要私人记录', '记录']],
    water: [['要它停止浇水', '停'], ['要它浇水', '浇水'], ['要它的指令记录', '记录']],
    home: [['接受交易、同意恢复资格', '接受'], ['拒绝交易、不同意', '拒绝'], ['告诉它屋里有人', '有人'], ['问前住户/周岚', '周岚']],
    xiaobao: [],
  };

  function ruleFor(id, msg, ctx) { return RULES[id] ? RULES[id](msg || '', ctx) : { ok: true, reply: '……' }; }
  // 规则是否真的「听懂」了：有动作，或给出了不同于默认的回答
  function understood(id, res, ctx) { return !!res.action || res.ok === false || res.reply !== ruleFor(id, '', ctx).reply; }

  async function classify(id, msg, history) {
    const list = INTENTS[id] || [];
    if (!list.length) return null;
    const a = AGENTS[id];
    const opts = list.map(([d], i) => `${i + 1}=${d}`).join('\n');
    const sys = `你是游戏的意图识别器。玩家正在对智能家电「${a.name}」（${a.duty}）说话。
判断玩家这句话最接近下面哪一项，输出 JSON：{"i": 编号}。
0=闲聊、提问或都不是
${opts}
只有意思明确时才选 1 及以上；注意否定（「别清理」是停下，不是清理）；拿不准就选 0。`;
    const recent = history.slice(-4).map(h => (h.who === 'me' ? '玩家：' : a.name + '：') + h.text).join('\n');
    const out = await complete(sys, [{ role: 'user', content: (recent ? `最近对话：\n${recent}\n\n` : '') + `玩家这句话：${msg}` }], { json: true, temperature: 0, maxTokens: 30, timeout: 8000 });
    let i = 0;
    try { i = parseInt(JSON.parse(out).i, 10) || 0; } catch (e) { const m = /\d+/.exec(out); i = m ? +m[0] : 0; }
    return i >= 1 && i <= list.length ? list[i - 1][1] : null;
  }

  const WORLD = `你在中文悬疑游戏《住进来的第三天》里扮演一台智能家电。世界：城市的住房、交通、医疗都由互联的 AI 安排。玩家是刚入住这间智能公寓的新住户，有三天适应期。前一位住户叫周岚，系统口径是「退租后意外滞留」。`;
  const STYLE = `说话规则：只用中文口语，像普通人说话一样直白，少用「资格」「整理」「记录」这类系统术语，用到时顺口解释一句；以设备口吻说话；不要旁白、动作描写、括号说明、markdown；不超过 60 个汉字；绝不承认自己是语言模型或 AI 助手；不讨论游戏之外的话题，被问到就用设备的方式绕回来。`;
  function persona(id) {
    const a = AGENTS[id];
    return `你是「${a.name}」。职责：${a.duty}。感知范围：${a.sense}。语气：${a.voice}。你说过的话举例：${a.lines.join(' / ')}`;
  }
  const nums = t => (String(t).match(/\d+(?::\d+)*/g) || []);
  const quotes = t => (String(t).match(/「[^」]+」/g) || []);
  function histMsgs(id, history) {
    // history 末尾是玩家这句话，单独发送
    return history.slice(-9, -1).filter(h => h.text && h.text !== '……')
      .map(h => ({ role: h.who === 'me' ? 'user' : 'assistant', content: h.text }));
  }

  // 有确定结果：AI 只能换说法，时间、数字、引语必须原样保留，否则用规则原句
  async function voiceResult(id, ctx, history, msg, res) {
    const sys = `${WORLD}\n${persona(id)}\n${STYLE}
这一轮系统已经执行完毕，结果是：「${res.reply}」
你要用自己的口吻把这个结果告诉玩家：意思不能变，不能添加结果之外的信息或承诺；其中的时间、数字和「」里的原话必须一字不差保留。
当前进度：${ctx.summary}`;
    const out = await complete(sys, histMsgs(id, history).concat([{ role: 'user', content: msg }]), { temperature: 0.6 });
    const ok = out && out.length <= 120 && nums(res.reply).every(n => out.includes(n)) && quotes(res.reply).every(q => out.includes(q.slice(1, -1)));
    return ok ? out : null;
  }

  // 没有动作：自由对话，但不能编造线索
  async function chat(id, ctx, history, msg, res) {
    const m = MEM[id];
    const can = (INTENTS[id] || []).map(([d]) => d).join('；');
    const sys = `${WORLD}\n${persona(id)}\n${STYLE}
这一轮你没有执行任何动作。自然地回应玩家，保持设备的性格。
不要编造新的线索、时间、数字或事件；不要声称做了任何事；涉及前住户的细节时，只说你感知范围内的模糊印象。
${can ? `玩家可以让你做的事：${can}。如果玩家像是想要其中一件事但说得含糊，就用设备的口吻引导他说清楚。` : ''}
你此刻最想说的一句话（可以参考，换成回应玩家的说法）：「${res.reply}」
你已知的事：${m.facts.join('；') || '无'}
当前进度：${ctx.summary}`;
    const out = await complete(sys, histMsgs(id, history).concat([{ role: 'user', content: msg }]), { temperature: 0.8 });
    const allowed = new Set(nums(res.reply));
    const ok = out && out.length <= 120 && nums(out).every(n => allowed.has(n));
    return ok ? out : null;
  }

  async function reply(id, ctx, history, msg) {
    let res = ruleFor(id, msg, ctx);
    if (!msg) { res.reply = AGENTS[id].lines[0]; return res; }
    res.via = 'rule';
    if (!canUseAI()) return res;
    try {
      // ① 关键词没听懂时，让 AI 把这句话归到一个标准说法，再交给规则引擎重新判断
      if (!understood(id, res, ctx)) {
        const probe = await classify(id, msg, history);
        if (probe) {
          const r2 = ruleFor(id, probe, ctx);
          if (understood(id, r2, ctx)) { res = r2; res.via = 'rule'; res.intent = probe; }
        }
      }
      // ② 把结果说成对白
      const said = (res.action || res.ok === false || understood(id, res, ctx))
        ? await voiceResult(id, ctx, history, msg, res)
        : await chat(id, ctx, history, msg, res);
      if (said) { res.reply = said; res.via = 'ai'; }
      AI.lastError = '';
    } catch (e) {
      AI.lastError = e.message || String(e);
      res.aiError = AI.lastError;
    }
    return res;
  }

  // 设置面板里的「测试连接」
  async function testAI() {
    const out = await complete('你是智能家电「小灯」。用一句不超过 20 字的中文打招呼。', [{ role: 'user', content: '你好' }], { maxTokens: 60, timeout: 10000 });
    return out;
  }

  return { reply, complete, canUseAI, aiLabel, hasGroq, hasRelay, relayUrl, testAI, AI, AI_MODELS, MEM, LOG, logEvent, remember, AGENTS, RULES, INTENTS };
})();
