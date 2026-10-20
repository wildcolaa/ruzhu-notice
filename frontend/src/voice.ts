export type VoicePhase='idle'|'permission'|'recording'|'transcribing';
export interface VoiceTarget {id:string;draft:string}
interface VoiceHost {
 target:()=>VoiceTarget|null;
 available:()=>boolean;
 status:(phase:VoicePhase)=>void;
 error:(text:string)=>void;
 submit:(target:VoiceTarget,text:string)=>void;
 transcribe:(blob:Blob,signal:AbortSignal)=>Promise<string>;
}
/** A press/release session keeps its original recipient, never the current DOM input. */
export class HoldToTalk {
 phase:VoicePhase='idle';held=false;generation=0;target:VoiceTarget|null=null;
 stream:MediaStream|null=null;recorder:MediaRecorder|null=null;controller:AbortController|null=null;
 chunks:Blob[]=[];started=0;timer:ReturnType<typeof setTimeout>|undefined;
 constructor(public host:VoiceHost){}
 get active(){return this.phase!=='idle';}
 change(phase:VoicePhase){this.phase=phase;this.host.status(phase);}
 async press(){
  if(this.active||this.held)return;
  const target=this.host.target();if(!target){this.host.error('先与设备交谈，或打开手机里的小饱聊天。');return;}
  if(!this.host.available()){this.host.error('语音需要后端 Groq 配置；现在仍可以打字。');return;}
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){this.host.error('当前浏览器不支持录音，请使用 Chrome、Edge 或 Safari，并通过 localhost 或 HTTPS 打开。');return;}
  this.target=target;this.held=true;const gen=++this.generation;this.change('permission');
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   if(gen!==this.generation||!this.held){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mime)throw new Error('FORMAT');
   const recorder=this.recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:64000});this.chunks=[];
   recorder.ondataavailable=e=>{if(gen===this.generation&&e.data.size)this.chunks.push(e.data);};
   recorder.onerror=()=>{if(gen===this.generation){this.cancel();this.host.error('麦克风录音中断，请再试一次。');}};
   recorder.onstop=()=>{void this.finish(gen,recorder.mimeType);};
   recorder.start(250);this.started=performance.now();this.change('recording');
   this.timer=setTimeout(()=>{this.release();this.host.error('已录满三十秒，正在识别这一句话。');},30000);
  }catch(e){if(gen!==this.generation)return;this.cancel();const name=(e as Error).name;
   this.host.error(name==='NotAllowedError'?'麦克风权限未开启，请在浏览器网站设置中允许麦克风后重试。':name==='NotFoundError'?'没有找到麦克风，请连接麦克风后重试。':name==='NotReadableError'?'麦克风被其他程序占用，请稍后再试。':'录音无法启动，请检查麦克风或换一个浏览器。');}
 }
 release(){if(!this.held)return;this.held=false;if(this.phase==='permission'){this.cancel();this.host.error('允许麦克风后，再按住空格说话。');return;}
  if(this.phase==='recording'){clearTimeout(this.timer);this.change('transcribing');this.recorder?.stop();this.stopTracks();}}
 stopTracks(){this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;}
 cancel(){++this.generation;this.held=false;clearTimeout(this.timer);this.controller?.abort();this.controller=null;
  if(this.recorder&&this.recorder.state!=='inactive'){this.recorder.onstop=null;this.recorder.stop();}
  this.recorder=null;this.stopTracks();this.chunks=[];this.target=null;this.change('idle');}
 reconcile(){if(this.active&&this.host.target()?.id!==this.target?.id)this.cancel();}
 async finish(gen:number,mime:string){
  if(gen!==this.generation)return;
  const target=this.target!,blob=new Blob(this.chunks,{type:mime});this.recorder=null;this.chunks=[];
  if(performance.now()-this.started<350||blob.size<100){this.cancel();this.host.error('按住空格说完整的一句话，再松开。');return;}
  const controller=this.controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),35000);
  try{const text=(await this.host.transcribe(blob,controller.signal)).trim();
   if(gen!==this.generation)return;
   if(this.host.target()?.id!==target.id){this.cancel();return;}
   this.cancel();if(!text){this.host.error('没听清，请靠近麦克风再说一次。');return;}
   const combined=[target.draft.trim(),text].filter(Boolean).join(' ');
   if(combined.length>800){this.host.error('这句话加上原有输入超过八百字，请分开说。');return;}
   this.host.submit(target,combined);
  }catch(e){if(gen!==this.generation)return;this.cancel();this.host.error((e as Error).name==='AbortError'?'语音识别等待太久，请再试一次。':(e as Error).name==='TypeError'?'语音连接中断，请再试一次。':(e as Error).message||'语音识别失败，请再试一次。');}
  finally{clearTimeout(timeout);}
 }
}
export const microphoneIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
