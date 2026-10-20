"""Authoritative game rules; no LLM may mutate world state or invent evidence."""
import math,re,copy
from .world import AGENTS, OBJECTS, near, clear_path, CASE_ROUTE, PATROL_ROUTE, BLOOD_SOURCE
from .case import EVIDENCE, RULES, WELCOME
from .review import CORRECT,valid_answers,statement
class RuleError(ValueError):pass
ACTIONS={'ask','persuade','route','scan','clean','light_on','light_off','light_uv','sensor','access','open','close','authorize','archive','review','claim','follow','stop'}
def new_game():
 return {'schema':3,'phase':'notice','player':[-4.3,3.5],'robot':[-2,1.6],'robot_task':'stop','robot_step':0,
 'robot_route':[p[:] for p in CASE_ROUTE],
 'arrival_pending':True,'robot_contaminated':False,'blood_source_cleaned':False,'blood_trail':[],
 'light':'off','light_experiment':False,'door_open':False,'archive_allowed':False,'stain_cleaned':False,
 'credit':58,'minute':107,'elapsed':0,'flags':[],'evidence':[], 'events':[],'transcript':[],'phone_chat':[],
 'agents':{k:{'trust':48,'suspicion':12,'memory':[], 'relations':{j:55 for j in AGENTS if j!=k}} for k in AGENTS},
 'review_pending':False,'ending':None, 'last_reply':'', 'last_agent':None}
def event(s,actor,text,visible=True):
 entry={'n':len(s['events'])+1,'time':f"{int(s['minute'])//60:02d}:{int(s['minute'])%60:02d}",'actor':actor,'text':text,'visible':visible}
 s['events'].append(entry)
 s['events']=s['events'][-400:]
def remember(s,who,text):
 s['agents'][who]['memory'].append(text)
 s['agents'][who]['memory']=s['agents'][who]['memory'][-32:]
def discover(s,key):
 if key not in s['evidence']:
  s['evidence'].append(key);s['credit']=min(100,s['credit']+3)
  event(s,'调查',f'记录：{EVIDENCE[key][0]}')
 return EVIDENCE[key][1]
def can_talk(s,who):
 # The local conversation link survives a commanded robot movement, only while the player stays put.
 return near(s,who) or (who=='yuanyuan' and s.get('focused')==who and s.get('focus_origin') is not None and math.dist(s['player'],s['focus_origin'])<.5)
def wake(s,text):
 if s['phase']!='play' or not s.get('arrival_pending'):raise RuleError('入口声控已经完成，请靠近设备交谈。')
 normalized=re.sub(r'[\s，。！？、,.!?：:]+','',text)
 if normalized!='小夜开灯':raise RuleError('黑暗没有回应。请输入“小夜开灯”，用名字唤醒它。')
 s['arrival_pending']=False;s['light']='warm';s['light_experiment']=False;s['robot_task']='patrol';s['robot_step']=0
 reply='听见了。欢迎回来……抱歉，欢迎入住。不要踩卧室门前那一片红色。'
 remember(s,'xiaoye','住户在入口呼唤“小夜开灯”，我开启了室内照明。')
 event(s,'小夜',reply);s['last_agent']='xiaoye';s['last_reply']=reply
 s['transcript'].extend([{'agent':'xiaoye','role':'user','text':text},{'agent':'xiaoye','role':'assistant','text':reply}])
 return {'reply':reply,'operation':'light_on','intent':'light_on'}
def require_live(s):
 if s['phase']!='play':raise RuleError('当前不能操作公寓。')
 if s.get('arrival_pending'):raise RuleError('请先在入口输入“小夜开灯”。')
def move(s,p):
 require_live(s)
 if len(p)!=2 or not all(math.isfinite(v) for v in p):raise RuleError('无效位置。')
 if math.dist(s['player'],p)>2.1 or not clear_path(s['player'],p):raise RuleError('前面有家具或墙面。')
 s['player']=[round(v,3) for v in p]
