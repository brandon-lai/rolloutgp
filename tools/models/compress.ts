/** Geometry-only GLB lossless EXT_meshopt compression. Reject unfamiliar layouts.
 * Follows Khronos EXT_meshopt_compression bufferView/fallback-buffer specification.
 * Used because the gltf-transform CLI cannot be installed in the build sandbox.
 */
import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { MeshoptDecoder } from 'meshoptimizer/decoder';
export async function compressGLB(input:ArrayBuffer):Promise<Uint8Array> {
  await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
  const bytes=new Uint8Array(input), view=new DataView(input);
  const jsonLength=view.getUint32(12,true);
  const doc=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonLength)));
  if(doc.buffers.length!==1 || doc.images?.length)throw new Error('Only a geometry-only single-buffer GLB is supported');
  const bin=bytes.subarray(28+jsonLength);
  const chunks:Uint8Array[]=[];let offset=0;
  for(let i=0;i<doc.bufferViews.length;i++) {
    const v=doc.bufferViews[i];
    const accessors=doc.accessors.filter((a:{bufferView:number})=>a.bufferView===i);
    if(accessors.length!==1)throw new Error('Expected one accessor per exported buffer view');
    const a=accessors[0], stride=v.byteLength/a.count;
    const mode=v.target===34963?'INDICES':'ATTRIBUTES';
    const source=bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
    const encoded=MeshoptEncoder.encodeGltfBuffer(source,a.count,stride,mode);
    const decoded=new Uint8Array(source.length);
    MeshoptDecoder.decodeGltfBuffer(decoded,a.count,stride,encoded,mode);
    // Lossless byte-for-byte verification is part of generation, not an assumption.
    if(!decoded.every((b,j)=>b===source[j]))throw new Error('Meshopt roundtrip changed geometry');
    v.buffer=1;
    v.extensions={EXT_meshopt_compression:{buffer:0,byteOffset:offset,byteLength:encoded.length,byteStride:stride,count:a.count,mode}};
    const aligned=new Uint8Array(Math.ceil(encoded.length/4)*4);aligned.set(encoded);chunks.push(aligned);offset+=aligned.length;
  }
  doc.buffers=[{byteLength:offset},{byteLength:doc.buffers[0].byteLength,extensions:{EXT_meshopt_compression:{fallback:true}}}];
  doc.extensionsUsed=[...new Set([...(doc.extensionsUsed??[]),'EXT_meshopt_compression'])];
  doc.extensionsRequired=[...(doc.extensionsRequired??[]),'EXT_meshopt_compression'];
  const json=new TextEncoder().encode(JSON.stringify(doc)), padded=Math.ceil(json.length/4)*4;
  const out=new Uint8Array(28+padded+offset), header=new DataView(out.buffer);
  header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,out.length,true);
  header.setUint32(12,padded,true);header.setUint32(16,0x4e4f534a,true);
  out.fill(32,20,20+padded);out.set(json,20);
  header.setUint32(20+padded,offset,true);header.setUint32(24+padded,0x004e4942,true);
  let at=28+padded;for(const chunk of chunks){out.set(chunk,at);at+=chunk.length;}
  return out;
}
