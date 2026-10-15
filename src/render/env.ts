// Event hall in sim units. All dressing is render-only, outside the course bounds.
import * as THREE from 'three/webgpu';
import { TRACK_STAND } from '../sim/track/geometry.ts';
import { bevelBox, batch, disposeObject } from './models/parts.ts';
import { microSurface } from './surface.ts';
export function hallEnvironment(scene: THREE.Scene, bounds: {minX:number;maxX:number;minZ:number;maxZ:number}):()=>void {
  const cx=(bounds.minX+bounds.maxX)/2,cz=(bounds.minZ+bounds.maxZ)/2;
  const span=Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ),extent=Math.max(30,span*.7);
  scene.background=new THREE.Color(0x535758);scene.fog=new THREE.Fog(0x535758,100,340);
  const ambient=new THREE.HemisphereLight(0xeaf0f4,0x544d42,.6);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xfff6e9,2.8);sun.position.set(cx+span*.35,55,cz+span*.25);sun.target.position.set(cx,0,cz);
  sun.castShadow=true;Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,near:.5,far:180});
  sun.shadow.bias=-.0001;sun.shadow.normalBias=.012;scene.add(sun,sun.target);
  const group=new THREE.Group();
  const texture=floorTexture();texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(40,40);
  const grain=microSurface(128,31);grain.normal.repeat.set(180,180);grain.roughness.repeat.set(180,180);
  const floorMaterial=new THREE.MeshStandardMaterial({map:texture,color:0xb8b5aa,roughness:.68,roughnessMap:grain.roughness,normalMap:grain.normal,normalScale:new THREE.Vector2(.18,.18)});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(800,800),floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.set(cx,-TRACK_STAND,cz);group.add(floor);
  const metal=new THREE.MeshStandardMaterial({color:0x44494b,metalness:.7,roughness:.4});
  const wall=new THREE.MeshStandardMaterial({color:0x999b96,roughness:.85});
  const light=new THREE.MeshStandardMaterial({color:0xfff4d9,emissive:0xfff4d9,emissiveIntensity:3,roughness:.5});
  const box=(x:number,y:number,z:number,px:number,py:number,pz:number,m:THREE.Material)=>{const mesh=new THREE.Mesh(bevelBox(x,y,z),m);mesh.position.set(px,py,pz);group.add(mesh);};
  // Perimeter walls and structural roof beams establish a real room at TV height.
  for(const side of [-1,1])box(extent*3,55,.6,cx,26,cz+side*extent*1.5,wall);
  for(let i=-2;i<=2;i++) {
    box(extent*3,.8,.6,cx,46,cz+i*extent*.6,metal);
    for(const side of [-1,1]) {
      box(18,.12,3,cx+side*extent*.6,45,cz+i*extent*.6,light);
      box(.6,47,.6,cx+side*extent*1.45,22.5,cz+i*extent*.6,metal);
    }
  }
  // Low crowd rails and original event graphics, well clear of all lanes.
  const banner=new THREE.CanvasTexture(bannerCanvas());banner.colorSpace=THREE.SRGBColorSpace;
  const fabric=new THREE.MeshStandardMaterial({map:banner,roughness:.9});
  for(const side of [-1,1])for(let i=-2;i<=2;i++) {
    const x=cx+i*extent*.48,z=cz+side*extent;
    box(extent*.46,.12,.12,x,3.5,z,metal);box(extent*.46,.12,.12,x,1,z,metal);
    for(const dx of [-.22,.22])box(.16,4.5,.16,x+dx*extent,1.25,z,metal);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(extent*.42,2),fabric);sign.position.set(x,2.3,z-side*.12);if(side>0)sign.rotation.y=Math.PI;group.add(sign);
  }
  const merged=batch(group);scene.add(merged);
  return()=>{disposeObject(merged);sun.shadow.dispose();};
}
function floorTexture() {
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;
  ctx.fillStyle='#c4c2b9';ctx.fillRect(0,0,128,128);ctx.strokeStyle='#a3a39e';ctx.lineWidth=.7;ctx.strokeRect(0,0,128,128);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function bannerCanvas() {
  const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d')!;
  ctx.fillStyle='#22272a';ctx.fillRect(0,0,1024,128);ctx.fillStyle='#bc302a';ctx.fillRect(0,0,12,128);
  ctx.fillStyle='#f3f0e8';ctx.font='700 48px sans-serif';ctx.fillText('ROLLOUT GP',45,66);
  ctx.fillStyle='#dfba55';ctx.font='20px sans-serif';ctx.fillText('BUILD  /  RELEASE  /  REPEAT',45,103);return c;
}
