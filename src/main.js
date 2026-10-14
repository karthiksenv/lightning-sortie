import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorld } from './world.js';
import { createJet } from './aircraft.js';
import { Effects } from './effects.js';
import { createFlightState, resetFlight, updateFlight } from './flight.js';
import { Input } from './input.js';
import { FlightAudio } from './audio.js';
import { Missions, MISSIONS } from './missions.js';
import { UI } from './ui.js';

const canvas=document.getElementById('game');
const scene=new THREE.Scene();
let renderer;
// Multisample antialiasing is expensive on integrated GPUs across a full city.
// A capped render scale keeps the HUD crisp without a multisampled framebuffer.
try { renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'}); }
catch(error) { document.getElementById('ui').innerHTML='<div style="padding:12vh 10vw;color:white;font:24px system-ui"><h1>Your aircraft is ready. Your browser needs WebGL2.</h1><p>Enable hardware acceleration and reopen this page in a current Chrome, Edge, Firefox, or Safari.</p></div>'; throw error; }
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.08;
const pmrem=new THREE.PMREMGenerator(renderer),environmentRoom=new RoomEnvironment();
const aircraftEnvironment=pmrem.fromScene(environmentRoom,.04).texture;
environmentRoom.dispose();pmrem.dispose();
const camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,0.5,65000);
scene.fog=new THREE.FogExp2(0x9dbac6,0.000043);
const ambient=new THREE.HemisphereLight(0xc9e4f4,0x606959,2.05);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xffeccb,3.1);scene.add(sun);
const rim=new THREE.DirectionalLight(0x9ccded,0.7);rim.position.set(500,400,800);scene.add(rim);
const world=createWorld(scene);
const jet=createJet();scene.add(jet);
function reflectAircraft(model){model.traverse(o=>{if(o.material?.isMeshStandardMaterial){o.material.envMap=aircraftEnvironment;o.material.envMapIntensity=.6;}});}
reflectAircraft(jet);
const effects=new Effects(scene),audio=new FlightAudio();
const flight=createFlightState();
const STORAGE='lightning-sortie-v1';
function readSave() {try{return JSON.parse(localStorage.getItem(STORAGE)||'{}');}catch{return{};}}
const saved=readSave();
const settings={muted:false,quality:'high',timeOfDay:'cycle',invertPitch:false,...saved.settings};
const records=saved.records||{};
let mode='menu',cameraMode=0,worldTime=0,clockPhase=0.14,nightAmount=0;
let accumulator=0,last=performance.now(),frames=0,fpsTime=last,fps=60,uiTime=0,shake=0,slowTime=0;
const temp=new THREE.Vector3(),cameraGoal=new THREE.Vector3(),lookGoal=new THREE.Vector3(),cameraLook=new THREE.Vector3(),cameraUp=new THREE.Vector3(0,1,0),cameraAnchor=new THREE.Vector3(),exhaust=new THREE.Vector3(),projected=new THREE.Vector3(),toGuide=new THREE.Vector3();
const menuPosition=new THREE.Vector3(5200,850,3900);
const ui=new UI({start,resume,restart,menu:returnToMenu,next:nextMission,pause,setting:changeSetting});
ui.settings={...settings};ui.setRecords(records);
const input=new Input(action);input.invertPitch=settings.invertPitch;
const missions=new Missions(scene,effects,audio,onMissionEvent);
const radarContext=ui.radar.getContext('2d');
audio.setEnabled(!settings.muted);

