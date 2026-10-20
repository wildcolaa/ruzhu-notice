// Controller tests use fake hardware, not browser automation or real microphones.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const ts=require('typescript');
const code=ts.transpileModule(readFileSync(new URL('../frontend/src/voice.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {HoldToTalk}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
let clock=0,permission,track,recorders=[];
Object.defineProperty(globalThis,'performance',{value:{now:()=>clock},configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:()=>permission}},configurable:true});
globalThis.MediaRecorder=class {
 static isTypeSupported(t){return t.startsWith('audio/webm');}
 state='inactive';mimeType='audio/webm';
 constructor(){recorders.push(this);}
 start(){this.state='recording';}
 stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['x'.repeat(150)])});queueMicrotask(()=>this.onstop?.());}
};
function fixture(){clock=0;recorders=[];track={stopped:false,stop(){this.stopped=true;}};permission=Promise.resolve({getTracks:()=>[track]});let recipient={id:'xiaoye',draft:''};
 const sent=[],errors=[],states=[];const host={target:()=>recipient,available:()=>true,status:p=>states.push(p),error:e=>errors.push(e),submit:(to,text)=>sent.push({to,text}),transcribe:async()=> '小夜开灯。'};
 return {voice:new HoldToTalk(host),host,sent,errors,states,setTarget:t=>recipient=t};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('hold starts one recorder, release transcribes and submits to original device',async()=>{const f=fixture();await f.voice.press();await f.voice.press();assert.equal(recorders.length,1);assert.equal(f.voice.phase,'recording');clock=900;f.voice.release();assert(track.stopped);await settle();assert.equal(f.sent[0].text,'小夜开灯。');assert.equal(f.sent[0].to.id,'xiaoye');assert.equal(f.voice.phase,'idle');});
test('release while permission pending never records late or submits',async()=>{const f=fixture();let resolve;permission=new Promise(r=>resolve=r);const start=f.voice.press();f.voice.release();resolve({getTracks:()=>[track]});await start;assert(track.stopped);assert.equal(recorders.length,0);assert.equal(f.sent.length,0);});
test('cancel during recording discards audio and releases hardware',async()=>{const f=fixture();await f.voice.press();f.voice.cancel();await settle();assert(track.stopped);assert.equal(f.sent.length,0);assert.equal(f.voice.phase,'idle');});
test('changing recipient while recognition pending discards late result',async()=>{const f=fixture();let resolve;f.host.transcribe=()=>new Promise(r=>resolve=r);await f.voice.press();clock=900;f.voice.release();await settle();f.setTarget({id:'phone',draft:''});f.voice.reconcile();resolve('开门');await settle();assert.equal(f.sent.length,0);});
test('phone chat receives its own voice with existing draft',async()=>{const f=fixture();f.setTarget({id:'phone',draft:'你好'});f.host.transcribe=async()=> '这样才不烧心';await f.voice.press();clock=800;f.voice.release();await settle();assert.equal(f.sent[0].to.id,'phone');assert.equal(f.sent[0].text,'你好 这样才不烧心');});
test('tiny taps and silence never dispatch operations',async()=>{const f=fixture();await f.voice.press();clock=100;f.voice.release();await settle();assert.equal(f.sent.length,0);assert(f.errors.length);const g=fixture();g.host.transcribe=async()=>'';await g.voice.press();clock=800;g.voice.release();await settle();assert.equal(g.sent.length,0);});
test('permission denial and missing configuration preserve typing',async()=>{const f=fixture();permission=Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'}));await f.voice.press();assert.equal(f.voice.phase,'idle');assert(f.errors[0].includes('权限'));const g=fixture();g.host.available=()=>false;await g.voice.press();assert.equal(recorders.length,0);assert.equal(g.voice.phase,'idle');});
test('recognition failure cleans resources and leaves draft intact',async()=>{const f=fixture();const draft={id:'xiaoye',draft:'保留的输入'};f.setTarget(draft);f.host.transcribe=async()=>{throw new Error('服务中断');};await f.voice.press();clock=900;f.voice.release();await settle();assert.equal(f.sent.length,0);assert.equal(draft.draft,'保留的输入');assert.equal(f.voice.phase,'idle');});