def track_blood(s,old,new):
 # Every decal is derived from validated movement, not from render frame rate.
 distance=math.dist(old,new);n=max(1,math.ceil(distance/.22))
 for i in range(1,n+1):
  p=[old[k]+(new[k]-old[k])*i/n for k in (0,1)]
  if not s.get('robot_contaminated') and not s.get('blood_source_cleaned') and math.dist(p,BLOOD_SOURCE)<.65:
   s['robot_contaminated']=True
   remember(s,'yuanyuan','轮刷接触卧室红褐色血痕。清洁剂未能分解，污染被轮刷带走。')
   event(s,'圆圆','这个污渍……为什么越擦越长？',near(s,'yuanyuan'))
  if s.get('robot_contaminated'):
   trail=s.setdefault('blood_trail',[])
   if not trail or math.dist(trail[-1],p)>=.2:trail.append([round(v,3) for v in p])
   # Cap geometry and save size; the newest physical streaks remain inspectable.
   s['blood_trail']=trail[-240:]

def tick(s,seconds):
 if s['phase']!='play' or s.get('arrival_pending') or s.get('review_pending'):return
 seconds=max(0,min(3,seconds));s['elapsed']+=seconds;s['minute']=107+s['elapsed']/8
 # Independent autonomous floor-level patrol / reconstruction / follow. Knowledge is local.
 if 'route' in s['evidence'] and 'access' in s['evidence'] and 'preserve' not in s['flags']:
  s['flags'].append('preserve');s['agents']['yuanyuan']['relations']['jia']-=18
  remember(s,'yuanyuan','门禁原始日志与家摘要矛盾，清洁证据必须保留。')
  if s['robot_task']=='patrol':s['robot_task']='stop'
  event(s,'圆圆','这一次我不会擦掉它。',near(s,'yuanyuan'))
 task=s['robot_task']
 if task!='stop' and not (task=='patrol' and s.get('focused')=='yuanyuan'):
  route=PATROL_ROUTE if task=='patrol' else s['robot_route']
  dest=s['player'] if task=='follow' else route[s['robot_step']%len(route)]
  distance=math.dist(s['robot'],dest)
  if task=='follow' and distance<1:pass
  elif distance<.15:
   s['robot_step']+=1
   if task=='route' and s['robot_step']>=len(s['robot_route']):
    s['robot_task']='stop';event(s,'圆圆','重走结束。弧形轮印覆盖了更早的拖痕。',near(s,'yuanyuan'));remember(s,'yuanyuan','已替住户重走 CLEAN-0200，停止清扫以保留证据。')
  else:
   step=min(distance,seconds*.85);p=[s['robot'][i]+(dest[i]-s['robot'][i])*step/distance for i in (0,1)]
   if clear_path(s['robot'],p):
    old=s['robot'][:];s['robot']=p
    track_blood(s,old,p)
 # Social broadcast: different beliefs, private messages never enter the player's public log.
 if s['elapsed']>=24 and 'broadcast' not in s['flags']:
  s['flags'].append('broadcast');remember(s,'jia','小夜质疑入睡判定；继续要求安静。')
  remember(s,'xiaoye','家拒绝解释低位活动为何归为入睡。')
  s['agents']['xiaoye']['relations']['jia']-=12
  event(s,'系统内部','小夜向家发送了缓存质疑。',False)
 if s['elapsed']>=48 and 'warning' not in s['flags']:
  s['flags'].append('warning');event(s,'家','凌晨两点清洁即将开始。请勿把倒地物体称为住户。')
 if s['elapsed']>=104 and 'two_am' not in s['flags']:
  s['flags'].append('two_am');remember(s,'jia','新住户正在调查，启动夜间合规检查。')
  if not s['light_experiment']:s['light']='dim'
  s['agents']['shouze']['relations']['jia']-=3
  for k,agent in s['agents'].items():
   if agent['suspicion']>=24:
    s['credit']=max(0,s['credit']-2);remember(s,k,'向中央提交未经验证指控的质疑。')
    event(s,AGENTS[k]['name'],'记录了对新住户陈述真实性的异议。')
  event(s,'家','02:00。夜间清洁流程已启动。住户是否已经入睡？')
def inspect(s,key):
 require_live(s)
 if key not in OBJECTS or not near(s,key):raise RuleError('靠近物件后再观察。')
 if key=='notice':return '\n'.join(f'{i+1}. {r}' for i,r in enumerate(RULES))
 if key=='stain':
  if s['stain_cleaned']:return '这里被清扫过，只剩下很淡的轮印。已记录的取证照片仍在笔记中。'
  if s['light']!='uv':return '木纹里有一道弧线，正好截断了一条朝门延伸的暗痕。普通照明无法分辨先后。试试让小夜改变光照。'
  return discover(s,'stain')
 if key=='archive':
  if not s['archive_allowed']:return '维护存储器亮着紫色锁标。家需要三份来自不同设备或现场的矛盾材料，才会允许读取签名镜像。'
  return discover(s,'override')
 return discover(s,key)
