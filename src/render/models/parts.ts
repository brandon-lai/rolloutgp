/** Original render-only component tooling. Inputs are catalog millimetres.
 * Axles point along Z; rollers turn around Y. Nothing here enters physics.
 */
import * as T from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Part, ChassisPart, TirePart, RollerPart, StayPart } from '../../sim/parts.ts';
import { MM } from '../../sim/units.ts';
import { QUALITY, currentQuality, type Quality } from '../quality.ts';

export function bevelBox(x: number, y: number, z: number, radius = Math.min(x,y,z)*.18) {
  return new RoundedBoxGeometry(x,y,z,1,radius);
}
export function disposeObject(root: T.Object3D) {
  const owned = new Set<{dispose():void}>();
  root.traverse(o => {
    const mesh = o as T.Mesh;
    if (mesh.geometry) owned.add(mesh.geometry);
    for (const mat of mesh.material ? Array.isArray(mesh.material) ? mesh.material : [mesh.material] : []) {
      owned.add(mat);
      for (const value of Object.values(mat)) if (value instanceof T.Texture) owned.add(value);
    }
  });
  owned.forEach(o => o.dispose());
}
/** Static details are merged by material, retaining only a handful of draw calls. */
export function batch(root: T.Group): T.Group {
  root.updateMatrixWorld(true);
  const groups = new Map<T.Material,T.BufferGeometry[]>();
  root.traverse(o => {
    if (!(o instanceof T.Mesh) || Array.isArray(o.material)) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    // Consistent attributes allow primitive and custom geometry to merge.
    if (!g.getAttribute('uv')) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
    const list = groups.get(o.material) ?? []; list.push(g); groups.set(o.material,list);
  });
  const out = new T.Group();
  for (const [material, geos] of groups) {
    const geometry = mergeGeometries(geos);
    geos.forEach(g=>g.dispose());
    if (!geometry) throw new Error('Part mesh could not be merged');
    const mesh = new T.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; out.add(mesh);
  }
  root.traverse(o=> { if (o instanceof T.Mesh) o.geometry.dispose(); });
  return out;
}
function lathe(profile: [number,number][], segments: number) {
  return new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r*MM,y*MM)),segments);
}
export function partModel(p: Part, quality: Quality = currentQuality()): T.Group {
  const config=QUALITY[quality], n=config.segments;
  const group=new T.Group();
  const plastic=new T.MeshPhysicalMaterial({color:0x25282b,roughness:.43,clearcoat:.25});
  const metal=new T.MeshStandardMaterial({color:0xbfc4ca,metalness:.95,roughness:.25});
  const rubber=new T.MeshStandardMaterial({color:0x252423,roughness:.88});
  const brass=new T.MeshStandardMaterial({color:0xb69a50,metalness:.88,roughness:.3});
  const accent=new T.MeshPhysicalMaterial({color:0xb52520,roughness:.3,metalness:.45,clearcoat:.6});
  const add=(geo:T.BufferGeometry, mat:T.Material, x=0,y=0,z=0) => { const m=new T.Mesh(geo,mat);m.position.set(x*MM,y*MM,z*MM);group.add(m);return m; };
  const box=(x:number,y:number,z:number,mat:T.Material,px=0,py=0,pz=0)=>add(bevelBox(x*MM,y*MM,z*MM),mat,px,py,pz);
  const cylinder=(r:number,h:number,mat:T.Material,x=0,y=0,z=0)=>add(lathe([[0,-h/2],[r*.92,-h/2],[r,-h/2+Math.min(.3,h*.25)],[r,h/2-Math.min(.3,h*.25)],[r*.92,h/2],[0,h/2]],n),mat,x,y,z);
  const screw=(x:number,y:number,z:number)=>{
    cylinder(1.4,1,metal,x,y,z);
    if(config.details) box(1.7,.15,.35,plastic,x,y+.53,z);
  };
  if(p.slot==='tires') {
    const tire=p as TirePart,r=tire.diameter/2,h=tire.width;
    const round=tire.profile==='arched'?1.8:.55;
    const wheel=add(lathe([[r*.58,-h/2],[r-round,-h/2],[r,-h/2+round],[r,h/2-round],[r-round,h/2],[r*.58,h/2],[r*.58,-h/2]],n),rubber);
    wheel.rotation.x=Math.PI/2;
    for(const side of [-1,1]) {
      const rim=add(new T.TorusGeometry(r*.56*MM,.45*MM,6,n),metal,0,0,side*(h/2-.5));
      void rim;
      const hub=cylinder(2.3,h-.2,metal);hub.rotation.x=Math.PI/2;
      for(let i=0;i<6;i++) {
        const a=i*Math.PI/3;
        const spoke=box(r*.5,1.05,1,accent,Math.cos(a)*r*.3,Math.sin(a)*r*.3,side*(h/2-.7));spoke.rotation.z=a;
      }
      if(config.details) {
        add(new T.TorusGeometry((r-.9)*MM,.15*MM,4,n),rubber,0,0,side*(h/2-.16));
        for(let i=0;i<20;i++) {
          const a=i*Math.PI/10;
          const dash=box(.5,.16,.1,metal,Math.cos(a)*r*.79,Math.sin(a)*r*.79,side*(h/2-.06));dash.rotation.z=a;
        }
      }
    }
  } else if(p.slot==='rollers' && (p as RollerPart).kind==='roller') {
    const roller=p as RollerPart,r=roller.diameter/2;
    add(lathe([[1.4,-3],[r-.4,-3],[r,-2.6],[r,2.6],[r-.4,3],[1.4,3],[1.4,-3]],n),roller.type==='bearing'?metal:plastic);
    add(lathe([[r-.35,-.7],[r,-.7],[r,.7],[r-.35,.7]],n),accent);
    add(lathe([[1.2,2.6],[2.6,2.6],[2.6,3],[1.2,3]],n),brass);
    screw(0,2.38,0);
    if(config.details && r>6) for(let i=0;i<6;i++) {
      const a=i*Math.PI/3; cylinder(.65,.12,plastic,Math.cos(a)*r*.62,2.92,Math.sin(a)*r*.62);
    }
  } else if(p.slot==='rollers') {
    const stay=p as StayPart;
    box(11,1.6,stay.span*2+5,plastic);
    for(const z of [-stay.span,stay.span,-18,18]) screw(0,.8,z);
  } else if(p.slot==='chassis') {
    const c=p as ChassisPart,w=c.tread-14;
    box(c.length-8,2,w*.8,plastic,0,1,0);
    for(const side of [-1,1]) {
      box(c.length-12,10,2,plastic,0,6,side*(w/2-1));
      box(8,7,c.tread-10,plastic,side*(c.length/2-6),7,0);
      // Two AA cells in their bay; positions use catalog battery height.
      const cell=cylinder(7,49,brass,-2,c.batteryY,side*8);cell.rotation.z=Math.PI/2;
      for(const end of [-1,1]) { const cap=cylinder(6.8,1,metal,-2+end*24,c.batteryY,side*8);cap.rotation.z=Math.PI/2; }
      for(const x of [-c.wheelbase/2,c.wheelbase/2]) { box(6,12,w,plastic,x,6,0);screw(x,12,side*(w/2-5)); }
    }
    if(config.details) for(let x=-50;x<=50;x+=10) box(1.3,4,w-4,plastic,x,4,0);
  } else if(p.slot==='motor') {
    const can=cylinder(10,25,metal);can.rotation.x=Math.PI/2;
    const label=cylinder(10.04,13,accent);label.rotation.x=Math.PI/2;
    for(const side of [-1,1]) {
      const cap=cylinder(8.8,2,plastic,0,0,side*12.1);cap.rotation.x=Math.PI/2;
      if(side===1 || p.shaft==='double') { const shaft=cylinder(1,7,metal,0,0,side*15);shaft.rotation.x=Math.PI/2; }
      box(2,1,2,brass,6,6,side*12.8);
    }
  } else if(p.slot==='gear') {
    const teeth=Math.round(p.ratio*6), r=7;
    const core=cylinder(r-1,2,accent);core.rotation.x=Math.PI/2;
    for(let i=0;i<teeth;i++){const a=i/teeth*Math.PI*2;const tooth=box(1.6,.9,2,accent,Math.cos(a)*r,Math.sin(a)*r);tooth.rotation.z=a;}
    const hub=cylinder(2.2,4,brass);hub.rotation.x=Math.PI/2;
  } else if(p.slot==='dampers') {
    const r=2.5+p.each*.4;
    cylinder(r,6,brass); cylinder(1,10,metal); screw(0,5,0);
  } else if(p.slot==='brakes') {
    rubber.color.set(p.id==='br-medium'?0x9f2731:p.id==='br-light'?0x94918b:0x242424);
    box(6,3,40,rubber);
  } else {
    add(lathe([[1,-1.5],[3,-1.5],[3,1.5],[1,1.5],[1,-1.5]],n),p.id==='be-plastic'?plastic:p.id==='be-brass'?brass:metal);
    if(config.details && p.id.includes('ball')) for(let i=0;i<8;i++) {const a=i*Math.PI/4;add(new T.SphereGeometry(.4*MM,6,4),brass,Math.cos(a)*2,1.5,Math.sin(a)*2);}
  }
  const used=new Set<T.Material>();group.traverse(o=>{if(o instanceof T.Mesh)used.add(o.material as T.Material);});
  [plastic,metal,rubber,brass,accent].forEach(m=>{if(!used.has(m))m.dispose();});
  return batch(group);
}
