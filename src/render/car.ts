// Render-only assembly. Positions and exterior dimensions come from the sim spec.
import * as THREE from 'three/webgpu';
import { carSpec, type Build } from '../sim/build.ts';
import { part, type ChassisPart, type StayPart } from '../sim/parts.ts';
import { MM } from '../sim/units.ts';
import { bodyObject, type UploadLookup } from './body.ts';
import { partModel, disposeObject, batch } from './models/parts.ts';
import { currentQuality, type Quality } from './quality.ts';

export class CarModel {
  readonly root = new THREE.Group();
  private wheels: THREE.Object3D[] = [];
  private radius = 1;
  private spin = 0;
  private build: Build;
  private uploads?: UploadLookup;
  private quality: Quality;
  private ghost = false;
  bodyCanvas!: HTMLCanvasElement;
  constructor(build: Build, uploads?: UploadLookup) {
    this.build=build; this.uploads=uploads; this.quality=currentQuality(); this.assemble();
  }
  private assemble() {
    const assembly=carParts(this.build,this.quality);
    this.radius=assembly.radius;this.wheels=assembly.wheels;
    this.root.add(...assembly.root.children.slice());
    const body=bodyObject(this.build.body,this.uploads);this.bodyCanvas=body.canvas;this.root.add(body.object);
    if(this.ghost)this.setGhost();
  }
  setGhost() {
    this.ghost=true;
    this.root.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      const material=o.material as THREE.MeshPhysicalMaterial;
      material.transparent=true;material.opacity=.35;material.depthWrite=false;
      if(material.isMeshPhysicalMaterial)material.transmission=0;
      material.needsUpdate=true;o.castShadow=false;
    });
  }
  setQuality(q:Quality) {
    if(q===this.quality)return;
    disposeObject(this.root);this.root.clear();this.wheels=[];this.quality=q;this.assemble();
  }
  roll(speed:number,dt:number) {this.spin-=(speed/this.radius)*dt;for(const wheel of this.wheels)wheel.rotation.z=this.spin;}
  setPose(x:number,y:number,z:number,qx:number,qy:number,qz:number,qw:number) {this.root.position.set(x,y,z);this.root.quaternion.set(qx,qy,qz,qw);}
  dispose(){disposeObject(this.root);}
}

/** Catalog assembly without paint/DOM, also used by the budget audit. */
export function carParts(b:Build,quality:Quality) {
    const s=carSpec(b),ch=part<ChassisPart>(b.chassis);
    const root=new THREE.Group(),wheels:THREE.Object3D[]=[];
    const add=(id:string,x=0,y=0,z=0)=>{
      const model=partModel(part(id),quality);model.position.set(x,y,z);root.add(model);return model;
    };
    add(b.chassis);
    add(b.motor,ch.motorX*MM,12*MM,0);
    add(b.gear,ch.motorX*.5*MM,9*MM,18*MM);
    for(const w of s.wheels) {
      const model=add(b.tires,w.x,w.y,w.z); wheels.push(model);
      const bearing=add(b.bearings,w.x,w.y,w.z*.8);bearing.rotation.x=Math.PI/2;
    }
    for(const id of [b.rollers.front,b.rollers.rear,b.rollers.side]) {
      if(!id)continue;
      const stay=part<StayPart>(id);
      for(const tier of stay.tiers) {
        add(id,stay.x*MM,(tier-4)*MM,0);
        for(const side of [-1,1])add(b.rollers.roller,stay.x*MM,tier*MM,side*stay.span*MM);
      }
    }
    for(const d of s.dampers)if(b.dampers.part)add(b.dampers.part,d.x,d.y,d.z);
    for(const brake of s.brakes)if(b.brakes.part)add(b.brakes.part,brake.x,-(s.wheelRadius-s.axleY)+brake.gap+1.5*MM,brake.z);
    // Only tires rotate. Merge the stationary assembly across parts and reuse
    // identical finishes instead of submitting one draw for every small fitting.
    const stationary=new THREE.Group();
    for(const child of [...root.children])if(!wheels.includes(child))stationary.add(child);
    const finishes=new Map<string,THREE.Material>();
    stationary.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      const m=o.material as THREE.MeshPhysicalMaterial;
      const key=[m.type,m.color.getHexString(),m.roughness,m.metalness,m.clearcoat,m.clearcoatRoughness].join(':');
      const existing=finishes.get(key);
      if(existing&&existing!==m){m.dispose();o.material=existing;}else finishes.set(key,m);
    });
    root.add(batch(stationary));
    return {root,wheels,radius:s.wheelRadius};
}
