import * as THREE from 'three';
import { createJet } from './aircraft.js';
import { segmentSphere } from './flight.js';

export const MISSIONS = [
  {id:'takeoff',title:'First light',subtitle:'Takeoff qualification',par:65,spawn:{position:[-6000,3,9000],speed:0,throttle:0.1,gear:true,grounded:true}},
  {id:'waypoints',title:'City circuit',subtitle:'Navigation flight',par:125,spawn:{position:[-6000,550,4200],speed:215,throttle:0.62}},
  {id:'skill',title:'Knife edge',subtitle:'Coastal skill course',par:110,spawn:{position:[19000,220,8000],speed:205,throttle:0.57}},
  {id:'dogfight',title:'Air superiority',subtitle:'Three hostile aircraft',par:180,spawn:{position:[2000,1500,4000],speed:250,throttle:0.7}},
  {id:'strike',title:'Thunder run',subtitle:'Ground strike',par:180,spawn:{position:[5000,800,19500],speed:215,throttle:0.6}},
  {id:'landing',title:'Coming home',subtitle:'Landing qualification',par:100,spawn:{position:[-6000,200,11500],speed:95,throttle:0.3,gear:true}},
  {id:'free',title:'Open skies',subtitle:'Explore without limits',par:0,spawn:{position:[-2500,1200,5500],speed:245,throttle:0.66,heading:0.23}},
];

const routes={
  takeoff:[[-6000,300,3700],[-6000,600,1000]],
  waypoints:[[-6000,550,2300],[-5200,670,100],[-3400,850,-1700],[-800,1000,-2400],[1800,950,-1700],[3700,700,300],[3000,600,3100]],
  skill:[[19000,150,6700],[19300,110,5200],[20100,160,3800],[21200,350,2600],[22100,700,1200],[21400,380,-300],[20200,200,-1900],[19000,160,-3500]],
};
const temp=new THREE.Vector3(),forward=new THREE.Vector3(),direction=new THREE.Vector3(),end=new THREE.Vector3();
const clamp=THREE.MathUtils.clamp;
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

