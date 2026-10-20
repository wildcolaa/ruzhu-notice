"""Transient Chinese transcription; audio never enters saves or world actions."""
import os
import httpx

MAX_AUDIO_BYTES = 4 * 1024 * 1024
FORMATS = {'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a',
           'audio/wav': 'wav', 'audio/x-wav': 'wav'}

class SpeechError(Exception):
 def __init__(self, status, message):
  self.status, self.message = status, message

def validate_audio(data, mime):
 if mime not in FORMATS: raise SpeechError(415, '浏览器的录音格式不支持，请使用 Chrome、Edge 或 Safari。')
 if len(data) > MAX_AUDIO_BYTES: raise SpeechError(413, '录音太长了，请分成几句话。')
 if len(data) < 100: raise SpeechError(422, '没有录到声音，请按住空格再试一次。')
 valid = ((mime == 'audio/webm' and data.startswith(b'\x1a\x45\xdf\xa3')) or
          (mime == 'audio/ogg' and data.startswith(b'OggS')) or
          (mime == 'audio/mp4' and data[4:8] == b'ftyp') or
          (mime in {'audio/wav', 'audio/x-wav'} and data[:4] == b'RIFF' and data[8:12] == b'WAVE'))
 if not valid: raise SpeechError(422, '录音数据不完整，请重新说一次。')

async def transcribe(data, mime):
 validate_audio(data, mime)
 key = os.getenv('GROQ_API_KEY')
 if not key: raise SpeechError(503, '语音需要配置后端 Groq Key；现在仍可以打字试玩。')
 try:
  async with httpx.AsyncClient(timeout=25) as client:
   r = await client.post('https://api.groq.com/openai/v1/audio/transcriptions',
    headers={'Authorization': 'Bearer ' + key},
    files={'file': ('voice.' + FORMATS[mime], data, mime)},
    data={'model': os.getenv('GROQ_SPEECH_MODEL', 'whisper-large-v3-turbo'),
          'language': 'zh', 'response_format': 'verbose_json', 'temperature': '0',
          'prompt': '中文对话。名字：小夜、圆圆、守则、家、小饱。'})
   r.raise_for_status()
   result = r.json()
  if not isinstance(result, dict): raise ValueError()
  if float(result.get('duration', 0)) > 35: raise SpeechError(422, '每次最多说三十秒，请分成几句话。')
  segments = result.get('segments')
  if isinstance(segments, list) and segments:
   text = ''.join(seg['text'] for seg in segments if isinstance(seg, dict)
                 and float(seg.get('no_speech_prob', 0)) < .8 and isinstance(seg.get('text'), str))
  else: text = result.get('text', '')
  if not isinstance(text, str): raise ValueError()
  text = text.strip()
  if len(text) > 800: raise SpeechError(422, '这句话太长了，请分开说。')
  return {'text': text}
 except httpx.HTTPStatusError as e:
  if e.response.status_code == 429: raise SpeechError(429, '语音服务有点忙，请稍后再试。') from None
  raise SpeechError(502, '语音识别暂不可用，请重试或继续打字。') from None
 except (httpx.HTTPError, ValueError, KeyError, TypeError):
  raise SpeechError(502, '语音连接中断，请重试或继续打字。') from None
