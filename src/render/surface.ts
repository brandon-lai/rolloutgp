import * as T from 'three/webgpu';
/** Small repeatable roughness/normal maps. Values are material variation, not painted dirt. */
export function microSurface(size = 128, seed = 17): { roughness: T.DataTexture; normal: T.DataTexture } {
  const rough = new Uint8Array(size*size*4), normal = new Uint8Array(size*size*4);
  let state=seed;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    const n=(state>>>24)/255;
    const grain=Math.sin(x*.7+y*.13)*.5;
    const i=(y*size+x)*4;
    rough[i]=rough[i+1]=rough[i+2]=Math.round(205+n*40+grain*7);rough[i+3]=255;
    normal[i]=Math.round(128+grain*3);normal[i+1]=Math.round(128+(n-.5)*5);normal[i+2]=255;normal[i+3]=255;
  }
  const make=(data:Uint8Array)=>{const t=new T.DataTexture(data,size,size);t.wrapS=t.wrapT=T.RepeatWrapping;t.needsUpdate=true;return t;};
  return {roughness:make(rough),normal:make(normal)};
}
