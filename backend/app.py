import asyncio,json,os,secrets,sqlite3,time
from collections import defaultdict
from contextlib import contextmanager,asynccontextmanager
from pathlib import Path
from typing import Literal
from dotenv import load_dotenv
from fastapi import FastAPI,Request,Response,HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel,Field,ConfigDict
from . import engine
from .world import AGENTS,OBJECTS,SOLIDS
from .case import RULES,WELCOME
from .dialogue import interpret,express
from .phone import chat as phone_chat,PHONE_DESCRIPTOR
from .speech import transcribe,SpeechError,MAX_AUDIO_BYTES
from .review import QUESTIONS
ROOT=Path(__file__).resolve().parents[1]
load_dotenv(ROOT/'.env')
DB_PATH=os.getenv('DATABASE_PATH',str(ROOT/'data/games.sqlite3'))
locks=defaultdict(asyncio.Lock)
speech_locks=defaultdict(asyncio.Lock)
@contextmanager
def db():
 Path(DB_PATH).parent.mkdir(parents=True,exist_ok=True)
 conn=sqlite3.connect(DB_PATH,timeout=15)
 conn.execute('PRAGMA journal_mode=WAL')
 conn.execute('CREATE TABLE IF NOT EXISTS sessions(owner TEXT PRIMARY KEY, state TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0)')
 conn.execute('CREATE TABLE IF NOT EXISTS saves(owner TEXT NOT NULL, slot INTEGER NOT NULL, name TEXT NOT NULL, state TEXT NOT NULL, updated REAL NOT NULL, PRIMARY KEY(owner,slot))')
 try:yield conn;conn.commit()
 except Exception:conn.rollback();raise
 finally:conn.close()
def owner(request,response):
 token=request.cookies.get('ruzhu_session','')
 if len(token)!=48 or any(c not in '0123456789abcdef' for c in token):
  token=secrets.token_hex(24);response.set_cookie('ruzhu_session',token,httponly=True,samesite='strict',max_age=86400*365)
 return token
def read(token):
 with db() as c:r=c.execute('SELECT state,revision FROM sessions WHERE owner=?',(token,)).fetchone()
 if not r:raise HTTPException(404,'尚未入住。请开始新游戏。')
 return json.loads(r[0]),r[1]
def write(token,s,rev):
 with db() as c:
  cursor=c.execute('UPDATE sessions SET state=?,revision=revision+1 WHERE owner=? AND revision=?',(json.dumps(s,ensure_ascii=False),token,rev))
  if not cursor.rowcount:raise HTTPException(409,'记录已更新。请重试。')
def slot_write(token,slot,name,s):
 with db() as c:c.execute('INSERT OR REPLACE INTO saves VALUES(?,?,?,?,?)',(token,slot,name,json.dumps(s,ensure_ascii=False),time.time()))
def payload(s,rev):return {'revision':rev,**engine.view(s)}
class Action(BaseModel):
 model_config=ConfigDict(extra='forbid')
 kind:Literal['accept','wake','phone','move','tick','inspect','talk','greet','leave','rewind','review_open','review_submit','review_cancel']
 target:str=''
 text:str=Field(default='',max_length=800)
 position:list[float]=Field(default_factory=list,max_length=2)
 seconds:float=Field(default=2,ge=0,le=3)
 revision:int=Field(ge=0)
 answers:dict[str,str]=Field(default_factory=dict,max_length=3)
class Save(BaseModel):
 model_config=ConfigDict(extra='forbid')
 slot:int=Field(ge=1,le=3)
 name:str=Field(default='手动存档',max_length=40)
class Load(BaseModel):
 model_config=ConfigDict(extra='forbid')
 slot:int=Field(ge=0,le=3)
@asynccontextmanager
async def lifespan(app):
 with db():pass
 yield
app=FastAPI(title='入住须知',lifespan=lifespan)
@app.middleware('http')
async def local_security(request,call_next):
 host=request.headers.get('host','').split(':')[0]
 if host not in {'localhost','127.0.0.1','testserver','[','::1'}:
  return Response('仅允许本机访问',403)
 if request.method not in {'GET','HEAD'}:
  origin=request.headers.get('origin')
  if origin and origin not in {'http://'+request.headers.get('host',''),'http://127.0.0.1:5173','http://localhost:5173'}:
   return Response('跨站操作被拒绝',403)
 response=await call_next(request)
 response.headers['X-Content-Type-Options']='nosniff'
 response.headers['Referrer-Policy']='same-origin'
 return response
@app.get('/api/health')
def health():return {'status':'ok','mode':'groq' if os.getenv('GROQ_API_KEY') else 'simulation','speech':bool(os.getenv('GROQ_API_KEY'))}
@app.post('/api/transcribe')
async def speech(request:Request,response:Response):
 token=owner(request,response)
 s,_=read(token)
 if s['phase']!='play':raise HTTPException(422,'请先进入公寓并打开对话。')
 if speech_locks[token].locked():raise HTTPException(429,'上一句话还在识别，请稍等。')
 async with speech_locks[token]:
  chunks=[];size=0
  async for chunk in request.stream():
   size+=len(chunk)
   if size>MAX_AUDIO_BYTES:raise HTTPException(413,'录音太长了，请分成几句话。')
   chunks.append(chunk)
  mime=request.headers.get('content-type','').split(';')[0].strip().lower()
  try:return await transcribe(b''.join(chunks),mime)
  except SpeechError as e:raise HTTPException(e.status,e.message) from None
