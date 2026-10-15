// Render-only assembly. Positions and exterior dimensions come from the sim spec.
import * as THREE from 'three/webgpu';
import { carSpec, type Build } from '../sim/build.ts';
import { part, type ChassisPart, type StayPart } from '../sim/parts.ts';
import { MM } from '../sim/units.ts';
import { bodyObject, type UploadLookup } from './body.ts';
import { partModel, disposeObject } from './models/parts.ts';
import { currentQuality, type Quality } from './quality.ts';

export class CarModel {
  readonly root = new THREE.Group();
  private wheels: THREE.Object3D[] = [];
  private radius = 1;
  private spin = 0;
  private build: Build;
  private uploads?: UploadLookup;
  private quality: Quality;
  bodyCanvas!: HTMLCanvasElement;
  constructor(build: Build, uploads?: UploadLookup) {
    this.build=build; this.uploads=uploads; this.quality=currentQuality(); this.assemble();
  }
  private assemble() {
    const b=this.build,s=carSpec(b),ch=part<ChassisPart>(b.chassis);
    this.radius=s.wheelRadius;
    const add=(id:string,x=0,y=0,z=0)=>{
      const model=partModel(part(id),this.quality);model.position.set(x,y,z);this.root.add(model);return model;
    };
    add(b.chassis);
    add(b.motor,ch.motorX*MM,12*MM,0);
    add(b.gear,ch.motorX*.5*MM,9*MM,18*MM);
    for(const w of s.wheels) {
      const model=add(b.tires,w.x,w.y,w.z); this.wheels.push(model);
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
    const body=bodyObject(b.body,this.uploads);this.bodyCanvas=body.canvas;this.root.add(body.object);
  }
  setQuality(q:Quality) {
    if(q===this.quality)return;
    disposeObject(this.root);this.root.clear();this.wheels=[];this.quality=q;this.assemble();
  }
  roll(speed:number,dt:number) {this.spin-=(speed/this.radius)*dt;for(const wheel of this.wheels)wheel.rotation.z=this.spin;}
  setPose(x:number,y:number,z:number,qx:number,qy:number,qz:number,qw:number) {this.root.position.set(x,y,z);this.root.quaternion.set(qx,qy,qz,qw);}
  dispose(){disposeObject(this.root);}
}
