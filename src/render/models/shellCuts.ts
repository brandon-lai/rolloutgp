import * as T from 'three/webgpu';
type Vertex={p:T.Vector3;n:T.Vector3;uv:T.Vector2};
/** Subtract convex UV holes from loft triangles and give each cut a physical rim.
 * Geometry stays render-only; sim mass and toughness still come from the recipe.
 */
export function cutShell(source:T.BufferGeometry, holes:{u:number;v:number;rx:number;ry:number}[], thickness:number):T.BufferGeometry {
  if(!holes.length)return source;
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[];
  const emit=(v:Vertex)=>{positions.push(v.p.x,v.p.y,v.p.z);normals.push(v.n.x,v.n.y,v.n.z);uvs.push(v.uv.x,v.uv.y);};
  const mix=(a:Vertex,b:Vertex,t:number):Vertex=>({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),uv:a.uv.clone().lerp(b.uv,t)});
  const attr=source.getAttribute('position'),nor=source.getAttribute('normal'),uv=source.getAttribute('uv'),idx=source.index!;
  const get=(i:number):Vertex=>({p:new T.Vector3().fromBufferAttribute(attr,i),n:new T.Vector3().fromBufferAttribute(nor,i),uv:new T.Vector2(uv.getX(i),uv.getY(i))});
  for(let i=0;i<idx.count;i+=3){
    let fragments=[[get(idx.getX(i)),get(idx.getX(i+1)),get(idx.getX(i+2))]];
    for(const h of holes){
      const next:Vertex[][]=[];
      for(const polygon of fragments){
        if(polygon.every(v=>v.uv.x<h.u-h.rx)||polygon.every(v=>v.uv.x>h.u+h.rx)||polygon.every(v=>v.uv.y<h.v-h.ry)||polygon.every(v=>v.uv.y>h.v+h.ry)){next.push(polygon);continue;}
        let inside=polygon;
        for(let j=0;j<24 && inside.length>=3;j++){
          const a=new T.Vector2(h.u+Math.cos(j/24*Math.PI*2)*h.rx,h.v+Math.sin(j/24*Math.PI*2)*h.ry);
          const b=new T.Vector2(h.u+Math.cos((j+1)/24*Math.PI*2)*h.rx,h.v+Math.sin((j+1)/24*Math.PI*2)*h.ry);
          const distance=(v:Vertex)=>(b.x-a.x)*(v.uv.y-a.y)-(b.y-a.y)*(v.uv.x-a.x);
          const inn:Vertex[]=[],out:Vertex[]=[];
          for(let k=0;k<inside.length;k++){
            const p=inside[k],q=inside[(k+1)%inside.length],dp=distance(p),dq=distance(q);
            (dp>=0?inn:out).push(p);
            if((dp>=0)!==(dq>=0)){const cross=mix(p,q,dp/(dp-dq));inn.push(cross);out.push(cross);}
          }
          if(out.length>=3)next.push(out);
          inside=inn;
        }
        // The remaining polygon lies within the hole. Only its edges on the
        // ellipse are cut boundaries (triangle seams must not get walls).
        for(let k=0;k<inside.length;k++){
          const a=inside[k],b=inside[(k+1)%inside.length];
          const on=(v:Vertex)=>Math.abs(Math.hypot((v.uv.x-h.u)/h.rx,(v.uv.y-h.v)/h.ry)-1)<.012;
          if(!on(a)||!on(b))continue;
          const aa={...a,p:a.p.clone().addScaledVector(a.n,-thickness)},bb={...b,p:b.p.clone().addScaledVector(b.n,-thickness)};
          const n=b.p.clone().sub(a.p).cross(a.n).normalize();
          for(const v of [a,b,aa,b,bb,aa])emit({...v,n});
        }
      }
      fragments=next;
    }
    for(const poly of fragments)for(let j=1;j<poly.length-1;j++)for(const v of [poly[0],poly[j],poly[j+1]])emit(v);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));source.dispose();return g;
}
