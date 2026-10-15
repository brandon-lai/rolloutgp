/** Original workshop props, in sim units (100 mm). Baked by tools/models/bake.ts. */
import * as T from 'three/webgpu';
import { bevelBox, batch } from './parts.ts';
export function workshopModel() {
  const g = new T.Group();
  const dark = new T.MeshStandardMaterial({ color: 0x242829, roughness: .6 });
  const steel = new T.MeshStandardMaterial({ color: 0xa9b0b5, metalness: .9, roughness: .3 });
  const red = new T.MeshPhysicalMaterial({ color: 0x962721, roughness: .36, clearcoat: .4 });
  const mat = new T.MeshStandardMaterial({ color: 0x354843, roughness: .86 });
  const grid = new T.MeshStandardMaterial({ color: 0x788b7c, roughness: .85 });
  const box = (x:number,y:number,z:number,px:number,py:number,pz:number,m:T.Material) => {
    const mesh = new T.Mesh(Math.min(x,y,z)<.01 ? new T.BoxGeometry(x,y,z) : bevelBox(x,y,z),m); mesh.position.set(px,py,pz);g.add(mesh);return mesh;
  };
  box(12,.24,8,0,-.37,0,dark);
  box(8,.025,5,0,-.237,0,mat);
  for(let i=-15;i<=15;i++) box(.008,.002,5,i*.25,-.222,0,grid);
  for(let i=-9;i<=9;i++) box(8,.002,.008,0,-.222,i*.25,grid);
  // Divided magnetic tray, behind the hero turntable.
  box(2,.035,1.2,2.7,-.2,-1.8,steel);
  for(const x of [1.7,2.7,3.7]) box(.04,.18,1.2,x,-.12,-1.8,steel);
  for(const z of [-2.4,-1.2]) box(2,.18,.04,2.7,-.12,z,steel);
  for(let i=0;i<8;i++) {
    const pin=new T.Mesh(new T.CylinderGeometry(.016,.016,.18,8),steel);
    pin.rotation.z=Math.PI/2;pin.rotation.y=i*.7;pin.position.set(2.1+(i%2)*.9,-.16,-1.6-Math.floor(i/2)*.14);g.add(pin);
    const head=new T.Mesh(new T.TorusGeometry(.065,.018,6,12),steel);
    head.rotation.x=Math.PI/2;head.position.set(3.1,-.15,-1.8);g.add(head);
  }
  // Fluted driver handle and shaft, original generic tools.
  const driver=new T.Mesh(new T.CylinderGeometry(.11,.085,.75,12),red);
  driver.rotation.z=Math.PI/2;driver.position.set(-2.5,-.11,-1.75);g.add(driver);
  box(.8,.035,.035,-1.75,-.11,-1.75,steel);
  for(let i=0;i<5;i++)box(.45,.016,.016,-2.5,-.02,-1.79+i*.02,dark);
  // Vernier calliper, with two fixed and sliding jaws.
  box(1.8,.04,.12,-2.8,-.18,.7,steel);
  for(const x of [-3.6,-2.8])box(.08,.04,.6,x,-.16,.85,steel);
  box(.45,.06,.25,-2.8,-.14,.7,dark);
  for(let i=0;i<30;i++)box(.008,.003,.055,-3.5+i*.05,-.157,.69,dark);
  return batch(g);
}