@app.get('/api/world')
def world():return {'agents':AGENTS,'objects':OBJECTS,'solids':SOLIDS,'rules':RULES,'welcome':WELCOME,'phone_assistant':PHONE_DESCRIPTOR,'review_questions':QUESTIONS}
@app.get('/api/state')
def state(request:Request,response:Response):
 token=owner(request,response)
 try:s,rev=read(token);return payload(s,rev)
 except HTTPException:return {'phase':'menu','revision':0}
@app.post('/api/new')
async def new(request:Request,response:Response):
 token=owner(request,response)
 async with locks[token]:
  s=engine.new_game()
  with db() as c:
   old=c.execute('SELECT revision FROM sessions WHERE owner=?',(token,)).fetchone();rev=(old[0]+1) if old else 0
   c.execute('INSERT OR REPLACE INTO sessions VALUES(?,?,?)',(token,json.dumps(s,ensure_ascii=False),rev))
  slot_write(token,0,'刚刚入住',s);return payload(s,rev)
@app.post('/api/action')
async def action(body:Action,request:Request,response:Response):
 token=owner(request,response)
 async with locks[token]:
  s,rev=read(token)
  if rev!=body.revision:raise HTTPException(409,'记录已更新。请重新操作。')
  result={}
  try:
   if body.kind=='accept':
    if s['phase']!='notice':raise engine.RuleError('已经签署住户须知。')
    s['phase']='play';engine.event(s,'家','新住户已入住。上一位住户死于自然原因。');result['reply']='门在身后合上。黑暗中只剩设备的指示灯。试着输入：小夜开灯。'
   elif body.kind=='wake':
    # Far-field activation exists only for the initial named wake phrase.
    result=engine.wake(s,body.text)
    mode='groq' if os.getenv('GROQ_API_KEY') else 'simulation'
    result['reply']=await express('xiaoye',body.text,result['reply'],mode);result['mode']=mode
    s['last_reply']=result['reply']
   elif body.kind=='phone':
    result=await phone_chat(s,body.text)
   elif body.kind in {'review_open','review_submit','review_cancel'}:
    if body.target!='jia':raise engine.RuleError('责任审查只能在家的中央终端进行。')
    if body.kind=='review_open':result=engine.start_review(s)
    elif body.kind=='review_submit':result=engine.review(s,body.answers)
    else:result=engine.cancel_review(s)
   elif body.kind=='move':engine.move(s,body.position)
   elif body.kind=='tick':engine.tick(s,body.seconds)
   elif body.kind=='inspect':
    result['reply']=engine.inspect(s,body.target);engine.event(s,'观察',result['reply'])
   elif body.kind=='greet':
    engine.require_live(s)
    if body.target not in AGENTS or not engine.near(s,body.target):raise engine.RuleError('请靠近设备。')
    s['focused']=body.target;s['focus_origin']=s['player'][:]
    result['reply']=WELCOME[body.target]
   elif body.kind=='leave':
    s['focused']=None
   elif body.kind=='rewind':
    if s['phase']!='ending' or not s.get('review_backup'):raise engine.RuleError('没有审查前记录。')
    restored=s['review_backup'];s=restored;result['reply']='已回到审查前。已取得的证据与设备记忆保留。'
   else:
    if not body.text.strip():raise engine.RuleError('请写下你想说的话。')
    engine.require_live(s)
    if body.target not in AGENTS or not engine.can_talk(s,body.target):raise engine.RuleError('请靠近设备。')
    intent,mode=await interpret(s,body.target,body.text)
    # Old typed verdicts and legacy pending saves now open the same choice form; never auto-submit.
    if body.target=='jia' and s.get('review_pending'):intent={'action':'review'}
    result=engine.interact(s,body.target,body.text,intent)
    result['reply']=await express(body.target,body.text,result['reply'],mode);result['mode']=mode
    # The spoken reaction is public memory; no internal state is passed to the expression model.
    s['last_reply']=result['reply']
   write(token,s,rev)
   if body.kind not in {'tick','move','greet'}:slot_write(token,0,'自动记录 · '+('审查前' if s['phase']=='ending' else '第 07 号公寓'),s.get('review_backup',s) if s['phase']=='ending' else s)
   return {'state':payload(s,rev+1),**result}
  except engine.RuleError as e:raise HTTPException(422,str(e))
@app.get('/api/saves')
def saves(request:Request,response:Response):
 token=owner(request,response)
 with db() as c:rows=c.execute('SELECT slot,name,state,updated FROM saves WHERE owner=? ORDER BY slot',(token,)).fetchall()
 return [{'slot':slot,'name':name,'updated':updated,'clock':engine.view(json.loads(raw))['clock'],'evidence_count':len(json.loads(raw)['evidence']),'phase':json.loads(raw)['phase']} for slot,name,raw,updated in rows]
@app.post('/api/save')
async def save(body:Save,request:Request,response:Response):
 token=owner(request,response)
 async with locks[token]:s,rev=read(token);slot_write(token,body.slot,body.name,s)
 return {'ok':True}
@app.post('/api/load')
async def load(body:Load,request:Request,response:Response):
 token=owner(request,response)
 async with locks[token]:
  with db() as c:row=c.execute('SELECT state FROM saves WHERE owner=? AND slot=?',(token,body.slot)).fetchone()
  if not row:raise HTTPException(404,'这个位置还没有存档。')
  s=json.loads(row[0])
  try:_,rev=read(token);write(token,s,rev);rev+=1
  except HTTPException:
   rev=0
   with db() as c:c.execute('INSERT INTO sessions VALUES(?,?,0)',(token,row[0]))
  return payload(s,rev)
DIST=ROOT/'frontend/dist'
if DIST.exists():
 app.mount('/assets',StaticFiles(directory=DIST/'assets'),name='assets')
 @app.get('/')
 def index():return FileResponse(DIST/'index.html')
