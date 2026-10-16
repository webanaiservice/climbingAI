'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clampView, fingerPair, INITIAL_VIEW, zoomView, type Viewport, type XY } from './board-viewport';

export function TianyuPhotoViewport({ children, overlay, disabled, onTap }: { children: ReactNode; overlay?: ReactNode; disabled: boolean; onTap(x:number,y:number,touch:boolean):void }) {
  const host = useRef<HTMLDivElement>(null), latest = useRef({disabled,onTap}); latest.current={disabled,onTap};
  const viewRef = useRef<Viewport>(INITIAL_VIEW), [view,setView] = useState(INITIAL_VIEW);
  const pointers = useRef(new Map<number,XY>()), start = useRef<XY | null>(null), moved = useRef(false), multi = useRef(false);
  function update(next:Viewport) {
    const node=host.current; if(!node)return;
    viewRef.current=clampView(next,node.clientWidth,node.clientHeight);setView(viewRef.current);
  }
  function zoom(factor:number, anchor:XY={x:0,y:0}) {
    const node=host.current;if(!node)return;
    update(zoomView(viewRef.current,factor,anchor,node.clientWidth,node.clientHeight));
  }
  useEffect(()=>{
    const node=host.current;if(!node)return;
    const resize=new ResizeObserver(()=>update(viewRef.current));resize.observe(node);
    const wheel=(event:WheelEvent)=>{
      if(latest.current.disabled || (event.target as Element).closest('.board-zoom-controls,.board-pick-confirm'))return;
      event.preventDefault(); const r=node.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY*.002),{x:event.clientX-r.left-r.width/2,y:event.clientY-r.top-r.height/2});
    };
    node.addEventListener('wheel',wheel,{passive:false});
    return()=>{resize.disconnect();node.removeEventListener('wheel',wheel);};
  },[]);
  // Maintenance keeps its original direct point dragging. Reset the view when it is enabled.
  useEffect(()=>{pointers.current.clear();start.current=null;if(disabled)update(INITIAL_VIEW);},[disabled]);
  return <div ref={host} className={`wall-frame tianyu-photo-viewport ${disabled?'is-maintaining':''}`} data-zoom={view.scale.toFixed(2)}
    onPointerDown={event=>{
      if(disabled || (event.target as Element).closest('button') || event.button!==0)return;
      event.preventDefault();
      const p={x:event.clientX,y:event.clientY};pointers.current.set(event.pointerId,p);
      if(pointers.current.size===1){start.current=p;moved.current=false;multi.current=false;}
      else {multi.current=true;moved.current=true;}
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event=>{
      const old=pointers.current.get(event.pointerId);if(!old)return;
      event.preventDefault();const previous=[...pointers.current.values()];
      const p={x:event.clientX,y:event.clientY};pointers.current.set(event.pointerId,p);
      if(start.current && Math.hypot(p.x-start.current.x,p.y-start.current.y)>8)moved.current=true;
      const node=host.current!;
      if(pointers.current.size>=2){
        const before=fingerPair(previous),after=fingerPair([...pointers.current.values()]),r=node.getBoundingClientRect();
        const next=zoomView(viewRef.current,after.distance/before.distance,{x:before.center.x-r.left-r.width/2,y:before.center.y-r.top-r.height/2},r.width,r.height);
        update({...next,x:next.x+after.center.x-before.center.x,y:next.y+after.center.y-before.center.y});
      }else if(moved.current && !multi.current)update({...viewRef.current,x:viewRef.current.x+p.x-old.x,y:viewRef.current.y+p.y-old.y});
    }}
    onPointerUp={event=>{
      if(!pointers.current.has(event.pointerId))return;
      event.preventDefault();pointers.current.delete(event.pointerId);
      if(!moved.current&&!multi.current)onTap(event.clientX,event.clientY,event.pointerType==='touch');
      if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
      if(!pointers.current.size)start.current=null;
    }}
    onPointerCancel={()=>{pointers.current.clear();start.current=null;moved.current=true;}}
    onLostPointerCapture={event=>{if(pointers.current.has(event.pointerId)){pointers.current.clear();start.current=null;moved.current=true;}}}
  >
    <div className="tianyu-photo-transform" style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.scale})`}}>{children}</div>
    {!disabled && <div className="board-zoom-controls" aria-label="训练板缩放" onPointerDown={event=>event.stopPropagation()}>
      <button type="button" aria-label="缩小训练板" disabled={view.scale<=1} onClick={()=>zoom(1/1.35)}>−</button>
      <button type="button" aria-label="训练板缩放复位" onClick={()=>update(INITIAL_VIEW)}>{Math.round(view.scale*100)}% · 复位</button>
      <button type="button" aria-label="放大训练板" disabled={view.scale>=4} onClick={()=>zoom(1.35)}>＋</button>
    </div>}
    {overlay}
  </div>;
}
