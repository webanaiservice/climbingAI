'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { modelDisplayName } from '../../lib/model-display-name';
import type { TianyuHold } from './tianyu-board';
import {
  addRoutePoint, appendRouteMove, assignStartLimb, moveRouteAction, newTianyuRoute,
  removeRoutePoint, routeDraftWarnings, setRouteRole,
  type RouteLimb, type SavedTianyuRoute, type TianyuRouteDocument, type TianyuRouteEditorState, type TianyuRouteSummary,
} from './tianyu-route';

type Props = {
  editor: TianyuRouteEditorState | null;
  holds: TianyuHold[];
  angle: number;
  boardRevision: string;
  selectedHoldId: string | null;
  disabled: boolean;
  onChange: (state: TianyuRouteEditorState | null) => void;
  onOpen: (state: TianyuRouteEditorState) => void;
  onSelect: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
};
const endpoint = '/route-setting/tianyu/routes';
const limbs: [RouteLimb, string][] = [['LH', '左手'], ['RH', '右手'], ['LF', '左脚'], ['RF', '右脚']];
const techniques = [['static', '静态'], ['side-pull', '侧拉'], ['cross', '交叉'], ['match', '并手'], ['high-step', '高抬脚'], ['flag', '旗式'], ['dynamic', '动态']];