const skyUniforms={top:{value:new THREE.Color(0x6e9bb8)},horizon:{value:new THREE.Color(0xc4d6d8)},sunDirection:{value:new THREE.Vector3(-.7,.55,-.4).normalize()},night:{value:0}};
const sky=new THREE.Mesh(new THREE.SphereGeometry(58000,32,16),new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,uniforms:skyUniforms,
  vertexShader:'varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`varying vec3 direction; uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDirection; uniform float night;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
  void main(){vec3 d=normalize(direction); float h=pow(max(d.y,0.0),0.55); vec3 color=mix(horizon,top,h); float s=max(dot(d,sunDirection),0.0); color+=vec3(1.0,.7,.35)*pow(s,128.0)*.35*(1.0-night); color+=vec3(1.0,.93,.72)*smoothstep(.99965,.9999,s)*(1.0-night)*2.0;
  vec2 p=d.xz/max(.06,d.y)*3.0;float n=noise(p)*.57+noise(p*2.1)*.28+noise(p*4.3)*.15;float cloud=smoothstep(.57,.82,n)*smoothstep(.07,.23,d.y);color=mix(color,vec3(.8,.84,.84)*(1.0-night*.93),cloud*.63);
  vec2 grid=floor(d.xz/(max(.2,d.y))*650.0); float star=step(.9992,hash(grid));color+=star*night*smoothstep(.05,.35,d.y)*.55; gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  }`
}));scene.add(sky);
const dayTop=new THREE.Color(0x6395b2),dayHorizon=new THREE.Color(0xb4ccd3),nightTop=new THREE.Color(0x040b1c),nightHorizon=new THREE.Color(0x1a3043),duskHorizon=new THREE.Color(0xc7aa9b),duskTop=new THREE.Color(0x647d9b);

function save(){try{localStorage.setItem(STORAGE,JSON.stringify({settings,records}));}catch{/* Private browsing can disable persistence. */}}
function applyQuality(){const dpr=Math.min(devicePixelRatio||1,settings.quality==='high'?1.5:1)*(settings.quality==='low'?.7:settings.quality==='medium'?.9:1);renderer.setPixelRatio(dpr);renderer.setSize(innerWidth,innerHeight);}
function changeSetting(key,value){settings[key]=value;ui.settings[key]=value;if(key==='muted')audio.setEnabled(!value);if(key==='invertPitch')input.invertPitch=value;if(key==='quality')applyQuality();save();}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();applyQuality();}
addEventListener('resize',resize);resize();

function start(id){
  audio.start();input.clear();effects.clear();const mission=missions.start(id);
  for(const target of missions.targets)if(target.type==='air')reflectAircraft(target.mesh);
  resetFlight(flight,mission.spawn);
  if(flight.grounded)flight.position.y=world.terrainHeight(flight.position.x,flight.position.z)+3;
  flight.previous.copy(flight.position);cameraMode=0;mode='playing';ui.setMode(mode);accumulator=0;shake=0;
  jet.visible=true;jet.position.copy(flight.position);jet.quaternion.copy(flight.quaternion);setFlightCamera(1,true);
  ui.notify(id==='takeoff'?'Hold W for throttle, then ↑ to lift off. G retracts the gear.':id==='landing'?'Line up. Hold ↓ gently to descend; S reduces speed. Gear is already down.':id==='dogfight'||id==='strike'?'Center a target to lock. F / Square launches a missile.':'Bank with A / D. Climb with ↑. W / S sets throttle.');
  updateHUD();
}
function pause(){if(mode==='playing'){mode='paused';ui.setMode(mode);input.clear();audio.update(flight,false);}}
function resume(){if(mode!=='paused')return;mode='playing';ui.setMode(mode);input.clear();accumulator=0;last=performance.now();audio.start();}
function restart(){if(missions.active)start(missions.active.id);}
function returnToMenu(){mode='menu';ui.setMode(mode);input.clear();missions.clear();effects.clear();jet.visible=true;audio.update(flight,false);}
function nextMission(){const i=MISSIONS.indexOf(missions.active);start(MISSIONS[(i+1)%MISSIONS.length].id);}
function action(a){
  if(a==='pause'){if(ui.modal)ui.closeModal();else if(mode==='playing')pause();else if(mode==='paused')resume();return;}
  if(a==='back'){if(ui.modal)ui.closeModal();else if(mode==='paused')resume();return;}
  if(a==='disconnect'){if(mode==='playing'){pause();ui.notify('Controller disconnected. Reconnect or use the keyboard.');}return;}
  if(mode!=='playing')return;
  if(a==='gear'){flight.gear=!flight.gear;ui.notify(flight.gear?'Landing gear down':'Landing gear retracted');}
  if(a==='missile')missions.fireMissile(flight);
  if(a==='restart')restart();
  if(a==='camera'){cameraMode=(cameraMode+1)%3;ui.notify(['Chase camera','Close pursuit camera','Cockpit camera'][cameraMode]);}
  if(a==='day'){const phases=['day','dusk','night','cycle'];changeSetting('timeOfDay',phases[(phases.indexOf(settings.timeOfDay)+1)%phases.length]);ui.notify(`Light: ${settings.timeOfDay}`);}
}
function onMissionEvent(type,data){
  if(type==='notice')ui.notify(data);
  if(type==='damage'){shake=Math.max(shake,0.65);audio.cue('hit');}
  if(type==='complete'){
    if(!records[missions.active.id]||records[missions.active.id].score<data.score)records[missions.active.id]={score:data.score,grade:data.grade};
    save();ui.setRecords(records);mode='result';ui.result(data);audio.update(flight,false);
  }
}
function fail(detail){
  if(mode!=='playing')return;
  effects.burst(flight.position,0xffa04d,140);audio.cue('explosion');flight.health=0;jet.visible=false;mode='result';missions.done=true;
  ui.result({success:false,title:'Aircraft lost',grade:'—',score:missions.score,time:missions.time,detail});audio.update(flight,false);
}
addEventListener('blur',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();last=performance.now();accumulator=0;});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();ui.notify('Graphics context interrupted. Reload this page to restore flight.');});

function simulate(dt,commands){
  const event=updateFlight(flight,commands,dt,world);
  if(event==='crash'){fail('Ground impact. Keep altitude, or approach the runway slowly with the gear down.');return;}
  if(event==='runway-excursion'){fail('Runway excursion. Stay on the centerline and rotate before the runway ends.');return;}
  if(event==='touchdown'){missions.landed();audio.cue('gate');ui.notify('Touchdown — hold S / L2 to brake.');}
  if(!flight.grounded&&world.collides(flight.position,3.2)){fail('Airframe collision. Give buildings, bridges and terrain more room.');return;}
  if(Math.abs(flight.position.x)>33000||Math.abs(flight.position.z)>33000){fail('You left the flight region. Follow the radar back toward the city.');return;}
  missions.update(dt,flight,commands);
  if(flight.health<=0){fail('Airframe integrity lost. Keep moving and break away from enemy fire.');return;}
  if(flight.position.y>8500)flight.position.y=8500;
  exhaust.set(0,0,8).applyQuaternion(flight.quaternion).add(flight.position);
  if(flight.speed>40)effects.trail(exhaust,flight.afterburner?0xffa75c:0x99bfd2,flight.afterburner?2.8:1.05);
  jet.userData.update?.(dt,{throttle:flight.throttle,afterburner:flight.afterburner,gear:flight.gear,time:worldTime});
}

function lighting(dt){
  if(mode!=='paused')worldTime+=dt;
  if(settings.timeOfDay==='cycle'&&mode!=='paused')clockPhase=(clockPhase+dt/720)%1;
  const phase=settings.timeOfDay==='day'?.18:settings.timeOfDay==='dusk'?.47:settings.timeOfDay==='night'?.72:clockPhase;
  const elevation=Math.sin(phase*Math.PI*2);
  nightAmount=1-THREE.MathUtils.smoothstep(elevation,-.12,.3);
  const dusk=(1-nightAmount)*(1-THREE.MathUtils.smoothstep(elevation,.1,.48));
  skyUniforms.top.value.copy(dayTop).lerp(duskTop,dusk).lerp(nightTop,nightAmount);
  skyUniforms.horizon.value.copy(dayHorizon).lerp(duskHorizon,dusk).lerp(nightHorizon,nightAmount);
  skyUniforms.night.value=nightAmount;
  skyUniforms.sunDirection.value.set(-.72,elevation,.25).normalize();
  sun.position.copy(skyUniforms.sunDirection.value).multiplyScalar(10000);
  sun.color.setHex(dusk>.2?0xffbb7c:0xffecd2);sun.intensity=(1-nightAmount)*(2.5-dusk*.6)+.1;
  ambient.intensity=1.85-nightAmount*1.22;ambient.color.setHex(nightAmount>.5?0x789ed0:0xc7e4f4);rim.intensity=.6-nightAmount*.28;
  scene.fog.color.copy(skyUniforms.horizon.value);
  sky.position.copy(camera.position);
}

function setFlightCamera(dt,snap=false){
  const q=flight.quaternion;
  // Follow translation immediately; smooth only the offset and attitude.
  // Smoothing absolute world position added hundreds of metres at high speed.
  if(!snap){temp.subVectors(jet.position,cameraAnchor);camera.position.add(temp);cameraLook.add(temp);}
  cameraAnchor.copy(jet.position);
  if(cameraMode===2){cameraGoal.set(0,1.95,-4.5).applyQuaternion(q).add(jet.position);lookGoal.set(0,1.3,-300).applyQuaternion(q).add(jet.position);cameraUp.set(0,1,0).applyQuaternion(q);jet.visible=false;}
  else{
    jet.visible=mode!=='result'||flight.health>0;
    const distance=cameraMode===1?27:43;
    // Partial banking keeps the horizon readable while making turns feel immediate.
    cameraGoal.set(0,cameraMode===1?8:12,distance+flight.speed*.014).applyQuaternion(q).add(jet.position);
    lookGoal.set(0,2,-70).applyQuaternion(q).add(jet.position);cameraUp.set(0,1,0);
  }
  const blend=snap?1:1-Math.exp(-dt*5.5);
  camera.position.lerp(cameraGoal,blend);cameraLook.lerp(lookGoal,snap?1:1-Math.exp(-dt*7));camera.up.lerp(cameraUp,blend);
  if(shake>.01){camera.position.x+=Math.sin(worldTime*75)*shake*.25;camera.position.y+=Math.cos(worldTime*83)*shake*.2;shake=Math.max(0,shake-dt*1.6);}
  camera.lookAt(cameraLook);
  const fov=cameraMode===2?70:58+(flight.afterburner?7:0);camera.fov=THREE.MathUtils.damp(camera.fov,fov,3,dt);camera.updateProjectionMatrix();
}
function menuCamera(dt){
  jet.visible=true;jet.position.copy(menuPosition);jet.position.y+=Math.sin(worldTime*.37)*2;
  jet.rotation.set(.025, -.26+Math.sin(worldTime*.1)*.07, -.11);
  jet.userData.update?.(dt,{throttle:.56,afterburner:false,gear:false,time:worldTime});
  camera.position.copy(jet.position).add(temp.set(18+Math.sin(worldTime*.08)*1.3,10,25));
  camera.up.set(0,1,0);temp.copy(jet.position);temp.x-=14;temp.y-=4;temp.z-=2;camera.lookAt(temp);camera.fov=43;camera.updateProjectionMatrix();
}

function updateHUD(){
  const guide=missions.getGuide();let target=null;
  if(guide){
    projected.copy(guide.position).project(camera);toGuide.subVectors(guide.position,flight.position);
    const distance=toGuide.length(),inFront=temp.copy(toGuide).applyQuaternion(camera.quaternion.clone().invert()).z<0;
    let x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
    let label=`${guide.label} · ${distance>=1000?(distance/1000).toFixed(1)+' KM':Math.round(distance)+' M'}`;
    if(!inFront||Math.abs(projected.x)>.92||Math.abs(projected.y)>.82){
      const bearing=Math.atan2(toGuide.x,-toGuide.z),difference=Math.atan2(Math.sin(bearing-flight.heading),Math.cos(bearing-flight.heading));
      x=difference>=0?innerWidth-105:105;y=innerHeight*.5;label=`${difference>=0?'TURN RIGHT ›':'‹ TURN LEFT'} · ${(distance/1000).toFixed(1)} KM`;
    }
    target={x:THREE.MathUtils.clamp(x,100,innerWidth-100),y:THREE.MathUtils.clamp(y,150,innerHeight-190),label,visible:true,locked:guide.locked};
  }
  let warning='';
  if(Math.abs(flight.position.x)>30000||Math.abs(flight.position.z)>30000)warning='REGION BOUNDARY — TURN BACK';
  else if(flight.stall&&!flight.grounded)warning='LOW AIRSPEED — ADD THROTTLE';
  else if(flight.position.y-world.terrainHeight(flight.position.x,flight.position.z)<70&&!flight.grounded&&!flight.gear)warning='LOW ALTITUDE — PULL UP';
  else if(flight.gear&&flight.speed>150)warning='GEAR DOWN — G TO RETRACT';
  else if(missions.overheated)warning='CANNON COOLING';
  ui.update({speed:flight.speed*1.94384,altitude:flight.position.y*3.28084,heading:flight.heading*180/Math.PI,throttle:flight.throttle,health:flight.health,missiles:missions.missiles,score:missions.score,time:missions.time,missionTitle:missions.active?.title,missionId:missions.active?.id,objective:missions.objective,progress:missions.progress,gear:flight.gear,afterburner:flight.afterburner,pad:input.pad,warning,target,pitch:flight.pitch*180/Math.PI,roll:flight.roll*180/Math.PI,fps,cannonHeat:missions.heat,cannonOverheated:missions.overheated});
  drawRadar();
}
function drawRadar(){
  const c=radarContext,w=180,h=180,scale=.0105;
  c.clearRect(0,0,w,h);c.fillStyle='#10252cd9';c.fillRect(0,0,w,h);
  const point=(x,z)=>[90+(x-flight.position.x)*scale,90+(z-flight.position.z)*scale];
  c.strokeStyle='#42606c44';c.lineWidth=1;
  for(let i=0;i<180;i+=30){c.beginPath();c.moveTo(i,0);c.lineTo(i,180);c.moveTo(0,i);c.lineTo(180,i);c.stroke();}
  const city=point(-11000,-11500);c.fillStyle='#819d8a28';c.fillRect(city[0],city[1],18700*scale,14800*scale);
  const river=point(9400,-25000);c.fillStyle='#409eb331';c.fillRect(river[0]-8,river[1],16,50000*scale);
  for(const l of world.landmarks){const p=point(l.x,l.z);if(p[0]<5||p[0]>175||p[1]<5||p[1]>175)continue;c.fillStyle=l.type==='airport'||l.type==='airbase'?'#d3e5df':'#7a949b';c.fillRect(p[0]-2,p[1]-2,4,4);}
  for(let i=missions.gateIndex;i<missions.gates.length;i++){const p=point(missions.gates[i].position.x,missions.gates[i].position.z);c.strokeStyle=i===missions.gateIndex?'#ffc568':'#91bbb6';c.beginPath();c.arc(...p,i===missions.gateIndex?5:3,0,Math.PI*2);c.stroke();}
  for(const t of missions.targets)if(t.alive){const p=point(t.position.x,t.position.z);c.fillStyle='#ff7467';c.fillRect(p[0]-3,p[1]-3,6,6);}
  if(missions.active?.id==='landing'){const p=point(-6000,7500);c.fillStyle='#ffd187';c.fillRect(p[0]-2,p[1]-21,4,42);}
  c.save();c.translate(90,90);c.rotate(flight.heading);c.fillStyle='#f4f8ed';c.beginPath();c.moveTo(0,-8);c.lineTo(5,6);c.lineTo(0,3);c.lineTo(-5,6);c.closePath();c.fill();c.restore();
  c.strokeStyle='#9bbac125';c.beginPath();c.arc(90,90,60,0,Math.PI*2);c.stroke();
}

const dev=new URLSearchParams(location.search).has('dev');let devPanel;
if(dev){
  devPanel=document.createElement('div');devPanel.style.cssText='position:fixed;left:50%;bottom:4px;transform:translateX(-50%);z-index:99;background:#061019cc;color:#b8e2d8;padding:5px 10px;font:11px monospace;pointer-events:none';document.body.append(devPanel);
  window.__LIGHTNING__={flight,missions,world,renderer,scene,camera,jet,start,pause,resume,settings,ui,input,changeSetting,
    get mode(){return mode;},get fps(){return fps;},get worldTime(){return worldTime;},
    step(seconds,command={}){for(let i=0;i<Math.ceil(seconds*60)&&mode==='playing';i++)simulate(1/60,command);jet.position.copy(flight.position);jet.quaternion.copy(flight.quaternion);setFlightCamera(1,true);updateHUD();},
    setFlight(values){if(values.position)flight.position.set(...values.position);for(const [k,v]of Object.entries(values))if(k!=='position'&&k in flight&&typeof flight[k]!=='object')flight[k]=v;flight.previous.copy(flight.position);},
    snapshot(){return{mode,mission:missions.active?.id,position:flight.position.toArray(),speed:flight.speed,health:flight.health,score:missions.score,progress:missions.progress,targets:missions.targets.filter(t=>t.alive).length,fps,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,world:world.stats};}};
}

function frame(now){
  requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;
  const commands=input.poll(dt,mode==='playing');
  if(mode==='playing'){
    accumulator+=dt;
    while(accumulator>=1/60&&mode==='playing'){simulate(1/60,commands);accumulator-=1/60;}
    jet.position.lerpVectors(flight.previous,flight.position,accumulator*60);jet.quaternion.copy(flight.quaternion);
    setFlightCamera(dt);
  }else if(mode==='menu')menuCamera(dt);
  lighting(dt);
  if(mode!=='paused'){world.update(dt,worldTime,jet.position,nightAmount);effects.update(dt);}
  audio.update(flight,mode==='playing');
  renderer.render(scene,camera);
  uiTime+=dt;if(uiTime>.08){updateHUD();uiTime=0;}
  frames++;
  if(now-fpsTime>=1000){fps=Math.round(frames*1000/(now-fpsTime));frames=0;fpsTime=now;
    if(devPanel)devPanel.textContent=`${fps} FPS · ${renderer.info.render.calls} DRAWS · ${Math.round(renderer.info.render.triangles/1000)}K TRI · ${world.stats.buildings.toLocaleString()} BUILDINGS · ${settings.quality.toUpperCase()}`;
    if(mode==='playing'&&fps<48)slowTime++;else slowTime=0;
    if(slowTime>=4&&settings.quality!=='low'){changeSetting('quality',settings.quality==='high'?'medium':'low');slowTime=0;ui.notify('Graphics adjusted for smoother flight. Change quality in Settings.');}
  }
}
resetFlight(flight,MISSIONS[6].spawn);menuCamera(0);lighting(0);requestAnimationFrame(frame);