export class Missions {
  constructor(scene,effects,audio,event) {
    this.scene=scene;this.effects=effects;this.audio=audio;this.event=event;
    this.group=new THREE.Group();scene.add(this.group);this.targets=[];this.gates=[];this.projectiles=[];
    this.gateGeometry=new THREE.TorusGeometry(1,0.026,8,64);
    this.missileGeometry=new THREE.CylinderGeometry(0.65,0.65,7,6);this.missileGeometry.rotateX(Math.PI/2);
    this.missileMaterial=new THREE.MeshBasicMaterial({color:0xffffff});
    this.active=null;this.objective='';this.score=0;this.time=0;this.progress=0;this.lockTarget=null;this.lockTime=0;this.missiles=12;
  }
  clear() {
    this.group.traverse(o=>{if(o.isMesh){if(o.geometry!==this.gateGeometry&&o.geometry!==this.missileGeometry)o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else if(o.material!==this.missileMaterial)o.material?.dispose();}});
    this.group.clear();this.targets=[];this.gates=[];this.projectiles=[];this.lockTarget=null;this.lockTime=0;
  }
  start(id) {
    this.clear();this.active=MISSIONS.find(m=>m.id===id)||MISSIONS[0];
    this.time=0;this.score=0;this.progress=0;this.gateIndex=0;this.kills=0;this.missiles=12;this.cooldown=0;this.gunClock=0;this.heat=0;this.overheated=false;this.done=false;this.touchdown=false;this.timeBonus=0;
    const route=routes[this.active.id];
    if(route) route.forEach((p,i)=>{
      const radius=id==='skill'?115:id==='takeoff'?210:190;
      const material=new THREE.MeshBasicMaterial({color:i===0?0xffbd62:0x9ce3ee,transparent:true,opacity:i===0?0.95:0.27,depthWrite:false});
      const ring=new THREE.Mesh(this.gateGeometry,material);ring.position.set(...p);ring.scale.setScalar(radius);
      const reference=route[Math.min(i+1,route.length-1)];
      if(i===route.length-1){temp.set(...route[Math.max(0,i-1)]);temp.sub(ring.position).negate().add(ring.position);}else temp.set(...reference);
      ring.lookAt(temp);this.group.add(ring);this.gates.push({mesh:ring,position:ring.position,radius});
    });
    if(id==='dogfight') {
      [[2000,1550,1200],[4200,1750,-1800],[-700,1350,-1200]].forEach((p,i)=>{
        const mesh=createJet({enemy:true});mesh.position.set(...p);mesh.scale.setScalar(1.45);this.group.add(mesh);
        this.targets.push({mesh,position:mesh.position,health:100,type:'air',name:`BANDIT ${i+1}`,heading:Math.PI/2+i*1.6,speed:165+i*13,baseAltitude:p[1],phase:i*2,fire:4+i,alive:true});
      });
    }
    if(id==='strike') {
      [[5000,15500],[6050,13900],[4400,12300],[6400,11100],[3600,10000]].forEach((p,i)=>{
        const mesh=this.makeGroundTarget(i);mesh.position.set(p[0],0,p[1]);this.group.add(mesh);
        this.targets.push({mesh,position:new THREE.Vector3(p[0],22,p[1]),health:90,type:'ground',name:i%2?'SAM SITE':'RADAR ARRAY',phase:i,fire:5+i,alive:true});
      });
    }
    this.updateObjective(); return this.active;
  }
  makeGroundTarget(index) {
    const g=new THREE.Group(),metal=new THREE.MeshStandardMaterial({color:0x555e51,roughness:0.85}),dark=new THREE.MeshStandardMaterial({color:0x252d2c});
    const box=(w,h,d,x,y,z,m=metal)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);g.add(mesh);return mesh;};
    box(95,2,85,0,1,0,dark);box(30,10,17,0,7,0);box(18,7,15,7,15,0);
    for(let i=-1;i<=1;i++)for(const side of [-1,1])box(7,7,3,i*10,4,side*10,dark);
    if(index%2===0){box(3,30,3,0,28,0);const radar=box(31,15,3,0,46,0);radar.rotation.x=-0.2;g.userData.radar=radar;}
    else for(let i=-1;i<=1;i++){const tube=box(4,5,31,i*6,20,0);tube.rotation.x=0.45;}
    const marker=new THREE.Mesh(new THREE.OctahedronGeometry(13),new THREE.MeshBasicMaterial({color:0xff6959,wireframe:true}));marker.position.y=80;g.add(marker);g.userData.marker=marker;
    return g;
  }
  updateObjective() {
    const id=this.active.id;
    if(id==='takeoff')this.objective=this.gateIndex?'Climb through the final gate.':'W throttle • hold ↑ to rotate at 135 KT • G retract gear';
    if(id==='waypoints'||id==='skill')this.objective=`Fly through gate ${Math.min(this.gateIndex+1,this.gates.length)} / ${this.gates.length}${id==='skill'?' • precision counts':''}`;
    if(id==='dogfight')this.objective=`Destroy hostile aircraft • ${this.kills} / 3 • aim to lock, F fire`;
    if(id==='strike')this.objective=`Destroy marked installations • ${this.kills} / 5 • aim to lock, F fire`;
    if(id==='landing')this.objective=this.touchdown?'Touchdown. Hold S / L2 to brake below 65 KT.':'Gear down • descend onto runway 36 • stay below 220 KT';
    if(id==='free')this.objective='Your sky. Explore the city, harbor and mountains. N changes the light.';
  }
  update(dt,s,input) {
    if(this.done||!this.active)return;
    this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.gunClock-=dt;
    if(this.active.id==='takeoff'&&!s.grounded&&this.gateIndex===0)this.objective=s.gear?'Airborne. G retracts gear. Level out and aim for the amber gate.':'Fly through the amber gate at 1,000 FT. Tap ↑ / ↓ to adjust altitude.';
    forward.set(0,0,-1).applyQuaternion(s.quaternion);
    for(const t of this.targets)if(t.alive){
      if(t.type==='air'){
        const distance=t.position.distanceTo(s.position);
        const desired=distance>3200?Math.atan2(s.position.x-t.position.x,-(s.position.z-t.position.z)):t.heading+0.55;
        t.heading+=clamp(angleDelta(t.heading,desired),-0.48*dt,0.48*dt);
        t.position.x+=Math.sin(t.heading)*t.speed*dt;t.position.z-=Math.cos(t.heading)*t.speed*dt;
        t.position.y=THREE.MathUtils.damp(t.position.y,t.baseAltitude+Math.sin(this.time*0.15+t.phase)*180,0.6,dt);
        t.mesh.rotation.set(0,-t.heading,-0.37,'YXZ');t.mesh.userData.update?.(dt,{throttle:0.7,afterburner:false,gear:false,time:this.time});
        t.fire-=dt;
        if(distance<1900&&distance>250&&t.fire<=0){
          temp.subVectors(s.position,t.position).normalize();direction.set(Math.sin(t.heading),0,-Math.cos(t.heading));
          if(temp.dot(direction)>0.65){this.effects.tracer(t.position,s.position,0xff6a4f);s.health=Math.max(0,s.health-7);this.event('damage',7);t.fire=2.7;}
        }
      }else{
        if(t.mesh.userData.radar)t.mesh.userData.radar.rotation.y=this.time*0.5;
        t.mesh.userData.marker.rotation.y=this.time;
        t.fire-=dt;
        if(t.fire<=0 && t.position.distanceTo(s.position)<2100){this.effects.tracer(t.position,s.position,0xff7455);s.health=Math.max(0,s.health-4);this.event('damage',4);t.fire=3.5;}
      }
    }
    this.acquireTarget(s,forward,dt);
    if(input.gun&&!this.overheated){
      this.heat=Math.min(1,this.heat+dt*0.32);
      if(this.gunClock<=0){
        end.copy(s.position).addScaledVector(forward,1500);this.effects.tracer(s.position,end,0xffe1a2);this.audio.cue('gun');this.gunClock=0.075;
      }
      for(const t of this.targets)if(t.alive){temp.subVectors(t.position,s.position);const distance=temp.length();if(distance<1900&&temp.normalize().dot(forward)>0.992){this.damage(t,dt*170);break;}}
      if(this.heat>=1){this.overheated=true;this.event('notice','Cannon cooling — use missiles');}
    }else{this.heat=Math.max(0,this.heat-dt*0.38);if(this.heat<0.25)this.overheated=false;}
    for(let i=this.projectiles.length-1;i>=0;i--){
      const m=this.projectiles[i];m.life-=dt;m.previous.copy(m.mesh.position);
      if(m.target.alive){direction.subVectors(m.target.position,m.mesh.position).normalize();m.direction.lerp(direction,Math.min(1,dt*3.5)).normalize();}
      m.mesh.position.addScaledVector(m.direction,850*dt);temp.copy(m.mesh.position).add(m.direction);m.mesh.lookAt(temp);
      this.effects.trail(m.mesh.position,0xffb671,5);
      const hit=m.target.alive&&segmentSphere(m.previous,m.mesh.position,m.target.position,m.target.type==='air'?46:65);
      if(hit)this.damage(m.target,110);
      if(hit||m.life<=0){this.group.remove(m.mesh);this.projectiles.splice(i,1);}
    }
    const gate=this.gates[this.gateIndex];
    if(gate){
      gate.mesh.rotation.z+=dt*0.08;
      if(segmentSphere(s.previous,s.position,gate.position,gate.radius)){
        // Grade the flight line's distance from the gate center, not the entry
        // point on its generous trigger sphere (which is always at the edge).
        direction.set(0,0,1).applyQuaternion(gate.mesh.quaternion);
        temp.subVectors(s.position,gate.position);
        temp.addScaledVector(direction,-temp.dot(direction));
        const accuracy=clamp(1-temp.length()/gate.radius,0,1);
        this.score+=Math.round(700+accuracy*300);gate.mesh.visible=false;this.gateIndex++;
        this.audio.cue('gate');this.event('notice',`Gate cleared  +${Math.round(700+accuracy*300)}`);
        if(this.gates[this.gateIndex]){this.gates[this.gateIndex].mesh.material.color.setHex(0xffbd62);this.gates[this.gateIndex].mesh.material.opacity=0.95;}
        this.progress=this.gateIndex/this.gates.length;this.updateObjective();
        if(this.gateIndex===this.gates.length)this.complete(s);
      }
    }
    if(this.active.id==='dogfight'||this.active.id==='strike'){
      this.progress=this.kills/this.targets.length;
      if(this.kills===this.targets.length)this.complete(s);
    }
    if(this.active.id==='landing'){
      this.progress=this.touchdown?0.85:clamp(1-(s.position.z-8500)/4500,0,0.8);
      if(this.touchdown&&s.grounded&&s.speed<33){this.score+=2500;this.complete(s);}
    }
    if(this.active.id==='free')this.score=Math.floor(this.time*5);
  }
  acquireTarget(s,f,dt) {
    let candidate=null,best=-Infinity;
    for(const t of this.targets)if(t.alive){temp.subVectors(t.position,s.position);const d=temp.length();const dot=temp.normalize().dot(f);const rank=dot-d/40000;if(d<6000&&rank>best){candidate=t;best=rank;}}
    if(candidate!==this.lockTarget)this.lockTime=0;
    this.lockTarget=candidate;
    if(candidate){temp.subVectors(candidate.position,s.position);const d=temp.length(),dot=temp.normalize().dot(f);this.lockTime=dot>0.93&&d<5500?Math.min(1,this.lockTime+dt/0.7):0;}
    else this.lockTime=0;
  }
  fireMissile(s) {
    if(this.done||!this.active)return;
    if(this.cooldown>0)return;
    if(this.missiles<=0){this.event('notice','Missiles depleted — cannon available');return;}
    if(!this.lockTarget||this.lockTime<1){this.event('notice','Point the nose at a target until LOCK appears');return;}
    const mesh=new THREE.Mesh(this.missileGeometry,this.missileMaterial);mesh.position.copy(s.position);mesh.position.y-=1.5;this.group.add(mesh);
    const dir=new THREE.Vector3(0,0,-1).applyQuaternion(s.quaternion);
    this.projectiles.push({mesh,previous:mesh.position.clone(),direction:dir,target:this.lockTarget,life:12});
    this.missiles--;this.cooldown=0.8;this.audio.cue('missile');this.event('notice','Fox three — missile away');
  }
  damage(t,amount) {
    if(!t.alive)return;t.health-=amount;
    if(t.health<=0){t.alive=false;t.mesh.visible=false;this.effects.burst(t.position,0xff9c55,90);this.audio.cue('explosion');this.kills++;this.score+=1500;this.event('notice',`${t.name} destroyed  +1500`);this.updateObjective();}
  }
  landed() {this.touchdown=true;this.updateObjective();}
  complete(s) {
    if(this.done)return;this.done=true;this.progress=1;
    const par=this.active.par||120;
    this.timeBonus=Math.round(Math.max(0,par*1.5-this.time)*15);
    this.score+=this.timeBonus+Math.round(s.health*10);
    const rating=(s.health/100)*0.45+clamp(par/Math.max(this.time,1),0,1.3)*0.55;
    const grade=rating>=1.05?'S':rating>=0.88?'A':rating>=0.68?'B':'C';
    this.audio.cue('success');this.event('complete',{success:true,title:'Sortie complete',grade,score:this.score,time:this.time,detail:`${Math.round(s.health)}% airframe integrity · ${this.timeBonus.toLocaleString()} time bonus`});
  }
  getGuide() {
    const gate=this.gates[this.gateIndex];
    if(gate)return{position:gate.position,label:`GATE ${this.gateIndex+1} / ${this.gates.length}`,locked:false};
    if(this.lockTarget?.alive)return{position:this.lockTarget.position,label:this.lockTime>=1?'LOCK · F / □':this.lockTarget.name,locked:this.lockTime>=1};
    if(this.active?.id==='landing')return{position:new THREE.Vector3(-6000,5,9000),label:'RUNWAY 36',locked:false};
    return null;
  }
}