export function TianyuRouteEditor(props: Props) {
  const { editor, selectedHoldId } = props;
  const [rows, setRows] = useState<TianyuRouteSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedPointRef = useRef<HTMLDivElement>(null);
  const setWorking = (value: boolean) => { setBusy(value); props.onBusyChange(value); };
  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try { setRows(await apiRequest<TianyuRouteSummary[]>(endpoint, { signal })); }
    catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : '读取线路失败'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const abort = new AbortController(); void reload(abort.signal); return () => abort.abort(); }, [reload]);
  useEffect(() => {
    const point = selectedPointRef.current;
    const panel = point?.closest<HTMLElement>('.manual-panel');
    if (!point || !panel || !selectedHoldId) return;
    // Scroll only the editor pane, leaving the photograph and page in place.
    const paneBounds = panel.getBoundingClientRect();
    const pointBounds = point.getBoundingClientRect();
    if (pointBounds.top < paneBounds.top + 100 || pointBounds.bottom > paneBounds.bottom) {
      panel.scrollTop += pointBounds.top - paneBounds.top - 100;
    }
  }, [selectedHoldId, Boolean(editor)]);

  const doc = editor?.document;
  const selected = doc?.points.find(p => p.holdId === selectedHoldId);
  const holds = doc?.board.holds ?? props.holds;
  const holdById = new Map(holds.map(h => [h.id, h]));
  const warnings = doc ? routeDraftWarnings(doc) : [];
  const change = (next: TianyuRouteDocument) => {
    if (editor) props.onChange({ ...editor, dirty: true, document: next });
    setNotice(null);
  };
  const mayLeave = () => !editor?.dirty || window.confirm('当前线路有未保存的更改，确定放弃这些更改吗？');

  async function save(asNew = false) {
    if (!editor || busy) return;
    setWorking(true); setError(null); setNotice(null);
    try {
      const id = asNew ? undefined : editor.id;
      const saved = await apiRequest<SavedTianyuRoute>(id ? `${endpoint}/${id}` : endpoint, {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify({ document: editor.document, ...(id ? { revision: editor.revision } : {}) }),
      });
      props.onChange({ id: saved.id, revision: saved.revision, dirty: false, document: saved.document });
      setNotice(`已保存到服务器 · 版本 ${saved.revision} · 待人工试爬`);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存线路失败，当前草稿仍保留'); }
    finally { setWorking(false); }
  }

  async function open(id: string) {
    setWorking(true); setError(null); setNotice(null);
    try {
      const row = await apiRequest<SavedTianyuRoute>(`${endpoint}/${id}`);
      props.onOpen({ id: row.id, revision: row.revision, dirty: false, document: row.document });
    } catch (cause) { setError(cause instanceof Error ? cause.message : '打开线路失败'); }
    finally { setWorking(false); }
  }

  return <section className="manual-route-editor" aria-label="手工线路编辑器" aria-busy={busy}>
    <div className="manual-route-heading">
      <div><h3>手工线路编辑器</h3><p>从零选点，或采用 AI 候选后编辑。线路与板面分别保存，所有草稿都需实际试爬。</p></div>
      <button type="button" disabled={props.disabled || busy || !props.holds.some(h => h.confirmed)} onClick={() => {
        setError(null); setNotice(null); props.onOpen({ dirty: true, document: newTianyuRoute(props.holds, props.angle, props.boardRevision) });
      }}>新建手工线路</button>
    </div>
    {editor && doc && <div className="manual-route-actions" aria-label="线路保存操作">
      <button type="button" disabled={busy || props.disabled || !doc.points.length || !doc.name.trim() || !doc.grade.trim()} onClick={() => void save()}>保存线路草稿</button>
      {editor.id && <button type="button" disabled={busy || props.disabled || !doc.points.length || !doc.name.trim() || !doc.grade.trim()} onClick={() => void save(true)}>另存为新线路</button>}
      <button type="button" disabled={busy || props.disabled} onClick={() => { if (mayLeave()) props.onChange(null); }}>结束线路编辑</button>
      <button type="button" disabled={busy || props.disabled} onClick={() => { if (window.confirm('只清空当前线路的用点和动作，不删除板面岩点。确定继续吗？')) change({ ...doc, points: [], moves: [] }); }}>清空线路用点</button>
    </div>}
    {error && <p className="manual-route-error" role="alert">{error}</p>}
    {notice && <p className="manual-route-notice" role="status">{notice}</p>}
    {editor && doc && <fieldset disabled={busy || props.disabled} className="manual-route-form">
      <legend>{doc.origin.kind === 'ai-assisted' ? 'AI 草案 · 人工编辑' : '纯手工定线'} · {editor.dirty ? '未保存' : `已保存 v${editor.revision}`} · 待试爬</legend>
      {doc.origin.model && <p className="manual-route-caption">{doc.origin.generationSource === 'local-fallback' ? '原候选来自本地搜索回退，未采用云端模型结果；请求模型：' : '原候选模型：'}{modelDisplayName(doc.origin.model)}。原始候选保留在存档中；编辑后的线路不沿用原 AI 评分或校验结论。</p>}
      <div className="manual-route-fields">
        <label>线路名称<input aria-label="线路名称" value={doc.name} maxLength={80} onChange={e => change({ ...doc, name: e.target.value })} /></label>
        <label>目标难度（待试爬）<input aria-label="目标难度" value={doc.grade} maxLength={32} onChange={e => change({ ...doc, grade: e.target.value })} /></label>
        <label>线路仰角<select aria-label="线路仰角" value={doc.board.angle} onChange={e => change({ ...doc, board: { ...doc.board, angle: Number(e.target.value) } })}>
          {Array.from({ length: 13 }, (_, i) => i * 5).map(a => <option key={a} value={a}>{a}°</option>)}
        </select></label>
      </div>
      <p className="manual-route-caption">点击板上岩点即可加入线路，再设置用途。重复点击只选中，不会误删；板面坐标保持锁定。共 {doc.points.length} 个独立点、{doc.moves.length} 个手部动作。</p>
      {selectedHoldId && holdById.has(selectedHoldId) && <div ref={selectedPointRef} className="manual-route-point" aria-label="当前线路点编辑">
        <strong>{holdById.get(selectedHoldId)!.serial}</strong>
        {!selected ? <button type="button" onClick={() => change(addRoutePoint(doc, selectedHoldId))}>加入线路</button> : <>
          <div className="manual-route-controls">
            {([['move', '手点'], ['foot', '脚点'], ['finish', '终点']] as const).map(([role, label]) => <label key={role}>
              <input type="checkbox" aria-label={`所选点用作${label}`} checked={selected.roles.includes(role)} onChange={e => change(setRouteRole(doc, selected.holdId, role, e.target.checked))} />{label}
            </label>)}
          </div>
          <div className="manual-route-controls"><span>起步：</span>{limbs.map(([limb, label]) => <button key={limb} type="button" aria-label={`设置起步${label}`} aria-pressed={selected.startLimbs.includes(limb)} onClick={() => change(assignStartLimb(doc, selected.holdId, limb))}>{label}</button>)}</div>
          <div className="manual-route-controls">
            <button type="button" disabled={doc.moves.length >= 100} onClick={() => change(appendRouteMove(doc, selected.holdId))}>追加一次用手动作（可复用）</button>
            <button type="button" onClick={() => change(removeRoutePoint(doc, selected.holdId))}>从线路移除（保留板面岩点）</button>
          </div>
        </>}
      </div>}
      <div className="manual-route-point-buttons" aria-label="人工线路点清单">{doc.points.map(p => <button key={p.holdId} type="button" aria-pressed={p.holdId === selectedHoldId} onClick={() => props.onSelect(p.holdId)}>
        {holdById.get(p.holdId)?.serial} · {[...p.startLimbs.map(l => `起步${limbs.find(([key]) => key === l)?.[1]}`), ...p.roles.map(r => ({ move: '手', foot: '脚', finish: '终' })[r])].join(' / ') || '待设用途'}
      </button>)}</div>
      <h4>手部动作顺序</h4><p className="manual-route-caption">起步四肢在上方设置，不计为移动动作；同一岩点可以在多个动作中重复使用。脚点用途单独保留。</p>
      <ol className="manual-route-moves">{doc.moves.map((move, index) => <li key={move.id}>
        <span>{index + 1}</span>
        <select aria-label={`动作${index + 1}岩点`} value={move.holdId} onChange={e => change({ ...doc,
          points: doc.points.map(p => p.holdId === e.target.value ? { ...p, roles: [...new Set([...p.roles, 'move' as const])] } : p),
          moves: doc.moves.map(m => m.id === move.id ? { ...m, holdId: e.target.value } : m),
        })}>{doc.points.map(p => <option key={p.holdId} value={p.holdId}>{holdById.get(p.holdId)?.serial}</option>)}</select>
        <select aria-label={`动作${index + 1}用手`} value={move.hand} onChange={e => change({ ...doc, moves: doc.moves.map(m => m.id === move.id ? { ...m, hand: e.target.value as typeof m.hand } : m) })}>
          <option value="left">左手</option><option value="right">右手</option><option value="both">双手</option>
        </select>
        <select aria-label={`动作${index + 1}技术`} value={move.technique} onChange={e => change({ ...doc, moves: doc.moves.map(m => m.id === move.id ? { ...m, technique: e.target.value } : m) })}>
          {!techniques.some(([value]) => value === move.technique) && <option value={move.technique}>{move.technique}</option>}
          {techniques.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input aria-label={`动作${index + 1}说明`} placeholder="动作／修改理由" value={move.note} maxLength={500} onChange={e => change({ ...doc, moves: doc.moves.map(m => m.id === move.id ? { ...m, note: e.target.value } : m) })} />
        <div className="manual-route-controls">
          <button type="button" aria-label={`动作${index + 1}上移`} disabled={index === 0} onClick={() => change(moveRouteAction(doc, index, -1))}>↑</button>
          <button type="button" aria-label={`动作${index + 1}下移`} disabled={index === doc.moves.length - 1} onClick={() => change(moveRouteAction(doc, index, 1))}>↓</button>
          <button type="button" aria-label={`删除动作${index + 1}`} onClick={() => change({ ...doc, moves: doc.moves.filter(m => m.id !== move.id) })}>删除动作</button>
        </div>
      </li>)}</ol>
      <label>定线说明／调整理由<textarea aria-label="定线说明" value={doc.notes} maxLength={3000} rows={2} onChange={e => change({ ...doc, notes: e.target.value })} /></label>
      {warnings.length > 0 && <div className="manual-route-warnings"><strong>可先保存草稿，以下项目待完善：</strong><ul>{warnings.map(w => <li key={w}>{w}</li>)}</ul></div>}
      <p className="manual-route-caption">以上仅检查信息完整性，不代表动作可达、等级准确或线路安全；必须人工检查和试爬。</p>
    </fieldset>}
    <details className="manual-route-library" open={!editor}><summary>服务器线路草稿库 · 最近 100 条 · {rows.length} 条</summary>
      <p className="manual-route-caption">按当前岩馆隔离，包含板面快照与角度，可跨设备打开；打开不会覆盖浏览器中已保存的板面。</p>
      <button type="button" disabled={loading || busy} onClick={() => { setError(null); void reload(); }}>刷新线路库</button>
      {loading ? <p role="status">正在读取线路…</p> : rows.length === 0 ? <p>尚未保存线路。</p> : <ul>{rows.map(row => <li key={row.id}>
        <span><strong>{row.name}</strong> · {row.grade} · {row.angle}° · v{row.revision}<small>{new Date(row.updatedAt).toLocaleString('zh-CN')}</small></span>
        <button type="button" disabled={busy || props.disabled} onClick={() => void open(row.id)}>打开线路 {row.name}</button>
      </li>)}</ul>}
    </details>
  </section>;
}