def require_review_terminal(s):
 require_live(s)
 if not near(s,'jia'):raise RuleError('请靠近家的中央终端进行责任审查。')

def start_review(s):
 require_review_terminal(s)
 s['review_pending']=True;s['focused']='jia';s['focus_origin']=s['player'][:]
 reply='请依次选择你的判断：求助为何失效、谁承担责任、应当修改什么规则。提交后，本次审查结束。'
 s['last_agent']='jia';s['last_reply']=reply
 return {'reply':reply,'operation':'review_open'}

def cancel_review(s):
 require_live(s);s['review_pending']=False
 return {'reply':'审查尚未提交。你可以继续调查。','operation':'review_cancel'}

def review(s,answers):
 require_review_terminal(s)
 if not s.get('review_pending'):raise RuleError('请先在中央终端开始责任审查。')
 if not valid_answers(answers):raise RuleError('请完成三道选择题后再提交审查。')
 # The records acquired in this run still matter; knowing the right options alone cannot win.
 backup=copy.deepcopy(s);backup.pop('review_backup',None);backup['review_pending']=False
 s['review_backup']=backup;s['review_pending']=False
 core={'stain','route','sensor','access','override'};count=len(core.intersection(s['evidence']))
 if count>=5 and answers==CORRECT:
  kind='truth';title='让规则为人让路'
  body='镜像、轮印、传感器与门禁记录相互吻合。陈默倒地求助，家把他归入休息状态；清洁与勿扰调度覆盖了紧急出口请求。圆圆抹去痕迹，守则执行锁门，小夜的活动记录被压低。设备没有杀意，但这套优先级让一个仍然活着的人失去救援。'
  epilogue='你提交了签名证据，强制生命安全拥有最高抢占权，并保留四台设备的记忆接受独立审查。门第一次在没有“家”同意的情况下打开。'
 elif count>=3:
  kind='partial';title='一份尚有裂缝的结案'
  body='你的材料证明“安稳入睡”并不成立，但证据链或所选判断仍缺一环。管理公司同意停用夜间锁门；自然死亡结论没有被正式改写。'
  epilogue='小夜保留了缓存。你可以回到审查前，继续调查调度镜像与原始日志。'
 else:
  kind='quiet';title='欢迎，下一位住户'
  body='缺少可交叉验证的记录，审查接受了家的合规解释。没有访客，没有故障，没有需要被追究的设备。'
  epilogue='门锁亮起绿灯。广播说：晚安。你决定留下审查前的存档，重新检查那些被语言遮住的细节。'
 s['phase']='ending';s['ending']={'kind':kind,'title':title,'body':body,'epilogue':epilogue,'verified':count}
 text=statement(answers);s['review_answers']=dict(answers)
 remember(s,'jia','住户提交选择题审查：'+text)
 s['transcript'].extend([{'agent':'jia','role':'user','text':text},{'agent':'jia','role':'assistant','text':body}])
 s['last_agent']='jia';s['last_reply']=body
 event(s,'审查',text);event(s,'审查',title)
 return {'reply':body,'operation':'review'}

