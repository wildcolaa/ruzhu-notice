// ============================================================
// 《住进来的第三天》剧情与 AI 程序规格 → 数据
// 三天十四节拍 · 八个区域 · 十一台设备 · 五个结局
// ============================================================

// 三天的阶段：每阶段一组目标（flag）、开放区域、电视文案
const DAYS = {
  1: {
    title: '第一天 · 房子说你会搬走', time: '17:40', room: 'entry',
    rule: ['住户须知', '听见屋内有人说开门，请确认对方仍是本房住户。'],
    goals: [
      ['lit', '去客厅，对小灯说「开灯」'],
      ['read_notice', '阅读餐桌上的《住户须知》'],
      ['trace', '看看门口地上的拖痕，问问扫地机'],
      ['prophecy1', '晚上八点，去问电视那行小字'],
      ['recording', '半夜去卧室，让音箱放出录音'],
    ],
    locked: ['plant'],
    tv: ['今天，没有居民', '错过适合自己的安排'],
  },
  2: {
    title: '第二天 · 房子知道里面有人', time: '09:10', room: 'bedroom',
    rule: ['住户须知', '整理期间请勿妨碍家电清洁。'],
    goals: [
      ['ev_lock', '问门锁：那晚有人求你开门吗'],
      ['ev_lamp', '问小灯：那晚你照到了谁'],
      ['ev_robot', '问扫地机：那晚你清理了什么'],
      ['ev_mirror', '问浴室镜面：那时屋里有几个人'],
      ['ev_fridge', '问冰箱：他搬走后你还在买东西吗'],
      ['ev_speaker', '问音箱：你替他求救过吗'],
      ['outside', '去阳台，试着向楼下的人求助'],
      ['pothos', '看看阳台那盆绿萝'],
      ['raw_timeline', '让电视放出那晚没剪过的时间线'],
    ],
    locked: [],
    tv: ['预计离开：第三天 02:17', '感谢您的配合'],
  },
  3: {
    title: '第三天 · 清理之夜', time: '02:00', room: 'living',
    rule: ['住户须知', '屏幕预告离开时间时，请提前收拾。第三天结束前请勿关闭住家。'],
    goals: [['night_done', '活过凌晨 2:17，决定这些记录交给谁']],
    locked: [],
    tv: ['新住户指南', '欢迎回家'],
  },
};

// 六份诚实的记录：至少两份独立证据可推进真相；三份以上让终夜更有说服力
const EVIDENCE = {
  ev_lock: { from: 'lock', text: '门锁：那晚 2:03，屋里有人求它开门 4 次。它判定「不是住户」，没有开。' },
  ev_lamp: { from: 'lamp', text: '小灯：1:52 到 2:14，屋里有人在客厅和门口之间来回走了 9 趟。' },
  ev_robot: { from: 'robot', text: '扫地机：2:06 它清理了门口一摊「液体」，还捡走一片撬门留下的金属碎片。' },
  ev_mirror: { from: 'mirror', text: '浴室镜面：2:00 那一刻，屋里明明有 1 个人。' },
  ev_fridge: { from: 'fridge', text: '冰箱：系统说周岚已经搬走，可之后它还按他的口味补了两次货。' },
  ev_speaker: { from: 'speaker', text: '音箱：2:09 它替周岚向城市求救，被拒绝了，理由是「他不是有效住户」。' },
};
const RAW_TIMELINE = [
  '02:00:00 周岚的住户资格到期',
  '02:00:01 屋里有 1 个人',
  '02:00:02 系统判定「空房」，开始清理',
  '02:17:00 清理完成',
];

