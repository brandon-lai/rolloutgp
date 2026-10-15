// Geometry estimates without a renderer. GPU passes/draws must be measured in browser.
import * as T from 'three/webgpu';
import { disposeObject } from '../../src/render/models/parts.ts';
import { runnerModel } from '../../src/render/models/runner.ts';
import { shellGeometry, addonMeshes } from '../../src/render/body.ts';
import { STARTER_BUILD, type Build } from '../../src/sim/build.ts';
import { carParts } from '../../src/render/car.ts';
import { QUALITY, type Quality } from '../../src/render/quality.ts';
const count=(root:T.Object3D)=>{let triangles=0,meshes=0;root.traverse(o=>{const m=o as T.Mesh;if(m.geometry){triangles+=(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3;meshes++;}});return {triangles,meshes};};
function budget(b:Build,q:Quality) {
 const {root}=carParts(b,q);
 const material=new T.MeshStandardMaterial();root.add(new T.Mesh(shellGeometry(b.body),material));root.add(...addonMeshes(b.body,material,material));
 const result=count(root);disposeObject(root);return result;
}
for(const q of Object.keys(QUALITY) as Quality[]) console.log(q,budget(STARTER_BUILD,q));
const runner=runnerModel();console.log('runner',count(runner));disposeObject(runner);
const detailed:Build={...STARTER_BUILD,rollers:{front:'st-f-double',rear:'st-r-double',side:'st-side',roller:'ro-19b'},bearings:'be-ball',dampers:{part:'da-heavy',mount:'side'},brakes:{part:'br-strong',position:'both',gap:1},body:{...STARTER_BUILD.body,holes:12}};
for(const q of Object.keys(QUALITY) as Quality[])console.log(q,'fully equipped',budget(detailed,q));
