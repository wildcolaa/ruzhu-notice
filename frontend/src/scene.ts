import * as THREE from 'three';
import type {Vec,World,GameState,AgentId} from './types';
const M=(color:string,roughness=.7,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const clay=M('#938177'),wallMat=M('#b7b2a2'),wood=M('#755342'),cream=M('#d8d2bb'),metal=M('#414b4b',.4,.6),dark=M('#283335'),sage=M('#717d71'),gold=M('#bd9966',.35,.5);
function box(w:number,h:number,d:number,mat:THREE.Material,x=0,y=0,z=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
function cyl(r:number,h:number,mat:THREE.Material,x=0,y=0,z=0,r2=r){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r2,h,32),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
function sphere(r:number,mat:THREE.Material,x=0,y=0,z=0){const m=new THREE.Mesh(new THREE.SphereGeometry(r,20,16),mat);m.position.set(x,y,z);m.castShadow=true;return m;}
function texture(draw:(c:CanvasRenderingContext2D)=>void,size=512){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d')!);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function print(text:string,bg='#ded7c0',fg='#394142',w=1,h=.5){const t=texture(c=>{c.fillStyle=bg;c.fillRect(0,0,512,512);c.fillStyle=fg;c.font='54px serif';c.textAlign='center';c.fillText(text,256,270);});const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t}));return m;}
export class Apartment {
 renderer:THREE.WebGLRenderer;scene=new THREE.Scene();camera:THREE.OrthographicCamera;
 player=new THREE.Group();robot=new THREE.Group();door=new THREE.Group();lamp:THREE.PointLight;warm:THREE.PointLight;screen:THREE.Mesh;stain:THREE.Group;routeLine:THREE.Line;
 interactive:THREE.Object3D[]=[];anchors:Record<string,THREE.Vector3>={};legs:THREE.Mesh[]=[];rain:THREE.Points;halo:THREE.Mesh;goalMarker:THREE.Mesh;
 ray=new THREE.Raycaster();pointer=new THREE.Vector2();floor:THREE.Mesh;
 robotTarget=new THREE.Vector3(-2,.16,1.6);mode='menu';focus:string|null=null;world:World;playerTarget:Vec=[-4.3,3.5];moving=false;
 ambient:THREE.AmbientLight;sun:THREE.DirectionalLight;moon:THREE.DirectionalLight;playerGlow:THREE.PointLight;
 bloodMesh!:THREE.InstancedMesh;bloodPool!:THREE.Mesh;ghost=new THREE.Group();robotStrip:THREE.MeshStandardMaterial;
 powerStart=-100;omenUntil=0;lastLight='off';clockText='';
 phoneOpen=false;phoneProp=new THREE.Group();
 brightness=0;doorTarget=0;uv=false;clock=new THREE.Clock();cameraLook=new THREE.Vector3(-3.2,.1,.2);lastTime=0;
 onSelect:(id:string|Vec)=>void=()=>{};
 constructor(canvas:HTMLCanvasElement,world:World){
 this.world=world;
 this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.98;
 this.scene.background=new THREE.Color('#080e13');this.scene.fog=new THREE.Fog('#080e13',32,75);
 this.camera=new THREE.OrthographicCamera(-12.5,12.5,7.03,-7.03,.1,100);this.camera.position.set(12,19,17);this.camera.lookAt(0,0,0);
 this.ambient=new THREE.AmbientLight('#7798a8',.055);this.scene.add(this.ambient);const sun=this.sun=new THREE.DirectionalLight('#cbbca3',.03);sun.position.set(-3,10,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-10;sun.shadow.camera.right=10;sun.shadow.camera.top=9;sun.shadow.camera.bottom=-9;sun.shadow.normalBias=.025;this.scene.add(sun);
 const moon=this.moon=new THREE.DirectionalLight('#82a9c4',.12);moon.position.set(3,6,-8);this.scene.add(moon);
 this.warm=new THREE.PointLight('#edbd8d',0,9,2);this.warm.position.set(-4,2.1,-1.5);this.scene.add(this.warm);
 this.lamp=new THREE.PointLight('#edc49a',0,10,2);this.lamp.position.set(.3,3,-1.1);this.scene.add(this.lamp);
 this.scene.add(box(14.8,.5,10.8,dark,0,-.45,0));this.scene.add(box(14.2,.12,10.2,M('#a5a18f'),0,-.13,0));
 const floorTex=texture(c=>{c.fillStyle='#817766';c.fillRect(0,0,512,512);for(let i=0;i<9;i++){c.fillStyle=i%2?'#96836d':'#9d8b73';c.fillRect(i*64,0,62,512);for(let j=0;j<70;j++){c.fillStyle='rgba(62,42,24,.08)';c.fillRect(i*64+Math.random()*60,Math.random()*512,.6,Math.random()*100);}}});floorTex.wrapS=floorTex.wrapT=THREE.RepeatWrapping;floorTex.repeat.set(3,2);
 this.floor=box(14,.09,10,new THREE.MeshStandardMaterial({map:floorTex,roughness:.88}),0,-.04,0);this.floor.userData.floor=true;this.scene.add(this.floor);
 this.scene.add(box(14,.18,.2,wood,0,.06,5));this.scene.add(box(.2,.2,10,wood,7,.07,0));
 // Cutaway walls retain the room's enclosure without hiding the player.
 this.scene.add(box(.18,2.7,10,wallMat,-7,1.35,0));this.scene.add(box(7.8,2.7,.18,wallMat,-3.1,1.35,-5));this.scene.add(box(1.25,2.7,.18,wallMat,6.3,1.35,-5));
 this.scene.add(box(.22,1.35,4,clay,-1.7,.67,-3));this.scene.add(box(.08,.08,4.05,wood,-1.7,1.36,-3));
 const skirting=M('#777669');this.scene.add(box(14,.14,.1,skirting,0,.07,-4.89));this.scene.add(box(.1,.14,10,skirting,-6.89,.07,0));
 // Rain-streaked window and an abstract, unlit city beyond it.
 const windowGroup=new THREE.Group();windowGroup.position.set(3.25,1.5,-5);
 const glass=box(4.6,2.3,.04,new THREE.MeshPhysicalMaterial({color:'#597988',roughness:.3,transparent:true,opacity:.47,metalness:.25}));windowGroup.add(glass);
 for(const x of [-2.35,0,2.35])windowGroup.add(box(.07,2.45,.1,metal,x,0,0));for(const y of [-1.2,1.2])windowGroup.add(box(4.8,.07,.1,metal,0,y,0));this.scene.add(windowGroup);
 for(let i=0;i<14;i++){const h=1+(i%5)*.65;this.scene.add(box(.65,h,.55,M(i%2?'#202d36':'#2e3b42'),-.6+i*.6,h/2,-6.3-(i%3)*.4));}
 const rainGeo=new THREE.BufferGeometry();const rainPositions=new Float32Array(240*3);for(let i=0;i<240;i++){rainPositions[i*3]=.9+Math.random()*4.5;rainPositions[i*3+1]=Math.random()*5;rainPositions[i*3+2]=-5.6-Math.random()*2;}rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));this.rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:'#97bac9',size:.018,transparent:true,opacity:.5}));this.scene.add(this.rain);
 const rugTex=texture(c=>{c.fillStyle='#786b68';c.fillRect(0,0,512,512);c.strokeStyle='#b7a68e';for(let i=0;i<6;i++){c.lineWidth=2;c.strokeRect(16+i*10,16+i*10,480-i*20,480-i*20);}for(let i=0;i<2500;i++){c.fillStyle='rgba(240,215,181,.07)';c.fillRect(Math.random()*512,Math.random()*512,2,2);}});
 const rug=new THREE.Mesh(new THREE.PlaneGeometry(5.4,4.2),new THREE.MeshStandardMaterial({map:rugTex,roughness:1}));rug.rotation.x=-Math.PI/2;rug.position.set(1,.015,1);rug.receiveShadow=true;this.scene.add(rug);
 this.bed();this.living();this.kitchen();this.details();
 this.playerGlow=new THREE.PointLight('#789bae',2.4,2.3,2);this.scene.add(this.playerGlow);
 this.player=this.makePlayer();this.player.position.set(-4.3,0,3.5);this.scene.add(this.player);this.phoneProp.add(box(.14,.25,.025,metal));this.phoneProp.add(box(.115,.21,.005,new THREE.MeshStandardMaterial({color:'#bcd5e0',emissive:'#6688ab',emissiveIntensity:.55}),0,0,.016));this.phoneProp.position.set(.22,.95,.19);this.phoneProp.rotation.set(-.5,.2,-.25);this.phoneProp.visible=false;this.player.add(this.phoneProp);
 this.robotStrip=new THREE.MeshStandardMaterial({color:'#86b4ad',emissive:'#4a979d',emissiveIntensity:.6});
 this.robot=this.makeRobot();this.robot.position.copy(this.robotTarget);this.scene.add(this.robot);this.bind(this.robot,'yuanyuan');
 // Door on the front wall: hinge and actual swing.
 this.door.position.set(-6.6,0,4.8);this.door.add(box(1.45,2.45,.12,M('#596967'),.72,1.22,0));this.door.add(box(.06,.18,.14,gold,1.28,1.2,.12));this.door.add(print('07','#596967','#d1d1bd',.33,.25));this.door.children[2].position.set(.74,1.75,.075);this.scene.add(this.door);
 const gate=new THREE.Group();gate.add(box(.3,.65,.18,metal));gate.add(box(.18,.22,.035,new THREE.MeshStandardMaterial({color:'#97c9a7',emissive:'#76b995',emissiveIntensity:1}),0,.08,.1));gate.position.set(-6.2,1.1,3.2);this.scene.add(gate);this.bind(gate,'shouze');
 const lightControl=new THREE.Group();lightControl.add(box(.6,.4,.08,cream));lightControl.add(cyl(.11,.025,gold,0,0,.06));lightControl.children[1].rotation.x=Math.PI/2;lightControl.position.set(.4,1.35,-3.6);this.scene.add(lightControl);this.bind(lightControl,'xiaoye');
 const terminal=new THREE.Group();terminal.add(box(.16,1.1,.82,metal));this.screen=box(.035,.82,.62,new THREE.MeshStandardMaterial({color:'#a6a1cd',emissive:'#a6a1cd',emissiveIntensity:.7}),-.095,0,0);terminal.add(this.screen);for(let i=0;i<5;i++)terminal.add(box(.02,.025,.3,cream,-.12,.27-i*.12,0));terminal.position.set(6,1.38,-2.7);this.scene.add(terminal);this.bind(terminal,'jia');
 const taskPoints=[[-2,1.6],[-2,-.5],[-3,-.5],[-4.4,-.6],[-4.4,-1.4],[-3,-.5],[-2,1.6]].map(p=>new THREE.Vector3(p[0],.045,p[1]));this.routeLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(taskPoints),new THREE.LineDashedMaterial({color:'#a4d3c0',dashSize:.15,gapSize:.13,transparent:true,opacity:.5}));this.routeLine.computeLineDistances();this.routeLine.visible=false;this.scene.add(this.routeLine);
 this.stain=new THREE.Group();const smearTex=texture(c=>{c.clearRect(0,0,512,512);c.strokeStyle='rgba(75,62,52,.65)';c.lineWidth=23;c.beginPath();c.moveTo(80,80);c.bezierCurveTo(180,160,220,210,380,440);c.stroke();c.lineWidth=8;c.strokeStyle='rgba(70,77,67,.45)';for(let i=0;i<3;i++){c.beginPath();c.arc(230,260,80+i*17,.1,2.5);c.stroke();}});const smear=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.65),new THREE.MeshBasicMaterial({map:smearTex,transparent:true,opacity:.43,depthWrite:false}));smear.rotation.x=-Math.PI/2;this.stain.add(smear);this.stain.position.set(-3,.018,-.5);this.scene.add(this.stain);this.bind(this.stain,'stain');
 this.buildBlood();
 this.halo=new THREE.Mesh(new THREE.RingGeometry(.3,.36,48),new THREE.MeshBasicMaterial({color:'#dac79d',transparent:true,opacity:.5,side:THREE.DoubleSide}));this.halo.rotation.x=-Math.PI/2;this.halo.position.y=.028;this.scene.add(this.halo);
 this.goalMarker=new THREE.Mesh(new THREE.RingGeometry(.1,.14,32),new THREE.MeshBasicMaterial({color:'#d5ceb5',transparent:true,opacity:.6,side:THREE.DoubleSide}));this.goalMarker.rotation.x=-Math.PI/2;this.goalMarker.visible=false;this.scene.add(this.goalMarker);
 new ResizeObserver(()=>this.resize()).observe(canvas.parentElement!);this.resize();
 canvas.addEventListener('pointerdown',e=>{if(this.mode!=='play'||this.focus)return;const hit=this.pick(e);if(hit)this.onSelect(hit);});
 }
 bind(obj:THREE.Object3D,key:string){obj.userData.target=key;this.interactive.push(obj);this.anchors[key]=obj.position.clone();}
 shadow(x:number,z:number,w:number,d:number){const t=texture(c=>{const g=c.createRadialGradient(256,256,30,256,256,256);g.addColorStop(0,'rgba(0,0,0,.36)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(0,0,512,512);});const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,.02,z);this.scene.add(m);}
 bed(){const g=new THREE.Group();g.position.set(-4.8,0,-3.1);g.add(box(2.4,.35,2.3,wood,0,.28,0));g.add(box(2.25,.27,2.18,cream,0,.6,0));g.add(box(2.5,.9,.12,sage,0,.65,-1.22));g.add(box(2.24,.13,1.3,M('#9eaaa0'),0,.79,.38));for(const x of [-.56,.56])g.add(box(.83,.16,.5,M('#e8e1ca'),x,.82,-.67));for(let i=0;i<9;i++)g.add(box(.02,.01,1.25,M('#838f87'),-.9+i*.22,.86,.38));this.scene.add(g);this.shadow(-4.8,-3,3.2,3);
 const bedside=box(.7,.6,.7,wood,-5.6,.3,-1.5);this.scene.add(bedside);this.scene.add(cyl(.12,.18,gold,-5.6,.74,-1.5));this.scene.add(cyl(.26,.4,M('#d6bf91'),-5.6,1.03,-1.5,.17));
 const bottle=new THREE.Group();bottle.add(cyl(.07,.22,new THREE.MeshStandardMaterial({color:'#b0c4b5',transparent:true,opacity:.72}),0,.1,0));bottle.add(cyl(.073,.055,cream,0,.23,0));bottle.add(box(.11,.1,.08,cream,0,.1,.02));bottle.position.set(-4.3,.86,-2.9);this.scene.add(bottle);this.bind(bottle,'medicine');this.scene.add(cyl(.06,.035,cream,-3.45,.06,-.57));
 const curtain=box(1.25,1.8,.1,M('#aaa698'),-4.2,1.4,-4.85);this.scene.add(curtain);for(let i=0;i<9;i++)this.scene.add(box(.035,1.8,.08,M('#8e9388'),-4.8+i*.15,1.4,-4.75));
 }
 living(){const sofa=new THREE.Group();sofa.position.set(.75,0,2.6);sofa.add(box(3.1,.3,1.0,M('#7d827d'),0,.35,0));sofa.add(box(3.15,.75,.25,sage,0,.7,.42));for(const x of [-1.48,1.48])sofa.add(box(.22,.62,1.04,sage,x,.58,0));for(const x of [-.9,0,.9])sofa.add(box(.83,.15,.73,M('#8f968c'),x,.62,-.07));for(const x of [-1.1,1.1])sofa.add(box(.35,.3,.14,M('#bcad91'),x,.94,.2));this.scene.add(sofa);this.shadow(.8,2.5,4,2);
 const table=new THREE.Group();table.position.set(1.5,0,.5);table.add(box(2.4,.12,1.0,M('#c0b29a'),0,.53,0));for(const x of [-1,1])for(const z of [-.3,.3])table.add(box(.08,.5,.08,wood,x,.24,z));table.add(cyl(.13,.06,cream,.4,.63,.15));table.add(cyl(.08,.18,M('#74665c'),.4,.73,.15));table.add(box(.42,.045,.57,M('#3c595d'),-.7,.63,-.1));this.scene.add(table);
 const report=print('鉴定摘要','#ddd6c0','#5e635f',.44,.6);report.rotation.x=-Math.PI/2;report.position.set(1.6,.61,.5);this.scene.add(report);this.bind(report,'report');
 const shelf=new THREE.Group();shelf.position.set(-.15,0,-4.5);shelf.add(box(2.5,.58,.5,wood,0,.3,0));for(let i=0;i<8;i++)shelf.add(box(.12,.3,.22,M(i%2?'#677878':'#b1a08a'),-.6+i*.15,.74,0));const tv=box(1.2,.77,.06,metal,.2,1.25,0);shelf.add(tv);shelf.add(box(1.1,.67,.015,new THREE.MeshStandardMaterial({color:'#1f2e33',emissive:'#233237',emissiveIntensity:.4}),.2,1.25,.04));this.scene.add(shelf);
 }
 kitchen(){const tileTex=texture(c=>{c.fillStyle='#78867f';c.fillRect(0,0,512,512);c.strokeStyle='#a4afa1';for(let i=0;i<512;i+=64){c.beginPath();c.moveTo(i,0);c.lineTo(i,512);c.moveTo(0,i);c.lineTo(512,i);c.stroke();}});const backsplash=box(2.7,.8,.08,new THREE.MeshStandardMaterial({map:tileTex}),4.1,1.4,-4.85);this.scene.add(backsplash);this.scene.add(box(2.7,.9,1.1,sage,4.1,.45,-4.15));this.scene.add(box(2.85,.1,1.16,M('#cec8b6'),4.1,.95,-4.15));for(let i=0;i<4;i++){this.scene.add(box(.025,.72,.015,M('#596961'),2.9+i*.65,.47,-3.58));this.scene.add(box(.23,.025,.04,gold,3.2+i*.65,.7,-3.54));}
 this.scene.add(box(.85,.04,.5,metal,3.3,1.025,-4.2));for(const x of [3.1,3.48])this.scene.add(cyl(.13,.022,dark,x,1.06,-4.2));this.scene.add(box(.55,.04,.43,metal,4.45,1.02,-4.2));this.scene.add(cyl(.023,.35,metal,4.68,1.15,-4.43));
 this.scene.add(box(1.1,2.15,1.1,M('#a8b1a8'),6.3,1.08,-4.1));this.scene.add(box(.04,.45,.05,metal,5.72,1.42,-3.85));
 const dining=new THREE.Group();dining.position.set(5.7,0,2.4);dining.add(cyl(.85,.08,wood,0,.82,0));dining.add(cyl(.1,.8,metal,0,.4,0));dining.add(cyl(.5,.04,metal,0,.02,0));dining.add(cyl(.14,.04,cream,.3,.89,.1));this.scene.add(dining);
 const receipt=print('23:41','#ded4b7','#726255',.35,.6);receipt.rotation.x=-Math.PI/2;receipt.position.set(4.3,.025,-.1);this.scene.add(receipt);this.bind(receipt,'receipt');
 const archive=new THREE.Group();archive.add(box(.4,.06,.27,metal));archive.add(box(.14,.025,.08,new THREE.MeshStandardMaterial({color:'#b2a5d1',emissive:'#b2a5d1',emissiveIntensity:.7}),0,.04,0));archive.position.set(5.2,1.05,-3.9);this.scene.add(archive);this.bind(archive,'archive');
 }
 details(){const mat=M('#567465');for(const [x,z] of [[-6.1,1.5],[6.3,.0],[2.4,-3.0]]){const g=new THREE.Group();g.position.set(x,0,z);g.add(cyl(.24,.42,M('#b7a18b'),0,.21,0,.19));for(let i=0;i<7;i++){const a=i*.9;const leaf=sphere(.22,mat,Math.cos(a)*.22,.65+i*.055,Math.sin(a)*.2);leaf.scale.set(.55,1.8,.75);leaf.rotation.z=Math.cos(a)*.55;g.add(leaf);}this.scene.add(g);}
 const notice=print('住 户 须 知','#d9d1b6','#4b574f',.75,.52);notice.rotation.x=-Math.PI/2;notice.rotation.z=.2;notice.position.set(-5.2,.045,2.9);this.scene.add(notice);this.bind(notice,'notice');
 const frame=box(1.1,.85,.07,wood,-6.86,1.7,-.2);frame.rotation.y=Math.PI/2;this.scene.add(frame);const art=box(.96,.7,.04,M('#c0b391'),-6.8,1.7,-.2);art.rotation.y=Math.PI/2;this.scene.add(art);const suit=box(.38,.58,.65,M('#665451'),-4.9,.3,3.8);this.scene.add(suit);
 for(let i=0;i<3;i++)this.scene.add(box(.15,.035,.3,M('#bdab85'),-2.6+i*.32,.035,3.6));
 }
 makePlayer(){const g=new THREE.Group();const coat=M('#d4c8ae'),pants=M('#3c4a4b'),skin=M('#c19e83'),hair=M('#292e2c');const torso=cyl(.19,.53,coat,0,.89,0,.24);g.add(torso);g.add(sphere(.135,skin,0,1.27,0));const h=sphere(.139,hair,0,1.32,-.016);h.scale.y=.65;g.add(h);for(const x of [-.09,.09]){const leg=cyl(.055,.43,pants,x,.36,0);g.add(leg);this.legs.push(leg);g.add(box(.1,.07,.2,hair,x,.11,.04));}for(const x of [-.25,.25]){const arm=cyl(.048,.42,coat,x,.86,0);arm.rotation.z=x>0?-.14:.14;g.add(arm);g.add(sphere(.044,skin,x,.64,0));}g.add(box(.21,.29,.12,M('#765d49'),.2,.68,-.03));this.shadow(-4.3,3.5,.65,.65);return g;}
 makeRobot(){const g=new THREE.Group();g.add(cyl(.35,.17,cream));g.add(cyl(.33,.028,metal,0,.1,0));g.add(cyl(.075,.07,metal,0,.15,-.1));g.add(box(.18,.028,.04,this.robotStrip,0,.045,.31));for(const x of [-.31,.31])g.add(box(.07,.11,.16,dark,x,-.04,0));return g;}
 buildBlood(){
 // Wet wheel smears are instanced; their canonical points are saved by the backend.
 const tracks=texture(c=>{c.clearRect(0,0,512,512);for(let lane=0;lane<4;lane++){c.strokeStyle=lane%2?'rgba(110,7,18,.82)':'rgba(157,18,29,.88)';c.lineWidth=38-lane*4;c.beginPath();c.moveTo(155+lane*42,40);c.bezierCurveTo(142+lane*45,150,170+lane*38,280,165+lane*42,470);c.stroke();}for(let i=0;i<20;i++){c.fillStyle='rgba(126,12,23,.65)';c.beginPath();c.ellipse(90+(i*53)%340,35+(i*71)%445,4+i%7,13+i%11,.2,0,Math.PI*2);c.fill();}});
 const trackMat=new THREE.MeshStandardMaterial({map:tracks,transparent:true,roughness:.29,metalness:.04,depthWrite:false,alphaTest:.025});
 this.bloodMesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(.24,.43),trackMat,480);this.bloodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.bloodMesh.count=0;this.bloodMesh.receiveShadow=true;this.bloodMesh.frustumCulled=false;this.bloodMesh.renderOrder=2;this.scene.add(this.bloodMesh);
 const pool=texture(c=>{c.clearRect(0,0,512,512);for(let i=0;i<38;i++){c.fillStyle=i%2?'rgba(93,4,12,.8)':'rgba(132,11,21,.83)';c.beginPath();c.ellipse(170+(i*61)%210,155+(i*97)%205,18+(i*19)%54,8+(i*11)%33,i*.37,0,Math.PI*2);c.fill();}c.strokeStyle='rgba(99,9,18,.9)';c.lineWidth=12;c.beginPath();c.moveTo(190,240);c.bezierCurveTo(100,330,70,390,25,485);c.stroke();});
 this.bloodPool=new THREE.Mesh(new THREE.PlaneGeometry(1.55,1.35),new THREE.MeshStandardMaterial({map:pool,transparent:true,roughness:.2,depthWrite:false,alphaTest:.03}));this.bloodPool.rotation.x=-Math.PI/2;this.bloodPool.position.set(-4.2,.035,-1.3);this.bloodPool.receiveShadow=true;this.bloodPool.renderOrder=3;this.scene.add(this.bloodPool);
 const ghostMat=new THREE.MeshBasicMaterial({color:'#020607',transparent:true,opacity:.5,depthWrite:false});this.ghost.add(cyl(.14,.83,ghostMat,0,1.05,0,.23));this.ghost.add(sphere(.12,ghostMat,0,1.62,0));this.ghost.position.set(4.75,0,-5.4);this.ghost.visible=false;this.scene.add(this.ghost);
 const warning=print('请 勿 醒 来','#121c21','#67494a',.92,.42);warning.position.set(.05,1.26,-4.455);this.scene.add(warning);
 }
 updateBlood(s:GameState){const points=s.blood_trail||[],dummy=new THREE.Object3D();this.bloodMesh.count=Math.min(480,points.length*2);for(let i=0;i<points.length&&i<240;i++){const p=points[i],prev=points[Math.max(0,i-1)],dx=p[0]-prev[0],dz=p[1]-prev[1],len=Math.hypot(dx,dz)||1,angle=Math.atan2(dx,dz);for(let wheel=0;wheel<2;wheel++){const sign=wheel===0?-1:1;dummy.position.set(p[0]+dz/len*.2*sign,.038+(i%3)*.0001,p[1]-dx/len*.2*sign);dummy.rotation.set(-Math.PI/2,0,angle);dummy.scale.set(1,.8+(i%5)*.1,1);dummy.updateMatrix();this.bloodMesh.setMatrixAt(i*2+wheel,dummy.matrix);}}this.bloodMesh.instanceMatrix.needsUpdate=true;}
 resize(){const el=this.renderer.domElement;this.renderer.setSize(el.clientWidth,el.clientHeight,false);}
 apply(s:GameState){if(s.arrival_pending&&s.phase==='play'){this.warm.intensity=0;this.lamp.intensity=0;this.ambient.intensity=.055;this.sun.intensity=.03;this.moon.intensity=.12;}if(this.lastLight==='off'&&s.light!=='off')this.powerStart=performance.now()/1000;if(this.clockText!==s.clock&&s.clock==='02:00')this.omenUntil=performance.now()/1000+2.8;this.lastLight=s.light;this.clockText=s.clock;this.playerTarget=s.player;this.robotTarget.set(s.robot[0],.16,s.robot[1]);this.doorTarget=s.door_open?-Math.PI*.6:0;this.brightness=s.light==='off'?0:s.light==='dim'?.12:s.light==='uv'?.72:1;this.uv=s.light==='uv';this.routeLine.visible=s.robot_task==='route';this.stain.visible=!s.stain_cleaned;(this.stain.children[0] as THREE.Mesh).material instanceof THREE.MeshBasicMaterial&&((this.stain.children[0] as THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>).material.opacity=this.uv?.9:.43);this.anchors.yuanyuan=this.robotTarget.clone();this.mode=s.phase;this.updateBlood(s);this.bloodPool.visible=!s.blood_source_cleaned;this.robotStrip.color.set(s.robot_contaminated?'#7e171c':'#86b4ad');this.robotStrip.emissive.set(s.robot_contaminated?'#ad1724':'#4a979d');}
 setPlayer(p:Vec){this.playerTarget=p;}
 pick(e:PointerEvent):string|Vec|null{const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);this.ray.setFromCamera(this.pointer,this.camera);const hits=this.ray.intersectObjects([...this.interactive,this.floor],true);for(const h of hits){let obj:THREE.Object3D|null=h.object;while(obj){if(obj.userData.target)return obj.userData.target as string;obj=obj.parent;}if(h.object===this.floor)return [h.point.x,h.point.z];}return null;}
 project(id:string){const p=(id==='yuanyuan'?this.robot.position:this.anchors[id])?.clone();if(!p)return null;p.y+=.65;p.project(this.camera);return {x:(p.x*.5+.5)*100,y:(-.5*p.y+.5)*100};}
 update(dt:number,t:number){dt=Math.min(dt,.05);const p=this.player.position;const target=new THREE.Vector3(this.playerTarget[0],0,this.playerTarget[1]);const dist=p.distanceTo(target);this.moving=dist>.02;const old=p.clone();p.lerp(target,Math.min(1,dt*22));if(this.moving){const angle=Math.atan2(target.x-old.x,target.z-old.z);this.player.rotation.y=angle;this.legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(t*11+i*Math.PI)*.3;});}else this.legs.forEach(leg=>leg.rotation.x*=.8);
 const prev=this.robot.position.clone();this.robot.position.lerp(this.robotTarget,Math.min(1,dt*4));if(prev.distanceTo(this.robot.position)>.005)this.robot.rotation.y=Math.atan2(this.robotTarget.x-prev.x,this.robotTarget.z-prev.z);
 this.door.rotation.y=THREE.MathUtils.lerp(this.door.rotation.y,this.doorTarget,dt*3);
 let illumination=(this.mode==='menu'||this.mode==='notice')?.36:this.brightness;const powerAge=t-this.powerStart;if(this.mode==='play'&&powerAge>0&&powerAge<2.2){const glitch=(powerAge>.28&&powerAge<.46)||(powerAge>.93&&powerAge<1.13);if(glitch)illumination*=.18;}if(t<this.omenUntil&&Math.sin(t*4)>.4)illumination*=.25;
 this.ambient.intensity=THREE.MathUtils.lerp(this.ambient.intensity,.055+illumination*.38,dt*4);this.sun.intensity=THREE.MathUtils.lerp(this.sun.intensity,.03+illumination*1.15,dt*4);this.moon.intensity=THREE.MathUtils.lerp(this.moon.intensity,.12+illumination*.36,dt*4);this.playerGlow.position.set(p.x,1.3,p.z+.25);this.playerGlow.intensity=THREE.MathUtils.lerp(this.playerGlow.intensity,illumination>.3?.65:2.4,dt*3);
 this.lamp.intensity=THREE.MathUtils.lerp(this.lamp.intensity,38*illumination,dt*3);this.lamp.color.lerp(new THREE.Color(this.uv?'#bed2ff':'#ffdb93'),dt*3);this.warm.intensity=THREE.MathUtils.lerp(this.warm.intensity,28*illumination,dt*3);
 this.ghost.visible=this.mode==='play'&&illumination>.2&&(t<this.omenUntil||(t-this.powerStart>1.2&&t-this.powerStart<3.5));
 const material=this.screen.material as THREE.MeshStandardMaterial;material.emissiveIntensity=.17+Math.sin(t*1.8)*.04;
 const rain=this.rain.geometry.attributes.position;for(let i=0;i<rain.count;i++){let y=rain.getY(i)-dt*(2+(i%4)*.3);if(y<0)y=5;rain.setY(i,y);}rain.needsUpdate=true;
 const look=new THREE.Vector3();let zoom=1;
 if(this.mode==='menu'||this.mode==='notice'){look.set(-3.8,.1,.3);zoom=.87;}
 else if(this.phoneOpen){look.set(p.x+3.3,.25,p.z-2.3);zoom=1.02;}
 else if(this.focus){const a=this.focus==='yuanyuan'?this.robot.position:this.anchors[this.focus];if(a){look.copy(a).lerp(this.player.position,.45);look.y=.3;}zoom=1.5;}
 else{look.set(p.x*.12,.0,p.z*.12);zoom=.91;}
 this.cameraLook.lerp(look,Math.min(1,dt*2.8));this.camera.position.copy(this.cameraLook).add(new THREE.Vector3(12,19,17));this.camera.lookAt(this.cameraLook);this.camera.zoom=THREE.MathUtils.lerp(this.camera.zoom,zoom,dt*2.8);this.camera.updateProjectionMatrix();
 this.phoneProp.visible=this.phoneOpen;
 this.halo.position.set(p.x,.028,p.z);this.halo.visible=this.mode==='play';this.halo.scale.setScalar(1+Math.sin(t*2)*.05);
 this.renderer.render(this.scene,this.camera);
 }
}
