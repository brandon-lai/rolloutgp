import * as T from 'three/webgpu';
import { partModel, disposeObject } from './models/parts.ts';
import type { Part } from '../sim/parts.ts';
import type { Viewport } from './viewport.ts';
const caches=new WeakMap<Viewport,Map<string,Promise<string>>>();
let queue:Promise<unknown>=Promise.resolve();
/** Use the existing renderer, one request at a time. Cache finished images by part. */
export function partThumbnail(vp:Viewport,p:Part):Promise<string> {
  let cache=caches.get(vp);if(!cache){cache=new Map();caches.set(vp,cache);}
  const cached=cache.get(p.id);if(cached)return cached;
  const task=queue.then(async()=>{
    const scene=new T.Scene();scene.background=new T.Color(0x202428);
    scene.environment=vp.current?.scene.environment??null;
    const model=partModel(p,'medium');scene.add(model);
    const bounds=new T.Box3().setFromObject(model),center=bounds.getCenter(new T.Vector3());
    model.position.sub(center);
    const radius=Math.max(.06,bounds.getSize(new T.Vector3()).length()/2);
    const camera=new T.PerspectiveCamera(32,1.5,.001,20);
    camera.position.set(1,.85,1.3).normalize().multiplyScalar(radius*3.5);camera.lookAt(0,0,0);
    scene.add(new T.HemisphereLight(0xffffff,0x404040,2));
    const key=new T.DirectionalLight(0xffffff,3);key.position.set(2,3,4);scene.add(key);
    const target=new T.RenderTarget(192,128,{type:T.UnsignedByteType,depthBuffer:true});
    target.texture.colorSpace=T.SRGBColorSpace;
    const renderer=vp.renderer,previous=renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.setRenderTarget(previous);
      const data=await renderer.readRenderTargetPixelsAsync(target,0,0,192,128);
      const canvas=document.createElement('canvas');canvas.width=192;canvas.height=128;
      const ctx=canvas.getContext('2d')!,im=ctx.createImageData(192,128);
      // WebGL readback starts at the bottom; WebGPU texture copies start at the top.
      for(let y=0;y<128;y++)im.data.set(new Uint8Array(data.buffer,data.byteOffset+(vp.backend === 'webgl2' ? 127-y : y)*192*4,192*4),y*192*4);
      ctx.putImageData(im,0,0);return canvas.toDataURL('image/webp',.85);
    } finally {renderer.setRenderTarget(previous);target.dispose();disposeObject(model);}
  });
  queue=task.catch(()=>{});cache.set(p.id,task);task.catch(()=>cache!.delete(p.id));return task;
}
