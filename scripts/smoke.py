"""Black-box complete-playthrough against a running service, in its own cookie session."""
import math,os
import httpx
BASE=os.getenv('GAME_URL','http://127.0.0.1:8765')
c=httpx.Client(base_url=BASE,timeout=20)
s=c.post('/api/new').json();modes=[]
def act(kind,**kw):
 global s
 r=c.post('/api/action',json={'kind':kind,'revision':s['revision'],**kw});r.raise_for_status();d=r.json();s=d['state'];return d
act('accept')
assert s['arrival_pending'] and s['light']=='off'
act('wake',text='小夜开灯')
assert not s['arrival_pending'] and s['light']=='warm'
def walk(points):
 for dest in points:
  start=s['player'];n=max(1,math.ceil(math.dist(start,dest)/1.5))
  for i in range(1,n+1):act('move',position=[start[k]+(dest[k]-start[k])*i/n for k in [0,1]])
def say(who,text):
 d=act('talk',target=who,text=text);modes.append(d.get('mode'));return d
walk([[-4.3,1.5],[-4.3,-.4],[-4.3,-1.5]])
act('inspect',target='medicine')
walk([[-4.3,-.6],[-2.5,-.5],[-2.5,1.4]])
say('yuanyuan','重走凌晨两点的路径，保留痕迹')
before=s['robot'][:]
for _ in range(4):act('tick',seconds=2)
assert math.dist(before,s['robot'])>.1
walk([[-2.3,-.5],[-.6,-.5],[.4,-1.8],[.4,-3.3]])
say('xiaoye','请读原始传感记录');say('xiaoye','打开斜光实验')
assert s['light']=='uv'
walk([[.4,-1.8],[-.6,-.5],[-3,-.5]])
act('inspect',target='stain')
walk([[-4,-.5],[-4,1.5],[-5.2,2.5],[-6,3]])
say('shouze','那晚的住户出门失败记录是什么？');say('shouze','请打开紧急出口')
assert s['door_open']
walk([[-4.5,2],[-4,1.5],[-2,1.5],[-.8,1.5],[2,1.5],[3.6,1.1],[4,-1],[5.8,-2.5]])
say('jia','请授权维护镜像')
assert s['archive_allowed']
walk([[5.2,-2.9]])
act('inspect',target='archive')
core={'stain','route','sensor','access','override'}
assert core.issubset({e['id'] for e in s['evidence']})
r=c.post('/api/save',json={'slot':1,'name':'完整证据 · 审查前'});r.raise_for_status()
say('jia','我要进行责任审查')
assert s['phase']=='play'
assert s['review_pending']
act('review_submit',target='jia',answers={'cause':'sleep_mapping','responsibility':'shared_system','remedy':'safety_first'})
assert s['ending']['kind']=='truth',s.get('ending')
act('rewind');assert s['phase']=='play'
r=c.post('/api/load',json={'slot':1});r.raise_for_status();s=r.json()
assert len(s['evidence'])==6 and s['phase']=='play'
public=str(s)
assert not any(k in public for k in ['suspicion','relations','review_backup','GROQ_API_KEY'])
print('PASS: 实际 HTTP 服务完成入住、碰撞移动、六份取证、三维操作状态、责任结局、回溯与读档。')
print('Dialogue modes:',dict((m,modes.count(m)) for m in set(modes)))
c.close()
