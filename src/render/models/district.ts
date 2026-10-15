import * as T from 'three/webgpu';
import type { Box } from '../../city/layout.ts';
import { bevelBox, batch } from './parts.ts';
/** Facade dressings are attached to existing buildings; no new walkable space. */
export function districtDetails(boxes:Box[]) {
  const root=new T.Group();
  const stone=new T.MeshStandardMaterial({color:0xadafa9,roughness:.78});
  const metal=new T.MeshStandardMaterial({color:0x444d50,metalness:.6,roughness:.38});
  const glass=new T.MeshPhysicalMaterial({color:0x405057,metalness:.3,roughness:.19,clearcoat:.5});
  for(const b of boxes.filter(b=>b.kind==='building')) {
    const detail=new T.Group();
    const box=(x:number,y:number,z:number,px:number,py:number,pz:number,m:T.Material)=>{const mesh=new T.Mesh(bevelBox(x,y,z),m);mesh.position.set(px,py,pz);detail.add(mesh);};
    const top=b.y+b.hy;
    box(b.hx*2,.18,.16,0,top-.1,b.hz-.04,stone);
    box(b.hx*2,.18,.16,0,top-.1,-b.hz+.04,stone);
    for(const side of [-1,1]) {
      const z=side*(b.hz+.015);
      // Storefront mullions and sills, with shallow depth so the blockout stays legible.
      box(Math.min(b.hx*1.6,10),2.2,.025,0,1.25,z,glass);
      for(let x=-b.hx*.8;x<=b.hx*.8;x+=2)box(.05,2.3,.045,x,1.25,z+side*.02,metal);
      box(b.hx*1.7,.14,.08,0,2.45,z,metal);
      box(b.hx*1.7,.12,.12,0,.15,z,stone);
      for(let y=3.2;y<top-.4;y+=3.2)box(b.hx*2,.06,.08,0,y,z,stone);
    }
    const lod=new T.LOD();lod.position.set(b.x,0,b.z);lod.addLevel(batch(detail),0);lod.addLevel(new T.Group(),65);root.add(lod);
  }
  return root;
}
