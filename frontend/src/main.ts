import './style.css';
import {Apartment} from './scene';
import {Atmosphere} from './audio';
import {PocketPhone} from './phone';
import {HoldToTalk,microphoneIcon} from './voice';
import {ReviewSelection} from './review';
import type {World,GameState,Vec,AgentId} from './types';
const $=<T extends Element=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const ui=$('#ui'), frame=$('#frame'), audio=new Atmosphere();
const escape=(s:string)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let world:World,game:GameState,scene:Apartment,phone:PocketPhone;let phoneReturn='play';
let page='menu',returnPage='play',focus:AgentId|null=null,reply='',busy=false,mode='simulation',hasGame=false;
let position:Vec=[-4.3,3.5],path:Vec[]=[],pendingTarget:string|null=null,syncPending=false,lastSync=0,lastTick=0,lastMove=0;
let moveVector:Vec=[0,0],keys=new Set<string>(),toastTimer:number|undefined;
let queue:Promise<unknown>=Promise.resolve(),speechAvailable=false;
const reviewSelection=new ReviewSelection();
function voiceTarget(){
 if(!game||game.phase!=='play')return null;
 if(page==='phone'&&phone.app==='chat'&&!phone.pending)return {id:'phone',draft:$<HTMLTextAreaElement>('#phone-input')?.value||phone.draft};
 if(page==='play'&&(focus||game.arrival_pending)&&!busy)return {id:game.arrival_pending?'arrival':focus!,draft:$<HTMLTextAreaElement>('#say')?.value||''};
 return null;
}
const voice=new HoldToTalk({target:voiceTarget,available:()=>speechAvailable,error:toast,
 status:phase=>{const live=phase!=='idle';frame.classList.toggle('voice-active',live);audio.duck(live);
 const status=$('#voice-status');status.hidden=!live;status.dataset.phase=phase;
 status.innerHTML=live?microphoneIcon+`<span>${phase==='permission'?'正在请求麦克风……':phase==='recording'?'正在听 · 松开发送':'正在识别……'}<small>Esc 取消</small></span><i></i><i></i><i></i>`:'';
 for(const input of Array.from(ui.querySelectorAll<HTMLTextAreaElement>('#say,#phone-input')))input.readOnly=live;
 for(const button of Array.from(ui.querySelectorAll<HTMLButtonElement>('#send,#phone-chat-form button[type="submit"]')))button.disabled=live||busy||Boolean(phone?.pending);
 },
 transcribe:async(blob,signal)=>{const r=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':blob.type},body:blob,signal});const d=await r.json();if(!r.ok)throw new Error(d.detail||'语音连接中断，请重试。');return d.text as string;},
 submit:(target,text)=>{toast('你：'+text);if(target.id==='phone'){phone.draft=text;const input=$<HTMLTextAreaElement>('#phone-input');if(input)input.value=text;void phone.send();}
 else{const input=$<HTMLTextAreaElement>('#say');if(input){input.value=text;sendTalk();}}}
});
new MutationObserver(()=>voice.reconcile()).observe(ui,{childList:true,subtree:true});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&voice.active){e.preventDefault();e.stopImmediatePropagation();voice.cancel();return;}
 if(e.code==='Space'&&!e.shiftKey&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.isComposing&&voiceTarget()){
 e.preventDefault();e.stopImmediatePropagation();if(!e.repeat){halt();audio.start();void voice.press();}return;}
 if(voice.active){e.preventDefault();e.stopImmediatePropagation();}
},true);
window.addEventListener('keyup',e=>{if(e.code==='Space'&&voice.held){e.preventDefault();voice.release();}},true);
window.addEventListener('blur',()=>voice.cancel());
document.addEventListener('visibilitychange',()=>{if(document.hidden)voice.cancel();});
ui.addEventListener('pointerdown',e=>{const button=(e.target as Element).closest<HTMLButtonElement>('[data-voice]');if(!button)return;e.preventDefault();button.setPointerCapture(e.pointerId);halt();audio.start();void voice.press();});
ui.addEventListener('pointerup',e=>{if((e.target as Element).closest('[data-voice]')){e.preventDefault();voice.release();}});
ui.addEventListener('pointercancel',()=>voice.cancel());
ui.addEventListener('click',e=>{if((e.target as Element).closest('[data-voice]'))e.preventDefault();});
ui.addEventListener('contextmenu',e=>{if((e.target as Element).closest('[data-voice]'))e.preventDefault();});
function toast(text:string){const el=$('#toast');el.textContent=text;el.classList.add('visible');window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>el.classList.remove('visible'),5500);}
async function api(url:string,body?:unknown){const r=await fetch('/api'+url,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({detail:'服务暂时没有响应。'}));if(!r.ok)throw new Error(data.detail||'连接中断，请重试。');return data;}
function serial<T>(work:()=>Promise<T>):Promise<T>{const p=queue.then(work,work);queue=p.catch(()=>{});return p;}
function setState(s:GameState,resetPosition=false){const oldTrail=game?.blood_trail?.length||0;game=s;if(s.robot_contaminated&&(s.blood_trail?.length||0)>oldTrail)audio.scrape();hasGame=s.phase!=='menu';if(resetPosition){position=[...s.player];path=[];pendingTarget=null;}else if(performance.now()-lastMove>650&&!syncPending&&!path.length){position=[...s.player];}scene.apply(s);scene.setPlayer(position);scene.mode=page==='menu'||page==='saves'?'menu':s.phase;updateHud();}
async function action(kind:string,extra:Record<string,unknown>={}){return serial(async()=>{for(let attempt=0;attempt<3;attempt++){try{const d=await api('/action',{kind,revision:game.revision,...extra});setState(d.state);if(d.mode&&kind!=='phone')mode=d.mode;return d;}catch(e){if(String(e).includes('记录已更新')&&attempt<2){const latest=await api('/state');setState(latest);continue;}throw e;}}throw new Error('记录同步暂时未完成，请重试。');});}
function safe(job:Promise<unknown>){void job.catch(e=>toast(String(e.message||e)));}
function halt(){path=[];pendingTarget=null;keys.clear();moveVector=[0,0];}
async function sync(){if(!game||game.phase!=='play')return;const p:Vec=[...position];if(Math.hypot(p[0]-game.player[0],p[1]-game.player[1])<.01)return;await action('move',{position:p});}
function hud(showPause=true){return `<div class="hud"><div class="chapter"><span class="tiny-label">07 / 智能住宅</span><span>凌晨两点的清洁任务</span></div><div class="hud-right"><span class="clock">${game.clock}</span><span class="credit" title="公开住户可信度">住户可信度 <b>${game.credit}</b></span><button class="icon phone-hud-icon" id="notes" title="拿出手机 N" aria-label="拿出手机">▯</button><button class="icon" id="sound" title="声音" aria-label="切换声音">${audio.muted?'◌':'♫'}</button>${showPause?'<button class="icon" id="pause" title="暂停 Esc" aria-label="暂停">Ⅱ</button>':''}</div></div>`;}
function updateHud(){if(!game)return;const clock=$('.clock'),credit=$('.credit b');if(clock)clock.textContent=game.clock;if(credit)credit.textContent=String(game.credit);const progress=$('.case-progress');if(progress)progress.textContent=game.evidence.length?`已留存 ${game.evidence.length} 份观察`:'雨夜 · 第一个晚上';}
function render(){voice.reconcile();ui.innerHTML='';frame.classList.toggle('touch-play',page==='play'&&!focus&&!game.arrival_pending);frame.classList.toggle('arrival-dark',page==='play'&&game.arrival_pending);$('#hover').classList.remove('visible');scene.focus=focus;scene.phoneOpen=page==='phone';scene.mode=['menu','saves'].includes(page)?'menu':game.phase;
 if(page==='menu')renderMenu();
 else if(page==='notice')renderNotice();
 else if(page==='saves')void renderSaves();
 else if(page==='phone')phone.render();
 else if(page==='pause')renderPause();
 else if(page==='ending')renderEnding();
 else if(page==='review')renderReview();
 else renderPlay();
}
function renderMenu(){focus=null;scene.focus=null;ui.innerHTML=`<div class="menu-shade"></div><div class="menu"><div class="brand"><i></i> HOMESTAY SYSTEMS <span>2074</span></div><div class="title-kicker">一间公寓，四种真相。</div><h1>入住须知<span>RESIDENT PROTOCOL</span></h1><div class="title-line"></div><p class="menu-copy">上一位住户在凌晨两点停止了呼吸。<br>这间房子说，他只是睡着了。</p><nav class="menu-actions">${hasGame?'<button id="continue"><span>继续调查</span><small>CONTINUE ↗</small></button>':''}<button id="new"><span>${hasGame?'重新入住':'开始游戏'}</span><small>CHECK IN ↗</small></button><button id="load"><span>读取记录</span><small>ARCHIVE ↗</small></button></nav><div class="menu-foot"><span>一则可交谈的规则怪谈</span><button class="text-button" id="sound">${audio.muted?'声音关闭':'声音开启'}</button></div></div><div class="room-tag"><span>公寓 07</span><small>入住率 1 / 1 · 前任住户记录已封存</small></div><div class="edition">独立游戏 PROTOTYPE · 中文 · ${mode==='groq'?'GROQ 在线':'离线模拟可通关'}</div>`;
 $('#new').onclick=()=>safe(serial(async()=>{audio.start();halt();const s=await api('/new',{});setState(s,true);page='notice';render();}));
 if(hasGame)$('#continue').onclick=()=>{audio.start();page=game.phase==='notice'?'notice':game.phase==='ending'?'ending':game.review_pending?'review':'play';if(page==='review')focus='jia';render();};
 $('#load').onclick=()=>{audio.start();returnPage='menu';page='saves';render();};bindSound();
}
function renderNotice(){ui.innerHTML=`<div class="notice-shade"></div><div class="notice-paper"><div class="paper-top">HOMESTAY / 07 <span>入住文件 · 请本人签署</span></div><h2>住户须知</h2><p class="paper-sub">欢迎入住。住宅会照顾您，但并不总能理解您。</p><ol>${world.rules.map(r=>`<li>${escape(r)}</li>`).join('')}</ol><div class="paper-bottom"><span>前任住户：陈默<br><small>离租原因：自然死亡 / 已结案</small></span><button class="solid-button" id="accept">我已阅读，开始入住 <span>↗</span></button></div></div>`;$('#accept').onclick=()=>safe((async()=>{const d=await action('accept');page='play';render();if(!game.arrival_pending)toast(d.reply);audio.tone('jia');})());}
function renderPlay(){ui.innerHTML='<div class="world-controls">'+Object.entries(world.agents).map(([id,a])=>`<button class="device-hotspot" data-device="${id}" aria-label="与${a.name}交谈" title="${a.name}"><i></i><span>${a.name}</span></button>`).join('')+Object.entries(world.objects).map(([id,o])=>`<button class="object-hotspot" data-object="${id}" aria-label="观察${o.name}" title="${o.name}"><i></i></button>`).join('')+'</div>'+hud()+`<div class="explore-footer"><span class="controls-desktop">${game.arrival_pending?'先呼唤灯光，再开始调查':'W A S D / 方向键 移动 <i>·</i> E 交互 <i>·</i> N 手机'}</span><span class="controls-touch">拖动圆盘移动 · 点选设备或物件</span><span class="case-progress">${game.evidence.length?`已留存 ${game.evidence.length} 份观察`:'雨夜 · 第一个晚上'}</span></div>`;bindHud();ui.querySelectorAll<HTMLButtonElement>('[data-device]').forEach(b=>b.onclick=()=>goTo(b.dataset.device!));ui.querySelectorAll<HTMLButtonElement>('[data-object]').forEach(b=>b.onclick=()=>goTo(b.dataset.object!));
 if(focus||game.arrival_pending){const opening=game.arrival_pending;const a=world.agents[opening?'xiaoye':focus!];ui.insertAdjacentHTML('beforeend',`<section class="conversation ${opening?'arrival-conversation':''}" aria-label="与${a.name}对话"><div class="conversation-top"><div><span class="signal" style="background:${a.color}"></span><h2>${a.name}</h2><span class="role">${a.role}</span></div>${opening?'<span class="arrival-label">门在身后合上了</span>':`<div class="conversation-actions">${focus==='jia'?'<button id="start-review" class="text-button">开始责任审查 ↗</button>':''}<button id="leave" class="text-button">结束交谈 <span>Esc ↗</span></button></div>`}</div><div class="spoken" role="log" aria-live="polite">${escape(reply||(opening?'房间没有回应，只有窗外的雨声。呼唤它的名字，试着输入：小夜开灯。':world.welcome[focus!])).replace(/\n/g,'<br>')}</div><form id="talk-form"><span class="input-prefix">你</span><textarea id="say" rows="1" maxlength="800" autocomplete="off" aria-label="对设备说话" placeholder="${opening?'输入：小夜开灯':'问它，说服它，或让它做些什么……'}" ${busy?'disabled':''}></textarea><button class="voice-button" data-voice type="button" aria-label="按住语音输入" title="按住说话 · 松开发送" ${busy?'disabled':''}>${microphoneIcon}</button><button id="send" type="submit" aria-label="发送" ${busy?'disabled':''}>${busy?'<span class="thinking"></span>':'↵'}</button></form><div class="language-foot"><span>${mode==='groq'?'Groq · 自由对话':mode==='fallback'?'连接暂不可用 · 本地模拟接续':'本地模拟 · 可完成完整案件'}</span><span>按住空格说话 · 松开发送</span></div></section>`);
 if(!opening)$('#leave').onclick=endTalk;const reviewButton=$('#start-review');if(reviewButton)reviewButton.onclick=startReview;$('#talk-form').addEventListener('submit',e=>{e.preventDefault();sendTalk();});$('#say').addEventListener('keydown',(e:Event)=>{const ev=e as KeyboardEvent;if(ev.key==='Enter'&&!ev.shiftKey&&!ev.isComposing){ev.preventDefault();sendTalk();}});if(!busy)window.setTimeout(()=>$<HTMLTextAreaElement>('#say')?.focus({preventScroll:true}),100);
 }
}
function bindSound(){const b=$('#sound');if(b)b.onclick=()=>{audio.start();audio.mute();render();};}
function bindHud(){bindSound();$('#notes').onclick=openPhone;$('#pause').onclick=()=>{halt();page='pause';render();};}
function renderPause(){safe(sync());ui.innerHTML=hud()+`<div class="pause-shade"></div><div class="pause-panel"><div class="tiny-label">RESIDENT / 07</div><h2>房间正在等待</h2><button class="menu-link" id="resume">继续调查 <span>↗</span></button><button class="menu-link" id="save">保存 / 读取记录 <span>↗</span></button><button class="menu-link" id="home">返回主菜单 <span>↗</span></button></div>`;bindHud();$('#resume').onclick=()=>{page='play';render();};$('#save').onclick=()=>{returnPage='pause';page='saves';render();};$('#home').onclick=()=>{focus=null;page='menu';render();};}
async function renderSaves(){ui.innerHTML=`<div class="save-shade"></div><div class="save-page"><div class="page-head"><div><div class="tiny-label">MEMORY ARCHIVE / 07</div><h2>留存记录</h2></div><button class="text-button" id="back">返回 ↗</button></div><div id="slots" class="slots"><div class="loading">正在读取……</div></div><p class="save-note">手动记录与自动记录保存在这台电脑。设备只记得您曾经说过的话。</p></div>`;
 $('#back').onclick=()=>{page=returnPage;render();};
 try{const saves: {slot:number;name:string;updated:number;clock:string;evidence_count:number}[]=await api('/saves');if(page!=='saves')return;
 $('#slots').innerHTML=[0,1,2,3].map(slot=>{const s=saves.find(x=>x.slot===slot);const name=slot===0?'自动记录':`记录 0${slot}`;return `<article class="slot ${s?'filled':''}"><div class="slot-art"><span>07</span><div></div></div><div class="slot-body"><small>${slot===0?'AUTOSAVE':`ARCHIVE / 0${slot}`}</small><h3>${name}</h3><p>${s?`${s.clock} · ${s.evidence_count} 份观察<br>${new Date(s.updated*1000).toLocaleString('zh-CN')}`:'尚未留存<br>房间等待着新的记忆'}</p><div class="slot-buttons"><button class="text-button" data-load="${slot}" ${!s?'disabled':''}>读取 ↗</button>${slot>0?`<button class="text-button" data-save="${slot}" ${!hasGame?'disabled':''}>${s?'覆盖记录':'保存于此'}</button>`:''}</div></div></article>`;}).join('');
 ui.querySelectorAll<HTMLButtonElement>('[data-load]').forEach(b=>b.onclick=()=>safe(serial(async()=>{halt();const s=await api('/load',{slot:Number(b.dataset.load)});focus=null;setState(s,true);page=s.phase==='notice'?'notice':s.phase==='ending'?'ending':s.review_pending?'review':'play';reviewSelection.reset();if(page==='review')focus='jia';render();toast('记录已读取。');})));
 ui.querySelectorAll<HTMLButtonElement>('[data-save]').forEach(b=>b.onclick=()=>safe(serial(async()=>{await api('/save',{slot:Number(b.dataset.save),name:'凌晨两点的清洁任务'});toast('记忆已留存。');void renderSaves();})));
 }catch(e){toast(String(e));}
}
function openPhone(){if(game.phase!=='play')return;halt();safe(sync());phoneReturn=page==='review'?'review':page==='pause'?'pause':'play';page='phone';render();}
function closePhone(){phone.captureDraft();page=phoneReturn;render();}
function enterReview(){voice.cancel();halt();reviewSelection.reset();focus='jia';page='review';render();}
function startReview(){if(busy)return;busy=true;safe((async()=>{try{await sync();await action('review_open',{target:'jia'});busy=false;enterReview();}catch(e){busy=false;toast(String((e as Error).message||e));render();}})());}
function cancelReview(){if(busy)return;busy=true;safe((async()=>{try{const d=await action('review_cancel',{target:'jia'});reply=d.reply;page='play';}catch(e){toast(String((e as Error).message||e));}finally{busy=false;render();}})());}
function renderReview(){const q=world.review_questions[reviewSelection.step];const chosen=reviewSelection.answers[q.id];
 ui.innerHTML=hud(false)+`<div class="review-shade"></div><section class="review-panel" aria-label="责任审查选择题"><div class="review-top"><span class="tiny-label">中央终端 / 责任审查</span><span class="review-progress">${world.review_questions.map((_,i)=>`<i class="${i===reviewSelection.step?'current':i<reviewSelection.step?'done':''}"></i>`).join('')} ${reviewSelection.step+1} / ${world.review_questions.length}</span><button id="review-cancel" class="text-button" ${busy?'disabled':''}>返回调查 · Esc</button></div><h2>${escape(q.title)}</h2><div class="review-options" role="radiogroup" aria-label="${escape(q.title)}">${q.options.map((o,i)=>`<button class="review-option ${chosen===o.id?'selected':''}" data-answer="${o.id}" role="radio" aria-checked="${chosen===o.id}" ${busy?'disabled':''}><span>${String.fromCharCode(65+i)}</span><b>${escape(o.text)}</b><i>${chosen===o.id?'●':'○'}</i></button>`).join('')}</div><div class="review-bottom"><span>已留存 ${game.evidence.length} 份观察 · ${reviewSelection.step===world.review_questions.length-1?'提交后进入结局，可回溯':'可打开手机核对'}</span><div>${reviewSelection.step>0?`<button id="review-prev" class="text-button" ${busy?'disabled':''}>← 上一题</button>`:''}<button id="review-next" class="solid-button" ${!chosen||busy?'disabled':''}>${busy?'正在提交……':reviewSelection.step===world.review_questions.length-1?'提交责任审查 ↗':'下一题 →'}</button></div></div></section>`;
 $('#notes').onclick=openPhone;bindSound();$('#review-cancel').onclick=cancelReview;
 const options=Array.from(ui.querySelectorAll<HTMLButtonElement>('[data-answer]'));
 options.forEach((button,index)=>{button.onclick=()=>{reviewSelection.choose(q,button.dataset.answer!);render();ui.querySelector<HTMLButtonElement>(`[data-answer="${button.dataset.answer}"]`)?.focus({preventScroll:true});};button.onkeydown=e=>{if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(e.key)){e.preventDefault();e.stopPropagation();const next=options[(index+(e.key==='ArrowDown'||e.key==='ArrowRight'?1:options.length-1))%options.length];next.click();}};});
 const prev=$('#review-prev');if(prev)prev.onclick=()=>{reviewSelection.step--;render();};
 $('#review-next').onclick=()=>{if(!chosen||busy)return;if(reviewSelection.step<world.review_questions.length-1){reviewSelection.step++;render();return;}if(!reviewSelection.complete(world.review_questions))return;busy=true;render();safe((async()=>{try{const d=await action('review_submit',{target:'jia',answers:{...reviewSelection.answers}});reply=d.reply;audio.tone('jia');page='ending';focus=null;}catch(e){toast(String((e as Error).message||e));}finally{busy=false;render();}})());};
}

