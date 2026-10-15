import { useEffect, useRef, useState } from 'react';
import { useApp } from './state.tsx';
import type { Part } from '../sim/parts.ts';
export function PartThumbnail({part}:{part:Part}) {
  const {viewport}=useApp(),ref=useRef<HTMLSpanElement>(null);
  const [src,setSrc]=useState('');
  useEffect(()=>{
    let active=true;
    if(!viewport||!ref.current)return;
    const observer=new IntersectionObserver(entries=>{
      if(!entries.some(e=>e.isIntersecting))return;
      observer.disconnect();
      void import('../render/thumbnails.ts').then(m=>m.partThumbnail(viewport,part)).then(url=>{if(active)setSrc(url);}).catch(()=>{});
    });observer.observe(ref.current);
    return()=>{active=false;observer.disconnect();};
  },[viewport,part]);
  return <span className="part-thumbnail" ref={ref} aria-hidden="true">{src&&<img src={src} alt="" width="96" height="64"/>}</span>;
}
