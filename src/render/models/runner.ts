/** Original articulated runner. Metres, unlike the car generators. No collider use. */
import * as T from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export function runnerModel(segments=12) {
  const root=new T.Group(),bones:T.Bone[]=[],geometries:T.BufferGeometry[]=[];
  const mats=[new T.MeshStandardMaterial({color:0x333b3c,roughness:.93}),new T.MeshStandardMaterial({color:0xa66c49,roughness:.64}),new T.MeshStandardMaterial({color:0x202226,roughness:.9}),new T.MeshStandardMaterial({color:0x9f3028,roughness:.75})];
  function bone(name:string,parent:T.Bone|null,x:number,y:number,z=0) {
    const b=new T.Bone();b.name=name;b.position.set(x,y,z);if(parent)parent.add(b);bones.push(b);return b;
  }
  const hips=bone('hips',null,0,.89),spine=bone('spine',hips,0,.25),head=bone('head',spine,0,.38);
  const limbs:T.Bone[]=[];
  for(const side of [-1,1]) {
    const label=side<0?'left':'right';
    const thigh=bone(label+'Thigh',hips,side*.105,-.025),shin=bone(label+'Shin',thigh,0,-.42);
    const arm=bone(label+'Arm',spine,side*.24,.22),forearm=bone(label+'Forearm',arm,0,-.3);
    limbs.push(thigh,shin,arm,forearm);
  }
  hips.updateMatrixWorld(true);
  function piece(b:T.Bone,geo:T.BufferGeometry,mat:number,x=0,y=0,z=0,sx=1,sy=1,sz=1) {
    geo.scale(sx,sy,sz);geo.translate(x,y,z);geo.applyMatrix4(b.matrixWorld);
    const g=geo.index?geo.toNonIndexed():geo; if(g!==geo)geo.dispose();
    const n=g.getAttribute('position').count,indices=new Uint16Array(n*4),weights=new Float32Array(n*4),index=bones.indexOf(b);
    for(let i=0;i<n;i++){indices[i*4]=index;weights[i*4]=1;}
    g.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
    g.userData.material=mat;geometries.push(g);
  }
  const capsule=(r:number,length:number)=>new T.CapsuleGeometry(r,length,3,segments);
  piece(hips,capsule(.15,.07),2,0,.015,0,1.3,1,.75);
  piece(spine,capsule(.19,.22),0,0,.08,0,1.1,1,.65);
  piece(head,capsule(.125,.09),1,0,.03,.015,1,1,.91);
  piece(head,new T.SphereGeometry(.14,segments,8,0,Math.PI*2,0,Math.PI/2),3,0,.08,0,1,1,1);
  piece(head,new T.SphereGeometry(.11,segments,6),3,0,.09,.1,1,.09,1);
  for(let i=0;i<limbs.length;i+=4) {
    const [thigh,shin,arm,forearm]=limbs.slice(i,i+4);
    piece(thigh,capsule(.095,.24),2,0,-.16);
    piece(shin,capsule(.065,.25),1,0,-.16);
    piece(shin,capsule(.075,.12),2,0,-.36,.07,1,.6,1.45);
    piece(arm,capsule(.078,.17),0,0,-.12);
    piece(forearm,capsule(.055,.19),1,0,-.13);
    piece(forearm,capsule(.055,.045),1,0,-.29,.02,1,1,.7);
  }
  const geometry=mergeGeometries(geometries,true)!;
  geometry.groups.forEach((g,i)=>g.materialIndex=geometries[i].userData.material);
  geometries.forEach(g=>g.dispose());
  const mesh=new T.SkinnedMesh(geometry,mats);mesh.name='runner';mesh.add(hips);mesh.bind(new T.Skeleton(bones));mesh.castShadow=true;mesh.frustumCulled=false;root.add(mesh);
  return root;
}
export function animateRunner(root:T.Object3D,stride:number,speed:number) {
  const amount=Math.min(1,speed/6),phase=stride*2.4;
  for(const [i,label] of ['left','right'].entries()) {
    const swing=Math.sin(phase+i*Math.PI)*amount;
    const pose=(name:string,x:number)=>{const b=root.getObjectByName(label+name);if(b)b.rotation.x=x;};
    pose('Thigh',swing*.7);pose('Shin',Math.max(0,-swing)*1.1);pose('Arm',-swing*.65);pose('Forearm',-.7-Math.max(0,swing)*.35);
  }
}
export function firstPersonArms() {
  const group=new T.Group();
  const skin=new T.MeshStandardMaterial({color:0xa66c49,roughness:.68});
  const cloth=new T.MeshStandardMaterial({color:0x333b3c,roughness:.9});
  for(const side of [-1,1]) {
    const arm=new T.Group();arm.position.set(side*.28,-.3,-.4);arm.rotation.x=-.7;arm.rotation.z=side*.2;
    const sleeve=new T.Mesh(new T.CapsuleGeometry(.065,.18,3,10),cloth);sleeve.position.y=-.12;
    const hand=new T.Mesh(new T.CapsuleGeometry(.045,.07,3,10),skin);hand.position.y=.07;
    arm.add(sleeve,hand);group.add(arm);
  }return group;
}