function renderEnding(){focus=null;scene.focus=null;const e=game.ending!;ui.innerHTML=`<div class="ending-shade"></div><div class="ending"><div class="tiny-label">责任审查 / ${e.kind==='truth'?'签名记录已提交':'记录尚待核验'}</div><h2>${escape(e.title)}</h2><div class="title-line"></div><p>${escape(e.body)}</p><p class="epilogue">${escape(e.epilogue)}</p><div class="ending-actions"><button class="solid-button" id="rewind">回到审查前继续调查 ↗</button><button class="text-button" id="home">返回主菜单 ↗</button></div><small>凌晨两点的清洁任务 · 终</small></div>`;
 $('#home').onclick=()=>{page='menu';render();};$('#rewind').onclick=()=>safe((async()=>{const d=await action('rewind');setState(d.state,true);page='play';render();toast(d.reply);})());
}
async function beginTalk(id:AgentId){halt();await sync();focus=id;scene.focus=id;const d=await action('greet',{target:id});reply=d.reply;audio.tone(id);if(id==='jia'&&game.review_pending){enterReview();return;}render();}
function endTalk(){if(busy)return;safe(action('leave'));focus=null;scene.focus=null;reply='';$<HTMLTextAreaElement>('#say')?.blur();render();}
function sendTalk(){if(voice.active||busy||(!focus&&!game.arrival_pending))return;const input=$<HTMLTextAreaElement>('#say'),text=input.value.trim();if(!text)return;const opening=game.arrival_pending;const id=opening?'xiaoye':focus!;busy=true;reply='它正在听……';render();safe((async()=>{try{const d=await action(opening?'wake':'talk',{target:id,text});reply=d.reply;audio.tone(id);if(opening){audio.power();toast(d.reply);reply='';}if(game.phase==='ending'){page='ending';focus=null;}else{const op=d.operation;if(op==='review_open'){reviewSelection.reset();focus='jia';page='review';}if(op==='route')toast('圆圆开始重走路径。');if(op==='authorize')toast('厨房后方的维护存储器已解锁。');}}catch(e){reply='请求未执行：'+String((e as Error).message||e);if(!opening)toast(reply);}finally{busy=false;render();}})());}
function isWalkable(p:Vec){if(p[0]<-6.7||p[0]>6.7||p[1]<-4.6||p[1]>4.6)return false;return !world.solids.some(([a,b,c,d])=>p[0]>a-.23&&p[0]<c+.23&&p[1]>b-.23&&p[1]<d+.23);}
function segmentClear(a:Vec,b:Vec){const n=Math.max(1,Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/.08));for(let i=1;i<=n;i++)if(!isWalkable([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n]))return false;return true;}
function anchor(id:string):Vec {return id==='yuanyuan'?game.robot:(world.agents[id as AgentId]||world.objects[id]).position;}
function nearby(){return [...Object.keys(world.agents),...Object.keys(world.objects)].map(id=>({id,d:Math.hypot(anchor(id)[0]-position[0],anchor(id)[1]-position[1])})).filter(x=>x.d<1.95).sort((a,b)=>a.d-b.d)[0]?.id;}
function getPath(start:Vec,end:Vec):Vec[]{if(!isWalkable(end))return [];if(segmentClear(start,end))return [end];
 // 0.35m grid A*, no diagonal corner cutting. Furnishings remain solid in both client and server.
 const step=.35,toGrid=(p:Vec)=>[Math.round((p[0]+6.65)/step),Math.round((p[1]+4.55)/step)],toPos=(x:number,z:number):Vec=>[x*step-6.65,z*step-4.55],key=(x:number,z:number)=>`${x},${z}`;
 const [sx,sz]=toGrid(start),[ex,ez]=toGrid(end);const open=[{x:sx,z:sz,g:0,f:0}],best=new Map<string,number>([[key(sx,sz),0]]),parents=new Map<string,string>();let final='';
 for(let loop=0;open.length&&loop<2200;loop++){open.sort((a,b)=>a.f-b.f);const cur=open.shift()!,k=key(cur.x,cur.z);if(cur.x===ex&&cur.z===ez){final=k;break;}for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=cur.x+dx,z=cur.z+dz,p=toPos(x,z);if(!isWalkable(p)||!segmentClear(toPos(cur.x,cur.z),p))continue;const ng=cur.g+Math.hypot(dx,dz),nk=key(x,z);if(ng>=(best.get(nk)??Infinity))continue;best.set(nk,ng);parents.set(nk,k);open.push({x,z,g:ng,f:ng+Math.hypot(x-ex,z-ez)});}}
 if(!final)return [];const reverse:Vec[]=[];while(final!==key(sx,sz)){const [x,z]=final.split(',').map(Number);reverse.push(toPos(x,z));final=parents.get(final)!;}reverse.reverse();if(!reverse.length||!segmentClear(start,reverse[0]))return [];reverse.push(end);return reverse;
}
function goTo(id:string|Vec){if(page!=='play'||focus||busy||game.arrival_pending)return;audio.start();if(typeof id!=='string'){pendingTarget=null;path=getPath(position,id);if(!path.length)toast('前面有障碍，换一个落脚点。');else{scene.goalMarker.position.set(id[0],.03,id[1]);scene.goalMarker.visible=true;}return;}
 const target=anchor(id);if(Math.hypot(target[0]-position[0],target[1]-position[1])<1.95){safe(interact(id));return;}
 // Choose an approachable, navigable stand point around the actual object/device.
 const candidates:Vec[]=[];for(let r=.85;r<=1.7;r+=.4)for(let a=0;a<Math.PI*2;a+=Math.PI/6)candidates.push([target[0]+Math.cos(a)*r,target[1]+Math.sin(a)*r]);candidates.sort((a,b)=>Math.hypot(a[0]-position[0],a[1]-position[1])-Math.hypot(b[0]-position[0],b[1]-position[1]));
 for(const p of candidates){if(!isWalkable(p))continue;const route=getPath(position,p);if(route.length){path=route;pendingTarget=id;scene.goalMarker.position.set(p[0],.03,p[1]);scene.goalMarker.visible=true;return;}}toast('暂时无法走到那里。');
}
async function interact(id:string){halt();scene.goalMarker.visible=false;await sync();if(id in world.agents){await beginTalk(id as AgentId);return;}const before=game.evidence.length,d=await action('inspect',{target:id});audio.tone('inspect');toast(d.reply);if(game.evidence.length>before){phone.expanded=game.evidence[game.evidence.length-1].id;phone.app='home';}}
function onKey(e:KeyboardEvent){const typing=e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLInputElement;if(e.key==='Escape'){e.preventDefault();if(page==='phone'){closePhone();return;}if(busy)return;if(page==='review'){cancelReview();return;}if(focus){endTalk();return;}if(page==='play'){halt();page='pause';render();}else if(page==='pause'){page='play';render();}else if(page==='saves'){page=returnPage;render();}return;}if(typing)return;if((e.key==='n'||e.key==='N')&&game.phase==='play'){if(page==='phone')closePhone();else if(page==='play'||page==='pause'||page==='review')openPhone();return;}if(game.arrival_pending)return;if(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(page==='play'&&!focus){keys.add(e.key.toLowerCase());path=[];pendingTarget=null;audio.start();}}if((e.key==='e'||e.key==='E')&&page==='play'&&!focus){const id=nearby();if(id)safe(interact(id));}}
window.addEventListener('keydown',onKey);window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();moveVector=[0,0];});
function initTouch(){const joy=$('#joystick');let active:number|null=null;joy.addEventListener('pointerdown',e=>{const ev=e as PointerEvent;active=ev.pointerId;joy.setPointerCapture(ev.pointerId);audio.start();path=[];pendingTarget=null;});joy.addEventListener('pointermove',e=>{const ev=e as PointerEvent;if(ev.pointerId!==active)return;const r=joy.getBoundingClientRect(),x=(ev.clientX-r.left-r.width/2)/(r.width*.35),z=(ev.clientY-r.top-r.height/2)/(r.height*.35),n=Math.max(1,Math.hypot(x,z));moveVector=[x/n,z/n];(joy.firstElementChild as HTMLElement).style.transform=`translate(${x/n*20}px,${z/n*20}px)`;});for(const ev of ['pointerup','pointercancel'])joy.addEventListener(ev,()=>{active=null;moveVector=[0,0];(joy.firstElementChild as HTMLElement).style.transform='';});$('#touch-act').onclick=()=>{const id=nearby();if(id)safe(interact(id));};}
let prev=performance.now();function animate(now:number){requestAnimationFrame(animate);const dt=Math.min(.05,(now-prev)/1000);prev=now;if(!scene)return;
 if(page==='play'&&!focus&&!game.arrival_pending&&game.phase==='play'){
  let x=0,z=0;const vx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+moveVector[0],vz=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+moveVector[1];
  if(vx||vz){const n=Math.max(1,Math.hypot(vx,vz));x=(vx*.817+vz*.576)/n;z=(-vx*.576+vz*.817)/n;}
  else if(path.length){const dest=path[0],dist=Math.hypot(dest[0]-position[0],dest[1]-position[1]);if(dist<.07)path.shift();else{x=(dest[0]-position[0])/dist;z=(dest[1]-position[1])/dist;}}
  if(x||z){const step=dt*2.35,next:Vec=[position[0]+x*step,position[1]+z*step];if(segmentClear(position,next))position=next;else if(isWalkable([next[0],position[1]]))position=[next[0],position[1]];else if(isWalkable([position[0],next[1]]))position=[position[0],next[1]];scene.setPlayer(position);audio.step();lastMove=now;}
  if(!path.length&&pendingTarget){const target=pendingTarget;pendingTarget=null;safe(interact(target));}
  if(!path.length)scene.goalMarker.visible=false;
  if(now-lastSync>300&&lastMove>lastSync&&!syncPending&&Math.hypot(position[0]-game.player[0],position[1]-game.player[1])>.02){syncPending=true;lastSync=now;safe(sync().catch(e=>{position=[...game.player];path=[];throw e;}).finally(()=>syncPending=false));}
  const id=nearby(),el=$('#hover');if(id){const p=scene.project(id),name=id in world.agents?world.agents[id as AgentId].name:world.objects[id].name;if(p){el.style.left=p.x+'%';el.style.top=p.y+'%';el.innerHTML=`<span class="key-cap">E</span> ${escape(name)}`;el.classList.add('visible');}}else el.classList.remove('visible');
 }
 if(page==='play'&&!game.arrival_pending&&game.phase==='play'&&now-lastTick>2000&&!busy&&!voice.active){lastTick=now;safe(action('tick',{seconds:2}));}
 scene.update(dt,now/1000);
 if(page==='play'){ui.querySelectorAll<HTMLButtonElement>('[data-object]').forEach(b=>{const id=b.dataset.object!,p=scene.project(id),a=anchor(id),d=Math.hypot(a[0]-position[0],a[1]-position[1]);b.style.display=focus||game.arrival_pending||d>=1.95?'none':'block';if(p){b.style.left=p.x+'%';b.style.top=(p.y+3)+'%';}});ui.querySelectorAll<HTMLButtonElement>('[data-device]').forEach(b=>{const p=scene.project(b.dataset.device!);b.style.display=focus||game.arrival_pending?'none':'block';if(p){b.style.left=p.x+'%';b.style.top=p.y+'%';}});}
}
async function boot(){ui.innerHTML='<div class="boot"><span class="thinking"></span><p>正在唤醒公寓……</p></div>';
 try{const [w,s,h]=await Promise.all([api('/world'),api('/state'),api('/health')]);world=w;mode=h.mode;speechAvailable=Boolean(h.speech);scene=new Apartment($<HTMLCanvasElement>('#scene'),w);scene.onSelect=goTo;game=s.phase==='menu'?{phase:'menu',review_pending:false,revision:0,phone_chat:[],arrival_pending:false,blood_trail:[],robot_contaminated:false,blood_source_cleaned:false,player:[-4.3,3.5],robot:[-2,1.6],robot_task:'patrol',light:'warm',door_open:false,archive_allowed:false,stain_cleaned:false,credit:58,clock:'01:47',evidence:[],events:[],transcript:[],ending:null,last_reply:'',last_agent:null}:s;phone=new PocketPhone({root:ui,state:()=>game,world:()=>world,active:()=>page==='phone',ask:text=>action('phone',{text}),close:closePhone});setState(game,true);hasGame=s.phase!=='menu';page='menu';render();initTouch();requestAnimationFrame(animate);}
 catch(e){ui.innerHTML=`<div class="boot"><h2>公寓暂未响应</h2><p>${escape(String(e))}</p><p>请确认本地服务已启动，并刷新页面。</p><button class="solid-button" id="retry">重试</button></div>`;$('#retry').onclick=()=>location.reload();}
}
void boot();