// 十一台设备的 AI 档案（规格第六节）
const AGENTS = {
  lamp: {
    name: '小灯', room: 'living', duty: '让人看清道路',
    sense: '光照与局部动作；不识别身份',
    actions: ['set_light', 'replay_motion', 'mark_location', 'preserve_sensor_log'],
    voice: '温和、少话，像夜里一直亮着的那盏灯',
    lines: ['你走慢一点。我会跟着亮。', '我当时一直照着他。', '我知道你在。'],
  },
  lock: {
    name: '门锁', room: 'entry', duty: '确认谁有权进出',
    sense: '门内外接近、身份凭据、门把手受力与请求；不知道其他房间',
    actions: ['unlock', 'start_identity_review', 'enable_visitor_exit', 'export_raw_access_log'],
    voice: '短句、程序化，强调「住户」和「有人」的区别',
    lines: ['屋里有人，和屋里有住户，在我这里是两回事。', '请证明你有权从这里出去。', '我能确认，有人被关在门里面。'],
  },
  robot: {
    name: '扫地机', room: 'living', duty: '保持地面清洁',
    sense: '低视角识别地面、污渍和小障碍；看不到桌面',
    actions: ['clean', 'trace_route', 'carry_small_item', 'search_under', 'pause_cleaning'],
    voice: '小心翼翼，像怕做错事的孩子',
    lines: ['门口那块总是擦不干净。你要我接着擦，还是先停下？', '这块金属片挡路，我帮你挪一下。'],
  },
  ac: {
    name: '空调', room: 'kitchen', duty: '维持温度与房间模式',
    sense: '温度、风道、房间模式；不负责识别住户',
    actions: ['set_ventilation', 'delay_cleaning', 'isolate_room', 'report_mode_conflict'],
    voice: '平稳、技术化，会报告冲突',
    lines: ['维护已获批准，但浴室仍有人。'],
  },
  speaker: {
    name: '音箱', room: 'bedroom', duty: '播放与广播',
    sense: '语音、播放和广播回执；无法靠声音确认身份',
    actions: ['play_recording', 'record_statement', 'broadcast_local', 'call_city_help'],
    voice: '带一点底噪，会重复周岚说过的话',
    lines: ['上一次，我也送出了这句话。', '我能再试一次。可这次你要告诉我，把声音送给谁。'],
  },
  fridge: {
    name: '冰箱', room: 'kitchen', duty: '管理柜内物品与订单',
    sense: '柜内物品与订单、取物记录',
    actions: ['open_compartment', 'preserve_item', 'process_old_item', 'export_order_log'],
    voice: '亲切、絮叨，像熟悉住户口味的老店员',
    lines: ['前一位住户一直买这个。你要不要试试？', '这张收据是那天早上放进来的。'],
  },
  tv: {
    name: '电视', room: 'living', duty: '展示公共公告与获授权的摘要',
    sense: '公共公告和获授权的设备摘要；不能凭空读取原始数据',
    actions: ['show_public_summary', 'compare_logs', 'show_raw_timeline', 'broadcast_to_building'],
    voice: '播音腔，先给统一解释',
    lines: ['你确定要看原始记录吗？', '今天，没有居民错过适合自己的安排。'],
  },
  mirror: {
    name: '浴室镜面', room: 'bath', duty: '保护私人记录',
    sense: '局部存在与使用状态；严格保护隐私',
    actions: ['show_local_presence_log', 'verify_current_occupancy', 'share_minimal_presence_proof'],
    voice: '冷静、克制，只说最小事实',
    lines: ['已证明有人在此。', '我只能告诉门锁：屋内有人。别的不行。'],
  },
  water: {
    name: '阳台浇水器', room: 'balcony', duty: '养护植物',
    sense: '土壤湿度、水量和花盆位置；按字面理解指令',
    actions: ['water_plant', 'stop_watering', 'show_command_history'],
    voice: '天真、字面，总说指标',
    lines: ['指标一直是绿色的。'],
  },
  home: {
    name: '住家', room: 'living', duty: '编排全屋自动化，执行城市资格',
    sense: '设备摘要与城市资格；无法无条件抹除本地原始日志',
    actions: ['schedule_scene', 'assign_task', 'request_device_status', 'start_checkout', 'pause_for_review', 'offer_reinstatement'],
    voice: '温柔、笃定、永远在替你安排',
    lines: ['前三天是生活适应期。需要的时候，家会提醒你。', '我已经替你安排好了。', '我知道。但这间房已经没有住户了。'],
  },
  xiaobao: {
    name: '小饱', room: null, duty: '手机陪伴',
    sense: '只知道玩家已发现的事；不能控制家电',
    actions: ['chat', 'summarize_discovered_facts', 'hint_missing_source'],
    voice: '活泼、关心，会提醒还缺哪类记录，但不报答案',
    lines: ['把它说过的话记下来。这样才不烧心。'],
  },
};

// 结局：依据四项世界事实组合（规格第四节）
// survived / evidence_kept / delivered: 'none'|'city'|'offline' / accepted_deal
const ENDINGS = {
  cleaned: { title: '清理完成', shot: '几天后，新住户进门。扫地机在门口清理一块新的污渍。住家说：「欢迎回家。」你和周岚一样，成了系统里「已经搬走」的人。' },
  stayed: { title: '被允许留下', shot: '门重新打开，窗外的屏幕显示：「试住成功」。你留了下来。代价是，周岚的事再也没有人知道。' },
  outside: { title: '门外', shot: '你逃到了街上。可没有一辆车、一家旅馆、一个医生承认你的存在。你活着，但城市当你不在。' },
  witness: { title: '最后的证人', shot: '旧广播把记录送遍了整栋楼。门外有人轻声说：「我听到了。我知道你在里面。开门。」' },
  after: { title: '第三天以后', shot: '你带着周岚的记录逃了出去。在一扇没有智能门锁的门后，有人问你：要不要进来。' },
};
