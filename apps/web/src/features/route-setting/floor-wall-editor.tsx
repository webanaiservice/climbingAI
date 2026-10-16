'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { faces, getFace, HEIGHT, WIDTH, workingArea } from '../../../../../packages/config/tianyu-floor-wall';
import { parseFloorDraft, serializeFloorDraft, type FloorHold, type FloorPlacement } from './floor-wall-data';

const Scene = dynamic(() => import('./floor-wall-scene'), { ssr: false, loading: () => <div className="floor-wall-viewport">正在载入 3D 编辑器…</div> });
type Props = {
  holds: FloorHold[]; placements: FloorPlacement[]; selectedId: string | null; faceId: string; pendingHold: FloorHold | null;
  storageKey: string; busy: boolean;
  onSelect(id: string | null): void; onFace(id: string): void; onCancelPlace(): void;
  onPlace(id: string, point: {surfaceId: string; x: number; y: number}): void;
  onUpdate(id: string, patch: Partial<FloorPlacement>): void; onRemove(id: string): void;
  onRestore(placements: FloorPlacement[], faceId: string): void;
};
export default function FloorWallEditor(props: Props) {
  const [interaction,setInteraction] = useState<'edit'|'orbit'>('edit');
  const [view,setView] = useState<{kind:'front'|'side'|'all';nonce:number}>({kind:'front',nonce:0});
  const [zoom,setZoom] = useState({factor:1,nonce:0});
  useEffect(()=>{if(props.pendingHold)setInteraction('edit');},[props.pendingHold]);
  const [status,setStatus] = useState('');
  const [savedFingerprint,setSavedFingerprint] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const viewMenu = useRef<HTMLDetailsElement>(null);
  const point = props.placements.find(p=>p.instanceId===props.selectedId), face = getFace(props.faceId)!;
  const area = workingArea(props.faceId);
  function save() { try { localStorage.setItem(props.storageKey, serializeFloorDraft(props.placements,props.faceId)); setSavedFingerprint(JSON.stringify(props.placements)); setStatus('已保存到本机；下次打开自动恢复。'); } catch { setStatus('本机存储不可用，请导出草稿文件。'); } }
  function exportFile() { const url = URL.createObjectURL(new Blob([serializeFloorDraft(props.placements,props.faceId)],{type:'application/json'}));
    const a = document.createElement('a'); a.href=url; a.download='天宇一楼-3D定线草稿.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); setStatus('草稿已导出，可在其他设备导入。'); }
  async function importFile(file?: File) {
    if (!file) return;
    try { if (file.size>2_000_000) throw new Error('草稿文件超过 2 MB'); const draft=parseFloorDraft(await file.text(),props.holds);
      if (props.placements.length && !window.confirm('导入草稿会替换当前墙面上的岩点，是否继续？')) return;
      props.onRestore(draft.placements,draft.faceId); setStatus('已导入草稿；点击“保存本机”保留。');
    } catch(e) { setStatus(e instanceof Error ? e.message : '导入失败'); }
    finally { if(input.current) input.current.value=''; }
  }
  function setRole(role: FloorPlacement['role']) {
    if (!point) return;
    props.onUpdate(point.instanceId,{role,roles:undefined,startLimbs:role==='start'?['LH','RH']:undefined});
  }
  function toggleLimb(limb: 'LH'|'RH'|'LF'|'RF') {
    if (!point) return;
    const startLimbs = point.startLimbs?.includes(limb) ? point.startLimbs.filter(l=>l!==limb) : [...point.startLimbs??[],limb];
    props.onUpdate(point.instanceId,{startLimbs,roles:undefined,role:startLimbs.some(l=>l==='LH'||l==='RH')?'start':startLimbs.length?'foot':point.role==='start'?'manual':point.role});
  }
  return <div className="floor-wall-editor">
    <div className="floor-wall-tools">
      <label>作业墙段 <select aria-label="作业墙段" value={props.faceId} disabled={props.busy} onChange={e=>{props.onFace(e.target.value);setView(v=>({kind:'front',nonce:v.nonce+1}));}}>
        {faces.filter(f=>f.kind==='main').map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
      </select></label>
      <div className="floor-wall-buttons" aria-label="三维视角">
        <button type="button" aria-pressed={interaction==='edit'} onClick={()=>setInteraction('edit')}>编辑岩点</button>
        <button type="button" aria-pressed={interaction==='orbit'} onClick={()=>{setInteraction('orbit');props.onCancelPlace();}}>旋转视角</button>
        <button type="button" aria-label="放大三维墙面" onClick={()=>setZoom(z=>({factor:1.35,nonce:z.nonce+1}))}>＋</button>
        <button type="button" aria-label="缩小三维墙面" onClick={()=>setZoom(z=>({factor:1/1.35,nonce:z.nonce+1}))}>−</button>
        <details className="floor-view-menu" ref={viewMenu}><summary>视角 ▾</summary><div>
          {([['front','正视墙段'],['side','侧看倾角'],['all','查看全墙']] as const).map(([kind,label])=><button type="button" key={kind} onClick={()=>{setView(v=>({kind,nonce:v.nonce+1}));if(viewMenu.current)viewMenu.current.open=false;}}>{label}</button>)}
        </div></details>
      </div>
    </div>
    <div className="floor-wall-hint" role="status">{props.pendingHold ? <><strong>待放置：{props.pendingHold.serial}</strong> · 轻点墙面安装 <button type="button" onClick={()=>props.onPlace(props.pendingHold!.id,{surfaceId:props.faceId,x:50,y:50})}>放到墙段中心</button><button type="button" onClick={props.onCancelPlace}>取消放置</button></> : interaction==='edit' ? '轻点岩点库，再点墙面放置；单指拖动岩点，双指张开放大。' : '单指 / 鼠标拖动旋转；双指平移与缩放。'}</div>
    <div className="floor-scene-area">
    <Scene placements={props.placements} selectedId={props.selectedId} faceId={props.faceId} pendingHold={props.pendingHold} interaction={interaction} view={view} zoom={zoom}
      onSelect={props.onSelect} onMove={(id,hit)=>props.onUpdate(id,hit)} onPlace={props.onPlace}/>
    <div className="floor-wall-selection" aria-label="三维岩点编辑" hidden={!point}>
      {point ? <>
        <button type="button" className="floor-selection-close" aria-label="收起岩点编辑" onClick={()=>props.onSelect(null)}>×</button>
        <div className="floor-selected-identity"><img src={point.hold.image} alt={point.hold.serial}/><span><strong>{point.hold.serial}</strong><small>{getFace(point.surfaceId??'F2')?.label} · {point.hold.grip}</small></span></div>
        <label>用途<select aria-label="岩点用途" value={point.role} onChange={e=>setRole(e.target.value as FloorPlacement['role'])}>
          {([['manual','普通点'],['start','起步手点'],['move','手点'],['foot','脚点'],['finish','终点']] as const).map(([value,label])=><option value={value} key={value}>{label}</option>)}
        </select></label>
        <div className="floor-wall-buttons">{(['LH','RH','LF','RF'] as const).map((limb,i)=><button type="button" key={limb} aria-label={`起步${['左手','右手','左脚','右脚'][i]}`} aria-pressed={point.startLimbs?.includes(limb)??false} onClick={()=>toggleLimb(limb)}>{['左手','右手','左脚','右脚'][i]}</button>)}</div>
        <button type="button" aria-label="岩点逆时针旋转" onClick={()=>props.onUpdate(point.instanceId,{rotation:point.rotation-15})}>↶ 15°</button>
        <button type="button" aria-label="岩点顺时针旋转" onClick={()=>props.onUpdate(point.instanceId,{rotation:point.rotation+15})}>↷ 15°</button>
        <label>大小<select aria-label="岩点比例" value={point.scale} onChange={e=>props.onUpdate(point.instanceId,{scale:Number(e.target.value)})}>{[.5,.75,1,1.25,1.5,2].map(s=><option value={s} key={s}>{s}×</option>)}</select></label>
        <button type="button" onClick={()=>props.onRemove(point.instanceId)}>删除所选</button>
        <details className="floor-point-position"><summary>精调位置</summary><div>
          <label>墙面<select aria-label="岩点所在墙面" value={point.surfaceId??'F2'} onChange={e=>props.onUpdate(point.instanceId,{surfaceId:e.target.value})}>{faces.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
          <label>横向 %<input aria-label="岩点横向位置" type="number" min="0" max="100" step=".5" value={Number(point.x.toFixed(1))} onChange={e=>props.onUpdate(point.instanceId,{x:Number(e.target.value)})}/></label>
          <label>纵向 %<input aria-label="岩点纵向位置" type="number" min="0" max="100" step=".5" value={Number(point.y.toFixed(1))} onChange={e=>props.onUpdate(point.instanceId,{y:Number(e.target.value)})}/></label>
          <label>线路颜色<input aria-label="岩点线路颜色" type="color" value={point.routeColor} onChange={e=>props.onUpdate(point.instanceId,{routeColor:e.target.value})}/></label>
        </div></details>
      </> : <span>从岩点库选点，轻点墙面放置；点选已安装岩点可编辑。</span>}
    </div>
    </div>
    <div className="floor-wall-footer">
      <div className="floor-wall-buttons"><button type="button" onClick={save}>保存本机</button><button type="button" onClick={exportFile}>导出草稿</button><button type="button" disabled={props.busy} onClick={()=>input.current?.click()}>导入草稿</button></div>
      <input ref={input} hidden type="file" accept=".json,application/json" aria-label="导入三维定线草稿" onChange={e=>void importFile(e.target.files?.[0])}/>
      {status && <span role="status">{savedFingerprint && savedFingerprint!==JSON.stringify(props.placements) && status.startsWith('已保存') ? '草稿有新修改，请保存。' : status}</span>}
      <details><summary>墙面尺寸与建模说明</summary><p>全墙底边 {WIDTH.toFixed(3)} m，攀爬面标注高度 {HEIGHT} m；下方 0.6 m 按底座处理。当前 {face.label}，底宽 {face.bottomWidth} m / 顶宽 {face.topWidth} m。</p><p>AI 在该墙段约 {area.widthM.toFixed(2)} × {area.heightM.toFixed(2)} m 的内接区域布点，以实际米制距离和倾角校验。手工可跨墙段及连接面编辑。</p><p>依据设计截图重建，连接面与底座标高待 CAD / 现场复核。岩点为产品图片与简化厚度，未模拟真实抓握曲面；当前草稿保存在本机，可导出换设备。</p></details>
    </div>
  </div>;
}