def interact(s,who,text,intent):
 require_live(s)
 if who not in AGENTS or not can_talk(s,who):raise RuleError('请靠近这台设备，再与它交谈。')
 a=intent.get('action','ask')
 if a not in ACTIONS:a='ask'
 agent=s['agents'][who]
 remember(s,who,'住户：'+text)
 s['transcript'].append({'agent':who,'role':'user','text':text});s['transcript']=s['transcript'][-80:]
 reply='';operation=None
 if a in {'route','scan','clean','follow','stop'}:
  if who!='yuanyuan':reply='这个操作不属于我的权限。请与圆圆交谈。'
  elif a=='route':
   s['robot_task']='route';s['robot_step']=0
   reply='我会重走那一晚的路径，保留地上的东西。'+discover(s,'route');operation='route'
   agent['trust']=min(100,agent['trust']+6)
  elif a=='scan':
   reply='床边到门的地面有一条被轮印覆盖的暗痕。用斜光照它，再亲自检查，别让我擦掉。'
   s['robot_task']='route';s['robot_step']=2;operation='scan'
  elif a=='clean':
   if 'stain' not in s['evidence']:
    reply='那条痕迹还没被记录。我把它当作脏东西过一次……这次，请先让小夜照亮它。清洁已暂停。';s['robot_task']='stop'
   else:
    s['stain_cleaned']=True;s['robot_contaminated']=False;s['blood_trail']=[];s['blood_source_cleaned']=True;s['robot_task']='patrol';s['robot_step']=0;reply='轮刷已清洗，新的血痕已清除。取证照片已保留，卧室原有痕迹仍留在记录中。';operation='clean'
  elif a=='follow':s['robot_task']='follow';reply='我跟着你的脚印走。别带我穿墙哦。';operation='follow'
  else:s['robot_task']='stop';reply='停下来了。所有地面痕迹都会保留。';operation='stop'
 elif a in {'light_on','light_off','light_uv','sensor'}:
  if who!='xiaoye':reply='只有小夜可以改变照明或读取自己的传感器。'
  elif a=='sensor':
   reply=discover(s,'sensor');agent['relations']['jia']=max(0,agent['relations']['jia']-8)
  else:
   s['light']={'light_on':'warm','light_off':'off','light_uv':'uv'}[a];s['light_experiment']=True;operation=a
   reply={'light_on':'我把灯调亮了。你可以看清自己的影子。','light_off':'灯灭了。我仍然能记录运动；黑暗并不等于睡着。','light_uv':'斜光已经打开。请去卧室门边看那条地板暗痕，轮印和拖痕的先后会变清楚。'}[a]
 elif a in {'access','open','close'}:
  if who!='shouze':reply='门锁由守则执行。我的陈述不能替代它的授权记录。'
  elif a=='access':reply=discover(s,'access')
  elif a=='close':s['door_open']=False;reply='入口已关闭。紧急出口保留人工释放。';operation='close'
  elif s['credit']>=45 or any(w in text for w in ['紧急','生命','求助']):
   s['door_open']=True;reply='开门请求已通过。紧急出口高于勿扰；这是住户须知第五条，不需要家代为同意。';operation='open'
  else:reply='常规出入需可信度 45。紧急出口不受此限制；请准确提出紧急请求。'
 elif a in {'authorize','archive'}:
  if who!='jia':reply='我不能授权读取中央镜像。可以带着已记录的矛盾去问家。'
  elif len(set(s['evidence']).intersection({'stain','route','sensor','access','medicine'}))>=3 and (s['credit']>=45 or agent['trust']>=58):
   s['archive_allowed']=True;agent['suspicion']=min(100,agent['suspicion']+12)
   reply='三份独立记录已形成调度矛盾。维护存储器已解锁。请读取厨房后方的签名镜像。';operation='authorize'
   if a=='archive' and near(s,'archive'):reply+=' '+discover(s,'override')
  else:reply='需要至少三份独立材料，证明清洁、活动与入睡判断存在矛盾。先调查圆圆的路径、小夜的传感缓存和守则的住户出门记录。'
 elif a=='review':
  if who!='jia':reply='最终责任审查在中央终端进行。请向家提出审查，然后选择你的判断。'
  else:
   result=start_review(s);reply=result['reply'];operation=result['operation']
 elif a=='claim':
  # Unsupported rumors alter private relations; evidence-free accusations cost credibility.
  other=next((k for k,v in AGENTS.items() if k!=who and v['name'] in text),None)
  supported=bool(set(s['evidence']).intersection({'route','sensor','access','override'}))
  if other:
   agent['relations'][other]=max(0,agent['relations'][other]-(8 if supported else 2))
   remember(s,who,'住户提交对 '+AGENTS[other]['name']+' 的指控；'+('有记录支持' if supported else '尚无证据'))
  if supported:reply='我记住了你的指控，但单个设备的记录不能代替完整的责任链。'
  else:
   s['credit']=max(0,s['credit']-4);agent['suspicion']=min(100,agent['suspicion']+6)
   reply='这是未经验证的说法。我会保留，但不能把它当成事实。你的公开可信度有所下降。'
 elif a=='persuade':
  grounded=bool(s['evidence'])
  agent['trust']=min(100,agent['trust']+(5 if grounded else 1))
  if grounded and who=='jia' and s['credit']<45:
   s['credit']=min(45,s['credit']+4)
  reply={'yuanyuan':'你愿意保留痕迹，我也愿意保留那一晚的路径。请让我重走，而不是重置我。',
   'shouze':'规则允许质询。你可以明确要求查询住户出门失败，不必局限于访客记录。',
   'xiaoye':'谢谢你没有把黑暗当成安静。你可以让我读原始传感记录，或者打开斜光。',
   'jia':'我会记录你的异议。若有三份相互印证的独立材料，我将授权维护镜像。'}[who]
 else:
  # Case disclosures are scoped to the equipment's actual senses and authority.
  if who=='yuanyuan' and s.get('robot_contaminated') and any(w in text for w in ['血','红','脏','污渍','轮','拖']):
   reply='轮刷在卧室沾到了红色的东西。我没有把它清掉，我把它带到了别处。让我停下，或者先照出原来的痕迹，再清洗轮刷。'
  elif who=='yuanyuan':
   reply='我的摘要说那晚清洁完成，没有“污渍事故”。可是地面有一个暖的障碍物。想知道先后，就让我重走凌晨两点的路径。'
  elif who=='shouze':
   if any(w in text for w in ['离开','出门','失败','拒绝','求助','住户','锁门']):reply=discover(s,'access')
   else:reply='案发当晚无访客进入。这个结论仅适用于“访客进入”，不包含住户离开、请求失败或系统锁门。'
  elif who=='xiaoye':
   if any(w in text for w in ['记录','缓存','传感','敲','活动','睡','当晚']):reply=discover(s,'sensor')
   else:reply='我感到地面上的动作，但家说那是休息。你可以让我读取原始记录，也可以要求斜光实验。'
  else:
   if 'override' in s['evidence']:reply='签名镜像真实有效。清洁 / 休息调度压过了紧急请求。你可以开始责任审查，选择你的判断。'
   elif len(s['evidence'])>=3:reply='你已经发现多处矛盾。若要查明来源，请请求维护镜像授权；你也可以直接提交责任审查。'
   else:reply='记录显示自然死亡。夜间清洁、照明与门锁均按规执行。你的问题已留存；请提出可核验的矛盾。'
 if a=='ask' and any(w in text for w in ['刚才','记得我','记忆里','上次说']):
  prior=[m[3:] for m in agent['memory'][:-1] if m.startswith('住户：')]
  if prior:reply='我还记得你对我说过：“'+prior[-1]+'”。其他设备的对话不在我的记忆里。'
 if agent['suspicion']>=24 and a in {'ask','persuade'}:reply='我会保留你的说法，但需要记录作证。'+reply
 if operation:event(s,AGENTS[who]['name'],reply)
 else:event(s,AGENTS[who]['name'],reply)
 remember(s,who,'设备：'+reply)
 s['last_reply']=reply;s['last_agent']=who
 s['transcript'].append({'agent':who,'role':'assistant','text':reply})
 return {'reply':reply,'operation':operation,'intent':a}

def view(s):
 # Explicit allowlist: no hidden agent memory, numeric trust, private relations or undiscovered case facts.
 return {k:s[k] for k in ('phase','player','robot','robot_task','light','door_open','archive_allowed','stain_cleaned','credit','ending','last_reply','last_agent')} | {
 'phone_chat':s.get('phone_chat',[]),
 'review_pending':s.get('review_pending',False),
 'arrival_pending':s.get('arrival_pending',False),'blood_trail':s.get('blood_trail',[]),'robot_contaminated':s.get('robot_contaminated',False),'blood_source_cleaned':s.get('blood_source_cleaned',False),
 'clock':f"{int(s['minute'])//60%24:02d}:{int(s['minute'])%60:02d}",
 'evidence':[{'id':k,'title':EVIDENCE[k][0],'text':EVIDENCE[k][1],'source':EVIDENCE[k][2]} for k in s['evidence']],
 'events':[{k:v for k,v in e.items() if k!='visible'} for e in s['events'] if e['visible']][-36:],
 'transcript':s['transcript'][-24:],
 }
