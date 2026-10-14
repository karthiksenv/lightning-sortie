import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Metres throughout. A seeded world means courses and landmarks never move.
const MAP_SIZE = 64000;
const TERRAIN_SEGMENTS = 192;
const HASH_SIZE = 300;
const TAU = Math.PI * 2;
function randomSeed(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const riverX = z => 9650 + Math.sin(z / 4300) * 1050 + Math.sin(z / 1300) * 180;

export function createWorld(scene) {
  const random = randomSeed(92843);
  const world = new THREE.Group(); world.name = 'Aster Coast — 64 km region'; scene.add(world);
  const collisions = new Map();
  const matrices = new THREE.Object3D();
  const staticBoxes = [];
  const detailGeometries = [];
  const roadVertices = [], roadColors = [];
  const paintVertices = [], paintColors = [];
  const runwayLights = [];
  const trees = [];
  const heightSamples = new Float32Array((TERRAIN_SEGMENTS + 1) ** 2);
  const landmarks = [
    { name: 'Kestrel Airbase', x: -6000, z: 7500, type: 'airbase' },
    { name: 'Aster City', x: 1000, z: -2500, type: 'city' },
    { name: 'Northgate International', x: -10800, z: -15100, type: 'airport' },
    { name: 'Crown Stadium', x: -3100, z: -1200, type: 'stadium' },
    { name: 'Coastal Arena', x: 4900, z: -8400, type: 'stadium' },
    { name: 'Harbor Point', x: 14500, z: -2200, type: 'port' },
    { name: 'East Channel Bridge', x: riverX(-1500), z: -1500, type: 'bridge' },
    { name: 'North Channel Bridge', x: riverX(-8000), z: -8000, type: 'bridge' },
    { name: 'Highland Ridge', x: -22200, z: -2200, type: 'mountains' },
  ];

  function rawTerrainHeight(x, z) {
    const coast = 16900 + Math.sin(z / 5700) * 1000 + Math.sin(z / 1900) * 290;
    const eastWater = smooth(coast - 500, coast + 900, x);
    const northSouthWater = smooth(20700, 26500, Math.abs(z));
    const westWater = 1 - smooth(-29100, -25200, x);
    const mountainBelt = Math.exp(-Math.pow((x + 22400) / 4300, 2));
    const peaks = 600 + 650 * Math.pow(Math.sin(z / 2600 + 0.4), 2) + 750 * Math.pow(Math.sin(z / 5100), 4);
    const mountain = mountainBelt * peaks * smooth(-15100, -18300, x);
    const channel = (1 - smooth(210, 490, Math.abs(x - riverX(z)))) * (1 - smooth(18200, 22100, Math.abs(z)));
    const water = Math.max(eastWater, northSouthWater, westWater, channel);
    return (mountain * (1 - water)) - 30 * water;
  }

  function isRunway(x, z) {
    return (Math.abs(x + 6000) < 55 && z > 5500 && z < 9500)
      || (Math.abs(x + 10800) < 68 && z > -17350 && z < -12850)
      || (Math.abs(x + 11900) < 55 && z > -16900 && z < -13400);
  }

  // Match the visible terrain triangles, not an unsampled analytic height field.
  // Water and runway surfaces participate too, so impacts cannot occur below them.
  function terrainHeight(x, z) {
    if (isRunway(x,z)) return 1.2;
    const gx=THREE.MathUtils.clamp((x+MAP_SIZE/2)/MAP_SIZE*TERRAIN_SEGMENTS,0,TERRAIN_SEGMENTS);
    const gz=THREE.MathUtils.clamp((z+MAP_SIZE/2)/MAP_SIZE*TERRAIN_SEGMENTS,0,TERRAIN_SEGMENTS);
    const ix=Math.min(TERRAIN_SEGMENTS-1,Math.floor(gx)),iz=Math.min(TERRAIN_SEGMENTS-1,Math.floor(gz));
    const u=gx-ix,v=gz-iz,i=iz*(TERRAIN_SEGMENTS+1)+ix;
    const a=heightSamples[i],b=heightSamples[i+TERRAIN_SEGMENTS+1],c=heightSamples[i+TERRAIN_SEGMENTS+2],d=heightSamples[i+1];
    const h=u+v<=1?a+u*(d-a)+v*(b-a):c+(1-u)*(b-c)+(1-v)*(d-c);
    return Math.max(-12,h);
  }

  function addCollider(x, z, w, d, h, bottom = 0, yaw = 0) {
    const co=Math.cos(yaw),si=Math.sin(yaw),extentX=Math.abs(co)*w/2+Math.abs(si)*d/2,extentZ=Math.abs(si)*w/2+Math.abs(co)*d/2;
    const collider = {x,z,co,si,halfW:w/2,halfD:d/2,minX:x-extentX,maxX:x+extentX,minZ:z-extentZ,maxZ:z+extentZ,top:bottom+h,bottom};
    for (let hx = Math.floor(collider.minX / HASH_SIZE); hx <= Math.floor(collider.maxX / HASH_SIZE); hx++) {
      for (let hz = Math.floor(collider.minZ / HASH_SIZE); hz <= Math.floor(collider.maxZ / HASH_SIZE); hz++) {
        const key = `${hx},${hz}`;
        if (!collisions.has(key)) collisions.set(key, []);
        collisions.get(key).push(collider);
      }
    }
  }

  function collides(position, radius = 6) {
    const x = position.x, y = position.y, z = position.z;
    for (let hx = Math.floor((x - radius) / HASH_SIZE); hx <= Math.floor((x + radius) / HASH_SIZE); hx++) {
      for (let hz = Math.floor((z - radius) / HASH_SIZE); hz <= Math.floor((z + radius) / HASH_SIZE); hz++) {
        const bucket = collisions.get(`${hx},${hz}`);
        if (!bucket) continue;
        for (const b of bucket) {
          if (y + radius < b.bottom || y - radius > b.top) continue;
          const rx=x-b.x,rz=z-b.z;
          const dx=Math.max(Math.abs(rx*b.co-rz*b.si)-b.halfW,0);
          const dz=Math.max(Math.abs(rx*b.si+rz*b.co)-b.halfD,0);
          const dy=Math.max(b.bottom-y,0,y-b.top);
          if (dx * dx + dy * dy + dz * dz <= radius * radius) return true;
        }
      }
    }
    return false;
  }

  function box(x, y, z, w, h, d, color = 0x7b8890, yaw = 0, collision = true) {
    staticBoxes.push({ x, y, z, w, h, d, color, yaw });
    if (collision) addCollider(x, z, w, d, h, y - h / 2, yaw);
  }

  function quad(vertices, colors, x, z, w, d, color, y = 0.7, yaw = 0) {
    const c = new THREE.Color(color); const co = Math.cos(yaw), si = Math.sin(yaw);
    for (const [u, v] of [[-0.5,-0.5],[-0.5,0.5],[0.5,0.5],[-0.5,-0.5],[0.5,0.5],[0.5,-0.5]]) {
      vertices.push(x + u * w * co + v * d * si, y, z - u * w * si + v * d * co);
      colors.push(c.r, c.g, c.b);
    }
  }
  const road = (x,z,w,d,c=0x48535a,y=0.8,yaw=0) => quad(roadVertices,roadColors,x,z,w,d,c,y,yaw);
  const paint = (x,z,w,d,c=0xc5c7bb,y=1,yaw=0) => quad(paintVertices,paintColors,x,z,w,d,c,y,yaw);

  function instances(name, geometry, material, items, castShadow = false) {
    if (!items.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, items.length); mesh.name = name;
    items.forEach((b, i) => {
      matrices.position.set(b.x,b.y,b.z); matrices.rotation.set(0,b.yaw || 0,0); matrices.scale.set(b.w,b.h,b.d); matrices.updateMatrix();
      mesh.setMatrixAt(i, matrices.matrix);
      if (b.color !== undefined) mesh.setColorAt(i, new THREE.Color(b.color));
    });
    mesh.castShadow = castShadow; mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); world.add(mesh); return mesh;
  }

  function addDetail(geometry, x, y, z, color, scale = [1,1,1], rotation = [0,0,0]) {
    const g = geometry.toNonIndexed ? (geometry.index ? geometry.toNonIndexed() : geometry.clone()) : geometry;
    matrices.position.set(x,y,z); matrices.rotation.set(...rotation); matrices.scale.set(...scale); matrices.updateMatrix(); g.applyMatrix4(matrices.matrix);
    const c = new THREE.Color(color); const colors = new Float32Array(g.getAttribute('position').count * 3);
    for(let i=0;i<colors.length;i+=3) { colors[i]=c.r; colors[i+1]=c.g; colors[i+2]=c.b; }
    g.setAttribute('color',new THREE.BufferAttribute(colors,3)); g.deleteAttribute('uv');
    detailGeometries.push(g);
  }

  // Ocean has broad, subtle procedural wave color variation, no external texture.
  const waterCanvas = document.createElement('canvas'); waterCanvas.width = waterCanvas.height = 256;
  const wc = waterCanvas.getContext('2d'); wc.fillStyle = '#226776'; wc.fillRect(0,0,256,256);
  for(let i=0;i<1100;i++) { wc.fillStyle=`rgba(100,176,179,${0.025+random()*0.08})`; wc.fillRect(random()*256,random()*256,2+random()*36,0.7); }
  const waterTexture = new THREE.CanvasTexture(waterCanvas); waterTexture.wrapS=waterTexture.wrapT=THREE.RepeatWrapping; waterTexture.repeat.set(160,160); waterTexture.colorSpace=THREE.SRGBColorSpace;
  const waterMaterial = new THREE.MeshStandardMaterial({ color:0x84a8b4,map:waterTexture,roughness:0.39,metalness:0.32 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(110000,110000),waterMaterial); ocean.rotation.x=-Math.PI/2; ocean.position.y=-12; ocean.name='Open ocean'; world.add(ocean);

  const land = new THREE.PlaneGeometry(MAP_SIZE,MAP_SIZE,TERRAIN_SEGMENTS,TERRAIN_SEGMENTS); land.rotateX(-Math.PI/2);
  const pos=land.getAttribute('position'); const terrainColors = new Float32Array(pos.count*3);
  const grassColor = new THREE.Color(), grassBase = new THREE.Color(0x647b68), sandColor = new THREE.Color(0xb6ad87), mountainColor = new THREE.Color(0x7a8882);
  for(let i=0;i<pos.count;i++) {
    const x=pos.getX(i),z=pos.getZ(i),h=rawTerrainHeight(x,z); pos.setY(i,h);heightSamples[i]=h;
    grassColor.copy(grassBase).multiplyScalar(0.91+random()*0.13);
    if(h<0) grassColor.lerp(sandColor,Math.min(1,-h/10));
    if(h>200) grassColor.lerp(mountainColor,Math.min(0.85,h/1700));
    if(h>1450) grassColor.lerp(new THREE.Color(0xd0d3cf),(h-1450)/800);
    terrainColors[i*3]=grassColor.r;terrainColors[i*3+1]=grassColor.g;terrainColors[i*3+2]=grassColor.b;
  }
  land.setAttribute('color',new THREE.BufferAttribute(terrainColors,3));land.computeVertexNormals();
  const landMesh = new THREE.Mesh(land,new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true}));landMesh.name='Coastal terrain';landMesh.receiveShadow=true;world.add(landMesh);

  // A regular road network makes low flight readable. Geometry is merged into two draws.
  const cityMinX=-11040,cityMaxX=7680,cityMinZ=-11520,cityMaxZ=3360,block=480;
  road(-1680,-4080,19500,15750,0x596a61,0.3);
  for(let x=cityMinX;x<=cityMaxX;x+=block) {
    road(x,-4080,42,14880);
    for(let z=cityMinZ+85;z<cityMaxZ;z+=120) paint(x,z,1.8,31,0xb3b5a3);
  }
  for(let z=cityMinZ;z<=cityMaxZ;z+=block) {
    road(-1680,z,18720,42);
    for(let x=cityMinX+85;x<cityMaxX;x+=120) paint(x,z,31,1.8,0xb3b5a3);
  }
  // A ring road, shoreline highway, and airbase access road extend beyond the city.
  road(-11900,-2900,88,23400); road(-1650,-12150,20600,88);road(-1650,3970,20600,88);
  road(8150,-3200,88,22000);road(-7200,6200,58,4400);road(-6450,4150,1560,58);
  for(let z=-14000;z<10000;z+=180){paint(-11900,z,3,70,0xbdb59a);paint(8150,z,3,70,0xbdb59a);}

  function facadeTexture(emissive) {
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;const c=canvas.getContext('2d');
    c.fillStyle=emissive?'#000000':'#bac5c8';c.fillRect(0,0,128,256);
    for(let x=4;x<128;x+=16) for(let y=5;y<256;y+=16) {
      const lit=random()>0.37;
      c.fillStyle=emissive?(lit?(random()>0.22?'#cfc091':'#9bbbc7'):'#010202'):(random()>0.22?'#516c77':'#657d87');
      c.fillRect(x,y,9,8);
      if(!emissive){c.fillStyle='#9caeb5';c.fillRect(x,y+9,10,1);}
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
  }
  const buildingMaterial = new THREE.MeshLambertMaterial({map:facadeTexture(false),emissiveMap:facadeTexture(true),emissive:0xffddbb,emissiveIntensity:0});
  // Each planar facade has a constant normal, so vertex lighting preserves the
  // city silhouette while avoiding thousands of expensive PBR surfaces.
  buildingMaterial.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vFacadeWall;').replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvFacadeWall=1.0-step(0.5,abs(normal.y));');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vFacadeWall;').replace('#include <map_fragment>','vec4 facadeBase=diffuseColor;\n#include <map_fragment>\ndiffuseColor=mix(facadeBase*vec4(.55,.55,.55,1.0),diffuseColor,vFacadeWall);').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=vFacadeWall;');
  };
  buildingMaterial.customProgramCacheKey=()=> 'building-facade-wall-mask-v1';
  const buildingChunks = new Map();
  const buildingBox=new THREE.BoxGeometry(1,1,1);
  // Roof faces should stay solid rather than have windows.
  const uv=buildingBox.getAttribute('uv');for(let i=8;i<16;i++)uv.setXY(i,0.01,0.01);
  let buildingCount=0;
  function reserved(x,z) {
    return (Math.abs(x+3100)<590&&Math.abs(z+1200)<550)||(Math.abs(x-4900)<510&&Math.abs(z+8400)<470)
      ||(Math.abs(x-1050)<640&&Math.abs(z+2650)<740) // central civic square
      ||(Math.abs(x+7400)<570&&Math.abs(z+6000)<840); // park
  }
  for(let gx=cityMinX;gx<cityMaxX;gx+=block) for(let gz=cityMinZ;gz<cityMaxZ;gz+=block) {
    const cx=gx+block/2,cz=gz+block/2;
    if(reserved(cx,cz))continue;
    const downtown=Math.exp(-((cx-1000)**2/16000000+(cz+2500)**2/19000000));
    const n=2+Math.floor(random()*3);
    for(let bx=0;bx<n;bx++) for(let bz=0;bz<2;bz++) {
      if(random()<0.075)continue;
      const x=gx+65+(bx+0.5)*(350/n)+(random()-0.5)*20;
      const z=gz+90+bz*205+(random()-0.5)*20;
      const w=(350/n)*(0.63+random()*0.2),d=85+random()*62;
      const h=18+random()*45+downtown*(45+Math.pow(random(),1.5)*365);
      const key=`${Math.floor((x-cityMinX)/3200)},${Math.floor((z-cityMinZ)/3200)}`;
      if(!buildingChunks.has(key))buildingChunks.set(key,[]);
      const tint=new THREE.Color().setHSL(0.55+random()*0.035,0.07+random()*0.13,0.54+random()*0.24);
      buildingChunks.get(key).push({x,y:h/2,z,w,h,d,color:tint}); addCollider(x,z,w,d,h);buildingCount++;
      if(h>190 && random()>0.35) box(x,h+5,z,w*.48,10,d*.48,0x7d8c93);
      if(random()<0.25) trees.push({x:gx+42,y:14,z:gz+75+random()*300,w:18,h:28,d:18,color:0x426b56});
    }
  }
  for(const [key,items] of buildingChunks) instances(`City district ${key}`,buildingBox,buildingMaterial,items);

  // Civic center and park deliberately leave broad gaps between towers.
  road(1050,-2650,1120,1320,0x7f8982,1.1);
  for(let i=0;i<10;i++)box(590+i*103,2,-2000,5,4,1250,0xa4aaa3);
  box(1050,78,-2840,310,156,380,0x9faeb3,0,true);box(1050,161,-2840,240,10,310,0xc7c5b4);
  addDetail(new THREE.ConeGeometry(48,170,4),1050,250,-2840,0xadbcc0,[1,1,1],[0,Math.PI/4,0]);
  addCollider(1050,-2840,100,100,350);
  road(-7400,-6000,1050,1530,0x496d53,1.2);
  road(-7400,-6000,28,1510,0xa39e84,1.3);road(-7400,-6000,1010,28,0xa39e84,1.3);
  for(let i=0;i<90;i++) trees.push({x:-7890+random()*980,y:18,z:-6720+random()*1440,w:18+random()*18,h:27+random()*20,d:26,color:0x3d654d});
  // Scattered tree belts soften the city edge and ground the huge flat airfield.
  for(let i=0;i<1650;i++) {
    const x=-15300+random()*30800,z=-19900+random()*39800;
    if(x>cityMinX-160&&x<8300&&z>cityMinZ-160&&z<4200)continue;
    if(Math.abs(x+6000)<1900&&z>4700&&z<10400)continue;
    if(Math.abs(x+10800)<1900&&z<-12000)continue;
    if(terrainHeight(x,z)<-1)continue;
    trees.push({x,y:11+random()*5,z,w:17+random()*15,h:22+random()*12,d:22,color:new THREE.Color().setHSL(.36,.19,.24+random()*.12)});
  }

  function stadium(x,z,scale=1) {
    road(x,z,1050*scale,930*scale,0x647171,1);
    road(x,z,620*scale,340*scale,0x44745b,2.8);
    paint(x,z,600*scale,4,0xccd1b8,3); paint(x,z,4,310*scale,0xccd1b8,3);
    for(let i=0;i<32;i++) {
      const a=i/32*TAU;const sx=x+Math.cos(a)*410*scale,sz=z+Math.sin(a)*295*scale;
      box(sx,37*scale,sz,85*scale,70*scale,145*scale,i%3?0x8599a1:0xb4bab4,-a+Math.PI/2,true);
      box(x+Math.cos(a)*430*scale,80*scale,z+Math.sin(a)*320*scale,88*scale,9*scale,155*scale,0xb8c8c8,-a+Math.PI/2);
    }
    for(const dx of [-420,420])for(const dz of [-330,330]) {
      box(x+dx*scale,70*scale,z+dz*scale,6,140*scale,6,0x828f91);box(x+dx*scale,141*scale,z+dz*scale,62,10,10,0xe0ddbb);
    }
  }
  stadium(-3100,-1200,1);stadium(4900,-8400,.83);

  function runway(x,z,length,width,number='36') {
    road(x,z,width+130,length+200,0x849078,0.65);
    road(x,z,width,length,0x343f48,1.2);
    paint(x-width/2+4,z,2.2,length-20,0xd7d9ce,1.3);paint(x+width/2-4,z,2.2,length-20,0xd7d9ce,1.3);
    for(let dz=-length/2+180;dz<length/2-100;dz+=145)paint(x,z+dz,3,65,0xd5d8ca,1.4);
    for(const end of [-1,1]) {
      for(let i=-4;i<=4;i++)if(i!==0)paint(x+i*width/11,z+end*(length/2-90),width/17,95,0xe7e6da,1.4);
      paint(x-25,z+end*(length/2-430),12,55,0xe7e6da,1.4);paint(x+25,z+end*(length/2-430),12,55,0xe7e6da,1.4);
      for(let i=-2;i<=2;i++)runwayLights.push({x:x+i*width/5,y:2,z:z+end*(length/2+4),w:3,h:2,d:3,color:end===1?0x6affb2:0xff775f});
    }
    for(let dz=-length/2;dz<=length/2;dz+=65)for(const side of [-1,1])runwayLights.push({x:x+side*(width/2+5),y:2,z:z+dz,w:2.5,h:2,d:2.5,color:0xffe5a8});
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,128,128);ctx.fillStyle='#e8e8dc';ctx.font='bold 82px monospace';ctx.textAlign='center';ctx.fillText(number,64,89);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
    const markings=new THREE.Mesh(new THREE.PlaneGeometry(54,74),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,side:THREE.DoubleSide}));markings.rotation.x=-Math.PI/2;markings.position.set(x,1.5,z+length/2-220);world.add(markings);
  }

  function parkedPlane(x,z,scale=1,yaw=0) {
    const transform=(dx,dz)=>[x+Math.cos(yaw)*dx+Math.sin(yaw)*dz,z-Math.sin(yaw)*dx+Math.cos(yaw)*dz];
    let p=transform(0,0);box(p[0],5*scale,p[1],4*scale,4*scale,32*scale,0xbdc6c4,yaw);
    p=transform(0,3*scale);box(p[0],5*scale,p[1],29*scale,1.2*scale,7*scale,0xa4b2b6,yaw);
    p=transform(0,13*scale);box(p[0],8*scale,p[1],1.2*scale,9*scale,8*scale,0x738d9a,yaw);
    box(p[0],6*scale,p[1],12*scale,1*scale,4*scale,0xb0babe,yaw);
  }

  runway(-6000,7500,4000,110);
  road(-6500,7500,75,4080,0x556068,1.1);road(-6740,7500,750,2300,0x737e81,1.0);
  for(const z of [5680,6300,8200,9290])road(-6250,z,500,65,0x556068,1.05);
  for(let i=0;i<7;i++) {
    const z=6150+i*380;box(-7110,30,z,175,60,240,0x9baba7,0,true);box(-7031,27,z,5,46,188,0x34464b);
    box(-7100,62,z,195,5,260,0x74878b);parkedPlane(-6850,z,1.0,Math.PI/2);
    paint(-6710,z,105,3,0xd6b361,1.5);
  }
  box(-7070,11,5350,270,22,160,0x7f9298,0,true);box(-6980,55,5300,40,110,40,0x9eaead,0,true);box(-6980,116,5300,90,25,70,0x526d7b);box(-6980,133,5300,105,8,85,0xbbc6c2);
  // Runway approach lights and a distinctive radar array.
  for(let i=1;i<=8;i++)for(let k=-1;k<=1;k++)runwayLights.push({x:-6000+k*12,y:2,z:9550+i*48,w:2,h:2,d:2,color:0xffbe72});
  box(-7450,36,5700,10,72,10,0xa6b4b0);addDetail(new THREE.SphereGeometry(35,12,8,0,TAU,0,Math.PI/2),-7450,79,5700,0xd0d6c9,[1,1,1],[0,0,-.6]);
  // Civilian airport with terminal concourses, jet bridges and two runways.
  runway(-10800,-15100,4500,136,'18');runway(-11900,-15150,3500,110,'18');
  road(-10300,-15100,72,4600,0x626d71,1.1);road(-9750,-15100,980,2470,0x89938b,1.1);
  for(let z=-16900;z<-13000;z+=850)road(-11100,z,1550,72,0x626d71,1.15);
  box(-9150,31,-15100,330,62,1480,0xa2b3b5,0,true);box(-9160,66,-15100,365,8,1510,0xc2c9bf);
  for(let i=0;i<8;i++){const z=-15760+i*190;box(-9460,13,z,325,26,28,0xadc0bf);parkedPlane(-9770,z,2.3,-Math.PI/2);}
  box(-9020,58,-14080,34,116,34,0x839898,0,true);box(-9020,120,-14080,92,23,75,0x405e70);box(-9020,134,-14080,107,7,88,0xc1ccc6);
  road(-8660,-15100,600,1640,0x586368,1.1);for(let z=-15850;z<-14400;z+=70)for(let x=-8880;x<-8460;x+=55)paint(x,z,2,45,0xb6c0b4,1.4);

  // Three channel crossings. Bridge decks are above the water, with collision decks.
  for(const z of [-8000,-1500,3970]) {
    const x=riverX(z);road((7680+14200)/2,z,14200-7680,60,0x505e65,1.2);
    box(x,28,z,1580,11,78,0x7f929a,0,true);road(x,z,1550,65,0x58656a,34);
    for(let k=-2;k<=2;k++)box(x+k*270,5,z,27,47,64,0x9daaa6,0,true);
    for(const side of [-1,1]){
      box(x-365,90,z+side*42,22,180,22,0xa9b6b4,0,true);box(x+365,90,z+side*42,22,180,22,0xa9b6b4,0,true);
      for(let i=-4;i<=4;i++){
        const px=x+i*160,py=68+92*Math.abs(i)/4;
        box(px,py/2+34,z+side*42,3,Math.max(8,py-34),3,0xb1c0ba);
      }
    }
    paint(x,z,1500,2,0xdfcc8c,34.2);
  }

  // Port sits on the eastern shoreline; piers reach beyond the beach into water.
  road(14500,-2200,2350,3450,0x798882,1.1);road(14500,-2200,65,4700,0x485861,1.3);
  const containerColors=[0xa25d4d,0x567a86,0x987e4e,0x66846c,0xb4ac85];
  for(let i=0;i<230;i++) {
    const x=13700+(i%14)*90,z=-3520+Math.floor(i/14)*155;
    const count=1+Math.floor(random()*3);
    box(x,count*9,z,60,count*18,100,containerColors[i%5]);
    if(i%6===0)box(x,52,z,3,9,80,0xa1a89c);
  }
  for(let i=0;i<4;i++) {
    const z=-3550+i*930;box(16600,-1,z,2450,24,230,0x7e8a84,0,true);
    box(15740,14,z+220,840,28,330,0xa8b3a7,0,true);box(15740,31,z+220,860,6,350,0x668187);
    for(let j=0;j<2;j++){
      const x=15670+j*670;
      for(const dz of [-65,65]){box(x-65,85,z+dz,14,170,14,0xba9663);box(x+65,85,z+dz,14,170,14,0xba9663);}
      box(x,176,z,195,16,450,0xcda76d);box(x,155,z+160,8,48,8,0x586665);box(x,132,z+160,50,6,35,0xc5aa76);
    }
    // Moored container ship.
    box(16900,4,z+310,940,45,156,0x2f4652);box(16900,30,z+310,900,12,141,0xa0a58f);
    for(let k=0;k<10;k++)box(16510+k*70,52,z+310,60,38,108,containerColors[k%5]);
    box(17280,60,z+310,105,80,125,0xbfcac4);box(17300,108,z+310,105,22,140,0x557482);
  }

  // Outlying farms and hillside settlements give navigation reference beyond the city.
  for(let i=0;i<60;i++){
    const x=-13400+random()*27000,z=11000+random()*7000;if(terrainHeight(x,z)<-1)continue;
    road(x,z,380+random()*400,420+random()*400,i%2?0x82916a:0x918c65,0.5);
    box(x,9,z,60,18,95,0x999f8a,0,true);box(x,19,z,66,3,101,0x676f6a);
  }

  instances('Infrastructure — hangars, port, bridges and roofs',new THREE.BoxGeometry(1,1,1),new THREE.MeshLambertMaterial(),staticBoxes);
  instances('Tree belts and parkland',new THREE.ConeGeometry(.55,1,5),new THREE.MeshLambertMaterial({flatShading:true}),trees);
  const lightMaterial=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
  instances('Runway edge and approach lights',new THREE.BoxGeometry(1,1,1),lightMaterial,runwayLights);
  const cityLights=[];
  for(let x=cityMinX;x<=cityMaxX;x+=960)for(let z=cityMinZ;z<=cityMaxZ;z+=960)cityLights.push({x:x+28,y:10,z:z+28,w:5,h:2,d:5,color:0xffdc9d});
  const cityLightMaterial=new THREE.MeshBasicMaterial({color:0xffd6a1,toneMapped:false});
  const cityLightMesh=instances('Sodium street lamps',new THREE.BoxGeometry(1,1,1),cityLightMaterial,cityLights);

  function flatMesh(name,vertices,colors) {
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true}));mesh.name=name;mesh.receiveShadow=true;world.add(mesh);
  }
  flatMesh('Roads, airfield surfaces and plazas',roadVertices,roadColors);flatMesh('Road and runway markings',paintVertices,paintColors);
  if(detailGeometries.length){const detail=mergeGeometries(detailGeometries,false);const mesh=new THREE.Mesh(detail,new THREE.MeshLambertMaterial({vertexColors:true}));mesh.name='Landmark details';world.add(mesh);detailGeometries.forEach(g=>g.dispose());}

  const vehicleCount=190,traffic=[];
  const vehicleMaterial=new THREE.MeshLambertMaterial();
  const vehicles=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),vehicleMaterial,vehicleCount);vehicles.name='Moving road traffic';vehicles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);vehicles.frustumCulled=false;
  for(let i=0;i<vehicleCount;i++){
    const horizontal=i%2===0,dir=i%4<2?1:-1;
    traffic.push({horizontal,dir,lane:horizontal?(cityMinZ+Math.floor(random()*31)*block):(cityMinX+Math.floor(random()*39)*block),t:random(),speed:11+random()*17,bus:i%12===0});
    vehicles.setColorAt(i,new THREE.Color().setHSL(random(),.18+random()*.35,.45+random()*.35));
  }
  world.add(vehicles);
  const headlightMaterial=new THREE.MeshBasicMaterial({color:0xffe3aa,toneMapped:false});
  const headlights=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),headlightMaterial,vehicleCount);headlights.name='Traffic headlights';headlights.frustumCulled=false;headlights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);world.add(headlights);
  let previousNight=-1;
  function update(dt,time,playerPosition,nightAmount=0) {
    if(Math.abs(previousNight-nightAmount)>.015){buildingMaterial.emissiveIntensity=nightAmount*1.0;cityLightMaterial.color.setRGB(0.3+nightAmount*.7,.22+nightAmount*.6,.12+nightAmount*.35);cityLightMesh.visible=nightAmount>.15;headlights.visible=nightAmount>.12;previousNight=nightAmount;}
    waterTexture.offset.x=time*.0007;waterTexture.offset.y=time*.0003;
    for(let i=0;i<vehicleCount;i++){
      const v=traffic[i],length=v.horizontal?18720:14880;v.t=(v.t+dt*v.speed/length)%1;
      const travel=(v.dir===1?v.t:1-v.t)*length;
      const x=v.horizontal?cityMinX+travel:v.lane+v.dir*10;
      const z=v.horizontal?v.lane+v.dir*10:cityMinZ+travel;
      matrices.position.set(x,3,z);matrices.rotation.set(0,v.horizontal?Math.PI/2:0,0);matrices.scale.set(v.bus?4:3,3,v.bus?12:6);matrices.updateMatrix();vehicles.setMatrixAt(i,matrices.matrix);
      matrices.position.set(x+(v.horizontal?v.dir*4:0),3,z+(v.horizontal?0:v.dir*4));matrices.scale.set(v.horizontal?.6:2,.6,v.horizontal?2:.6);matrices.rotation.set(0,0,0);matrices.updateMatrix();headlights.setMatrixAt(i,matrices.matrix);
    }
    vehicles.instanceMatrix.needsUpdate=true;headlights.instanceMatrix.needsUpdate=true;
  }
  update(0,0,new THREE.Vector3(),0);
  return {
    update,terrainHeight,isRunway,collides,landmarks,
    stats:{mapSize:MAP_SIZE,buildings:buildingCount,trees:trees.length,traffic:vehicleCount,districts:buildingChunks.size},
    dispose(){world.traverse(object=>{object.geometry?.dispose();const mats=Array.isArray(object.material)?object.material:[object.material];for(const m of mats)if(m)m.dispose();});waterTexture.dispose();buildingMaterial.map.dispose();buildingMaterial.emissiveMap.dispose();scene.remove(world);},
  };
}
