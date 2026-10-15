// npx tsx tools/models/bake.ts — no network, DOM or renderer required.
import { writeFile, mkdir } from 'node:fs/promises';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { workshopModel } from '../../src/render/models/workshop.ts';
import { disposeObject } from '../../src/render/models/parts.ts';
import { compressGLB } from './compress.ts';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// GLTFExporter only needs this subset when exporting geometry without images.
class BlobReader {
  result: ArrayBuffer | null = null;
  onloadend: (()=>void) | null = null;
  readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then(b=>{this.result=b;this.onloadend?.();}); }
}
Object.assign(globalThis,{FileReader:BlobReader});
const root=workshopModel();root.name='Rollout workshop';
root.traverse(o=>{const m=o as import('three').Mesh;if(m.geometry){const old=m.geometry;m.geometry=mergeVertices(old,1e-6);old.dispose();}});
const glb=await new GLTFExporter().parseAsync(root,{binary:true}) as ArrayBuffer;
await mkdir('public/models',{recursive:true});
const compressed=await compressGLB(glb);
await writeFile('public/models/workshop.glb',compressed);
let triangles=0;root.traverse(o=>{const m=o as import('three').Mesh;if(m.geometry)triangles+=(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3;});
console.log(JSON.stringify({file:'workshop.glb',bytes:compressed.byteLength,sourceBytes:glb.byteLength,triangles}));
disposeObject(root);
