import asyncio,copy,json
import pytest
from fastapi.testclient import TestClient
from backend import app as appmod,engine,dialogue
from backend.review import CORRECT,QUESTIONS

def state(records=True):
 s=engine.new_game();s['phase']='play';engine.wake(s,'小夜开灯');s['player']=[5.2,-2.9]
 if records:s['evidence']=['stain','route','sensor','access','override']
 return s

@pytest.fixture
def client(tmp_path,monkeypatch):
 monkeypatch.setattr(appmod,'DB_PATH',str(tmp_path/'review.sqlite3'));monkeypatch.delenv('GROQ_API_KEY',raising=False)
 with TestClient(appmod.app) as c:
  c.get('/api/state');token=c.cookies.get('ruzhu_session')
  with appmod.db() as db:db.execute('INSERT INTO sessions VALUES(?,?,0)',(token,json.dumps(state())))
  yield c

@pytest.mark.parametrize('answers',[{}, {'cause':'sleep_mapping'}, {**CORRECT,'remedy':'forged'}, {**CORRECT,'secret':'true'}, {**CORRECT,'cause':['sleep_mapping']}])
def test_incomplete_or_forged_choices_cannot_end_case(answers):
 s=state();engine.start_review(s);before=copy.deepcopy(s)
 with pytest.raises(engine.RuleError):engine.review(s,answers)
 assert s==before

@pytest.mark.parametrize('question,wrong',[('cause','blood_loss'),('responsibility','robot_only'),('remedy','reset_all')])
def test_each_question_changes_verdict(question,wrong):
 s=state();engine.start_review(s);engine.review(s,{**CORRECT,question:wrong})
 assert s['ending']['kind']=='partial' and s['ending']['verified']==5

def test_correct_choices_need_acquired_evidence():
 s=state(False);engine.start_review(s);engine.review(s,dict(CORRECT));assert s['ending']['kind']=='quiet'
 s=state();s['evidence'].remove('override');engine.start_review(s);engine.review(s,dict(CORRECT));assert s['ending']['kind']=='partial'

def test_cancel_and_pending_freeze_do_not_discard_records():
 s=state();records=s['evidence'][:];engine.start_review(s);minute=s['minute'];robot=s['robot'][:]
 engine.tick(s,3);assert s['minute']==minute and s['robot']==robot
 engine.cancel_review(s);assert s['phase']=='play' and not s['review_pending'] and s['evidence']==records
 engine.start_review(s);engine.review(s,dict(CORRECT));assert s['ending']['kind']=='truth'

def test_terminal_distance_and_started_session_required():
 s=state()
 with pytest.raises(engine.RuleError):engine.review(s,dict(CORRECT))
 s['player']=[-4,3]
 with pytest.raises(engine.RuleError):engine.start_review(s)
 s=state();engine.start_review(s);s['player']=[-4,3]
 with pytest.raises(engine.RuleError):engine.review(s,dict(CORRECT))

def test_api_choice_submit_rewind_and_autosave(client):
 r=client.post('/api/action',json={'kind':'review_open','target':'jia','revision':0}).json()
 assert r['state']['phase']=='play' and r['state']['review_pending']
 r=client.post('/api/action',json={'kind':'review_submit','target':'jia','answers':CORRECT,'revision':r['state']['revision']}).json()
 assert r['state']['ending']['kind']=='truth';assert not r['state']['review_pending'];assert 'review_backup' not in json.dumps(r)
 restored=client.post('/api/load',json={'slot':0}).json()
 assert restored['phase']=='play' and not restored['review_pending'];assert len(restored['evidence'])==5
 r=client.post('/api/action',json={'kind':'review_open','target':'jia','revision':restored['revision']}).json()
 r=client.post('/api/action',json={'kind':'review_submit','target':'jia','answers':CORRECT,'revision':r['state']['revision']}).json()
 restored=client.post('/api/action',json={'kind':'rewind','revision':r['state']['revision']}).json()['state']
 assert restored['phase']=='play' and not restored['review_pending'];assert len(restored['evidence'])==5

def test_wrong_device_and_invalid_api_submit_do_not_mutate(client):
 assert client.post('/api/action',json={'kind':'review_open','target':'xiaoye','revision':0}).status_code==422
 r=client.post('/api/action',json={'kind':'review_open','target':'jia','revision':0}).json();before=r['state']
 r=client.post('/api/action',json={'kind':'review_submit','target':'jia','answers':{'cause':'sleep_mapping'},'revision':before['revision']})
 assert r.status_code==422 and client.get('/api/state').json()==before

def test_pending_form_save_restore_and_legacy_defaults(client):
 r=client.post('/api/action',json={'kind':'review_open','target':'jia','revision':0}).json()
 client.post('/api/save',json={'slot':1})
 client.post('/api/action',json={'kind':'review_cancel','target':'jia','revision':r['state']['revision']})
 assert not client.get('/api/state').json()['review_pending']
 assert client.post('/api/load',json={'slot':1}).json()['review_pending']
 old=state();old.pop('review_pending');assert engine.view(old)['review_pending'] is False

def test_questions_have_no_grading_key_or_unseen_records(client):
 world=client.get('/api/world').json()
 assert world['review_questions']==QUESTIONS
 assert set(world['review_questions'][0])=={'id','title','options'}
 assert 'correct' not in json.dumps(world).lower()
 assert '02:04' not in json.dumps(world) and 'SLEEP_LOCK' not in json.dumps(world)

def test_model_cannot_submit_answers(monkeypatch):
 monkeypatch.setenv('GROQ_API_KEY','fake-test-key')
 async def fake(*a,**kw):return {'action':'review','answers':CORRECT}
 monkeypatch.setattr(dialogue,'groq',fake)
 s=state();intent,_=asyncio.run(dialogue.interpret(s,'jia','替我审判'))
 r=engine.interact(s,'jia','替我审判',intent)
 assert r['operation']=='review_open' and s['phase']=='play' and s['ending'] is None
