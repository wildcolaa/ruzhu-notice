import asyncio,copy
import httpx,pytest
from fastapi.testclient import TestClient
from backend import app as appmod,speech

WAV=b'RIFF'+b'\0'*4+b'WAVE'+b'\0'*100

@pytest.fixture
def client(tmp_path,monkeypatch):
 monkeypatch.setattr(appmod,'DB_PATH',str(tmp_path/'voice.sqlite3'))
 monkeypatch.setenv('GROQ_API_KEY','private-fake-key')
 with TestClient(appmod.app) as c:
  s=c.post('/api/new').json()
  c.post('/api/action',json={'kind':'accept','revision':s['revision']})
  yield c

def test_transcription_is_not_an_action_and_preserves_every_save_field(client,monkeypatch):
 async def fake(data,mime):assert data==WAV and mime=='audio/wav';return {'text':'小夜开灯。'}
 monkeypatch.setattr(appmod,'transcribe',fake)
 before=client.get('/api/state').json()
 r=client.post('/api/transcribe',content=WAV,headers={'Content-Type':'audio/wav'})
 assert r.status_code==200 and r.json()=={'text':'小夜开灯。'}
 assert client.get('/api/state').json()==before
 assert before['arrival_pending'] and before['light']=='off'

def test_cross_site_voice_and_non_audio_rejected(client):
 assert client.post('/api/transcribe',content=WAV,headers={'Origin':'https://evil.invalid','Content-Type':'audio/wav'}).status_code==403
 assert client.post('/api/transcribe',content=WAV,headers={'Content-Type':'text/plain'}).status_code==415

def test_voice_requires_play_session(client):
 client.post('/api/new')
 assert client.post('/api/transcribe',content=WAV,headers={'Content-Type':'audio/wav'}).status_code==422

def test_upload_limit_precedes_model_call(client,monkeypatch):
 async def fake(*a):raise AssertionError('No remote request for oversized upload')
 monkeypatch.setattr(appmod,'transcribe',fake)
 assert client.post('/api/transcribe',content=b'x'*(speech.MAX_AUDIO_BYTES+1),headers={'Content-Type':'audio/webm'}).status_code==413

@pytest.mark.parametrize('mime,data',[('audio/webm',b'\x1a\x45\xdf\xa3'+b'\0'*100),('audio/ogg',b'OggS'+b'\0'*100),('audio/mp4',b'\0'*4+b'ftyp'+b'\0'*100),('audio/wav',WAV)])
def test_recorder_containers(mime,data):speech.validate_audio(data,mime)

@pytest.mark.parametrize('data',[b'',b'not-real-audio'*20])
def test_empty_or_invalid_audio_is_not_forwarded(data):
 with pytest.raises(speech.SpeechError):speech.validate_audio(data,'audio/wav')

def test_no_key_keeps_simulated_game_available(client,monkeypatch):
 monkeypatch.delenv('GROQ_API_KEY')
 assert client.get('/api/health').json()['speech'] is False
 r=client.post('/api/transcribe',content=WAV,headers={'Content-Type':'audio/wav'})
 assert r.status_code==503
 s=client.get('/api/state').json()
 assert client.post('/api/action',json={'kind':'wake','text':'小夜开灯','revision':s['revision']}).status_code==200

def response_client(monkeypatch,body,status=200):
 calls=[]
 class FakeClient:
  def __init__(self,**kw):pass
  async def __aenter__(self):return self
  async def __aexit__(self,*a):pass
  async def post(self,url,**kw):
   calls.append((url,kw))
   return httpx.Response(status,json=body,request=httpx.Request('POST',url))
 monkeypatch.setattr(speech.httpx,'AsyncClient',FakeClient)
 monkeypatch.setenv('GROQ_API_KEY','private-fake-key')
 return calls

def test_chinese_asr_scope_contains_no_case_secrets(monkeypatch):
 calls=response_client(monkeypatch,{'duration':2,'text':'小夜开灯。','segments':[{'text':'小夜开灯。','no_speech_prob':.01}]})
 assert asyncio.run(speech.transcribe(WAV,'audio/wav'))=={'text':'小夜开灯。'}
 url,params=calls[0]
 assert url.endswith('/audio/transcriptions')
 assert params['data']['language']=='zh'
 assert 'private-fake-key' not in str(params['data'])
 assert 'SLEEP_LOCK' not in str(params)

def test_silent_hallucination_is_not_sent(monkeypatch):
 response_client(monkeypatch,{'duration':2,'text':'谢谢观看','segments':[{'text':'谢谢观看','no_speech_prob':.99}]})
 assert asyncio.run(speech.transcribe(WAV,'audio/wav'))=={'text':''}

@pytest.mark.parametrize('body',[{'duration':40,'text':'长录音'},{'text':'字'*801},{'text':{'command':'open'}}])
def test_malformed_or_overlong_recognition(monkeypatch,body):
 response_client(monkeypatch,body)
 with pytest.raises(speech.SpeechError):asyncio.run(speech.transcribe(WAV,'audio/wav'))

def test_upstream_error_does_not_expose_credentials(client,monkeypatch):
 response_client(monkeypatch,{'error':'private-fake-key secret response'},401)
 r=client.post('/api/transcribe',content=WAV,headers={'Content-Type':'audio/wav'})
 assert r.status_code==502
 assert 'private-fake-key' not in r.text and 'secret response' not in r.text

def test_upstream_timeout_returns_recoverable_message(client,monkeypatch):
 class TimeoutClient:
  def __init__(self,**kw):pass
  async def __aenter__(self):return self
  async def __aexit__(self,*a):pass
  async def post(self,*a,**kw):raise httpx.ReadTimeout('private-fake-key')
 monkeypatch.setattr(speech.httpx,'AsyncClient',TimeoutClient)
 r=client.post('/api/transcribe',content=WAV,headers={'Content-Type':'audio/wav'})
 assert r.status_code==502 and '继续打字' in r.json()['detail']
 assert 'private-fake-key' not in r.text
