'use client';
import { useState } from 'react';
import {
  Plus,
  ArrowUpRight,
  Search,
  Star,
  Bird,
  CalendarDays,
  Target,
  Play,
  CheckCircle2,
  Clock3,
  Ruler,
  ChevronRight,
} from 'lucide-react';
import { Empty, Pill, Stat, TrainingDialog } from './training-ui';
import { ageLabel, comparableProgress, dateLabel, secondsLabel } from './training-utils';
import {
  categories,
  outcomes,
  taskStatuses,
  timingSources,
  type Athlete,
  type Attempt,
  type FormState,
  type Workspace,
} from './training-types';
import { apiRequest } from '../../lib/api';
interface Props {
  data: Workspace;
  athleteFilter: string;
  onForm: (form: FormState) => void;
  onAttempt: (id: string) => void;
}
export function AthletePanel({
  data,
  onForm,
  onProfile,
}: Props & { onProfile: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const athletes = data.athletes.filter(
    (a) =>
      a.archived === archived &&
      `${a.name} ${a.coachName} ${a.groupName}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="tr-athlete-layout">
      <section className="tr-panel">
        <div className="tr-section-heading">
          <div>
            <h3>
              运动员档案 <span>{athletes.length}</span>
            </h3>
            <p>成长、训练与每一次突破，放在同一份档案里。</p>
          </div>
          <button className="tr-button" onClick={() => onForm({ kind: 'athlete' })}>
            <Plus size={16} />
            新建档案
          </button>
        </div>
        <div className="tr-toolbar">
          <label className="tr-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索姓名、组别或教练"
              aria-label="搜索运动员"
            />
          </label>
          <label className="tr-checkbox">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            查看已归档
          </label>
        </div>
        {!athletes.length ? (
          <Empty
            title={
              search ? '没有匹配的运动员' : archived ? '暂无已归档运动员' : '从第一位运动员开始'
            }
            text={
              search
                ? '试试其他姓名、教练或组别。'
                : '建立档案后，就可以记录训练、上传视频和追踪进步。'
            }
            action={
              !archived &&
              !search && (
                <button className="tr-button secondary" onClick={() => onForm({ kind: 'athlete' })}>
                  建立运动员档案 <ArrowUpRight size={16} />
                </button>
              )
            }
          />
        ) : (
          <div className="tr-athlete-grid">
            {athletes.map((a, index) => {
              const latest = a.measurements[0];
              const tasks = data.tasks.filter(
                (t) => t.athleteId === a.id && !['IMPROVED', 'NO_CHANGE'].includes(t.status),
              );
              return (
                <button className="tr-athlete-card" key={a.id} onClick={() => onProfile(a.id)}>
                  <div className="tr-athlete-top">
                    <span className={`tr-avatar tone-${index % 4}`}>{a.name.slice(-2)}</span>
                    <ArrowUpRight size={18} />
                  </div>
                  <h4>{a.name}</h4>
                  <p>
                    {ageLabel(a.birthDate)} <span>·</span> {a.groupName || '未设置组别'}
                  </p>
                  <div className="tr-athlete-measures">
                    <span>
                      <small>身高</small>
                      <b>
                        {latest?.heightCm ?? '—'}
                        <em> cm</em>
                      </b>
                    </span>
                    <span>
                      <small>体重</small>
                      <b>
                        {latest?.weightKg ?? '—'}
                        <em> kg</em>
                      </b>
                    </span>
                  </div>
                  <div className="tr-athlete-focus">
                    <Target size={14} />
                    <span>{a.goal || '添加一个当前训练目标'}</span>
                  </div>
                  <footer>
                    <span>{a.coachName ? `${a.coachName} 教练` : '教练待设置'}</span>
                    <span>
                      {tasks.length ? `${tasks.length} 项进行中` : '查看档案'}{' '}
                      <ChevronRight size={12} />
                    </span>
                  </footer>
                </button>
              );
            })}
          </div>
        )}
      </section>
      <aside className="tr-side-stack">
        <div className="tr-panel tr-course-panel">
          <div className="tr-section-heading">
            <div>
              <span className="tr-overline">FIXED ROUTES</span>
              <h3>固定速度线路</h3>
            </div>
            <button
              className="tr-icon-button"
              aria-label="新增线路版本"
              onClick={() => onForm({ kind: 'course' })}
            >
              <Plus size={18} />
            </button>
          </div>
          {(['STAR', 'BIRD'] as const).map((kind) => {
            const courses = data.courses.filter((c) => c.kind === kind);
            const Icon = kind === 'STAR' ? Star : Bird;
            return (
              <div key={kind} className={`tr-course-card ${kind === 'BIRD' ? 'bird' : ''}`}>
                <Icon size={25} strokeWidth={1.5} />
                <div>
                  <h4>{kind === 'STAR' ? '星星道' : '飞鸟道'}</h4>
                  <p>{courses.length ? `${courses.length} 个安装版本` : '待建立馆内版本'}</p>
                </div>
                <button
                  className="tr-icon-button"
                  aria-label={`建立${kind === 'STAR' ? '星星道' : '飞鸟道'}版本`}
                  onClick={() => onForm({ kind: 'course', courseKind: kind })}
                >
                  <Plus size={18} />
                </button>
                {courses.map((c) => (
                  <div className="tr-course-version" key={c.id}>
                    <strong>
                      {c.name} · {c.version}
                    </strong>
                    <small>
                      {c.standardReference || '标准来源待核实'}
                      {c.notes ? ` · ${c.notes}` : ''}
                    </small>
                  </div>
                ))}
              </div>
            );
          })}
          <p className="tr-caption">按实际安装建档。不同线路、加点与安装版本分别比较。</p>
        </div>
        <div className="tr-note-panel">
          <span className="tr-overline">ONE STEP AT A TIME</span>
          <h3>让训练有迹可循</h3>
          <ol>
            <li>记录真实表现</li>
            <li>找到一个明确的问题</li>
            <li>练习后，用视频验证</li>
          </ol>
          <p>优先与自己稳定成功的动作比较。</p>
        </div>
      </aside>
    </div>
  );
}
export function AthleteProfile({
  athlete,
  data,
  onClose,
  onForm,
  onReload,
}: {
  athlete: Athlete;
  data: Workspace;
  onClose: () => void;
  onForm: (form: FormState) => void;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function archive() {
    setBusy(true);
    try {
      await apiRequest(`/training/athletes/${athlete.id}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: !athlete.archived }),
      });
      await onReload();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <TrainingDialog
      title={athlete.name}
      subtitle={`${ageLabel(athlete.birthDate)} · ${athlete.groupName || '未设置组别'} · ${athlete.coachName || '未设置教练'}`}
      onClose={onClose}
      busy={busy}
    >
      <div className="tr-profile-content">
        <div className="tr-profile-goal">
          <Target size={20} />
          <div>
            <small>当前训练目标</small>
            <p>{athlete.goal || '尚未设置训练目标'}</p>
          </div>
        </div>
        <div className="tr-profile-numbers">
          <span>
            <b>{data.sessions.filter((s) => s.athleteId === athlete.id).length}</b>近期训练课
          </span>
          <span>
            <b>{data.attempts.filter((a) => a.athleteId === athlete.id).length}</b>近期攀爬记录
          </span>
          <span>
            <b>{athlete.trainingSince?.slice(0, 10) ?? '—'}</b>开始训练日期
          </span>
        </div>
        <div className="tr-section-heading">
          <h3>
            <Ruler size={17} />
            成长与体能记录
          </h3>
          <button
            className="tr-button secondary small"
            disabled={athlete.archived}
            onClick={() => {
              onClose();
              onForm({ kind: 'measurement', athleteId: athlete.id });
            }}
          >
            <Plus size={15} />
            添加记录
          </button>
        </div>
        {athlete.measurements.length ? (
          <div className="tr-table-wrap">
            <table className="tr-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>身高 / 体重 / 臂展</th>
                  <th>体能测试</th>
                </tr>
              </thead>
              <tbody>
                {athlete.measurements.map((m) => (
                  <tr key={m.id}>
                    <td>{m.measuredAt.slice(0, 10)}</td>
                    <td>
                      {m.heightCm ?? '—'} cm / {m.weightKg ?? '—'} kg / {m.armSpanCm ?? '—'} cm
                    </td>
                    <td>
                      {m.testName ? `${m.testName}：${m.testResult}` : '—'}
                      {m.notes && <small>{m.notes}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="tr-caption">还没有测量记录。每次记录保留日期，便于回看当时的成长阶段。</p>
        )}
        {athlete.notes && <p className="tr-profile-notes">{athlete.notes}</p>}
        {error && (
          <p className="tr-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer>
        <button className="tr-button ghost" disabled={busy} onClick={archive}>
          {athlete.archived ? '恢复档案' : '归档运动员'}
        </button>
        <button
          className="tr-button"
          onClick={() => {
            onClose();
            onForm({ kind: 'athlete', athlete });
          }}
        >
          编辑档案
        </button>
      </footer>
    </TrainingDialog>
  );
}
export function SessionsPanel({ data, athleteFilter, onForm }: Props) {
  const sessions = data.sessions.filter((s) => !athleteFilter || s.athleteId === athleteFilter);
  return (
    <section className="tr-panel">
      <div className="tr-section-heading">
        <div>
          <h3>训练日志</h3>
          <p>将训练目标与实际完成情况一起记录，保留最近 {data.limits.sessions} 次训练课。</p>
        </div>
        <button
          className="tr-button"
          onClick={() => onForm({ kind: 'session', athleteId: athleteFilter })}
        >
          <Plus size={16} />
          记录训练
        </button>
      </div>
      {!sessions.length ? (
        <Empty
          title="下一次进步，从这次记录开始"
          text="记下本次目标、训练内容和感受，为后续视频复盘提供背景。"
        />
      ) : (
        <div className="tr-session-list">
          {sessions.map((s) => (
            <article key={s.id}>
              <div className="tr-date-box">
                <span>{new Date(s.trainedAt).getUTCMonth() + 1} 月</span>
                <b>{new Date(s.trainedAt).getUTCDate()}</b>
              </div>
              <div className="tr-session-main">
                <div>
                  <Pill>{categories[s.category]}</Pill>
                  <span>{data.athletes.find((a) => a.id === s.athleteId)?.name}</span>
                </div>
                <h4>{s.focus}</h4>
                <p>{s.actualWork || '尚未补充实际训练内容'}</p>
                {s.notes && <small>{s.notes}</small>}
                {s.painNote && <small className="tr-pain-note">身体感受：{s.painNote}</small>}
              </div>
              <div className="tr-session-meta">
                <span>
                  <Clock3 size={15} /> {s.durationMinutes} 分钟
                </span>
                <small>
                  主观疲劳 {s.fatigue ?? '未记录'}
                  {s.fatigue ? ' / 10' : ''}
                </small>
                <button
                  className="tr-button secondary small"
                  onClick={() => onForm({ kind: 'attempt', athleteId: s.athleteId })}
                >
                  记录攀爬 <Plus size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
export function TasksPanel({ data, athleteFilter, onForm }: Props) {
  const tasks = data.tasks.filter((t) => !athleteFilter || t.athleteId === athleteFilter);
  return (
    <section>
      <div className="tr-section-heading">
        <div>
          <h3>让建议走进下一次训练</h3>
          <p>每个任务都有练习目标与复测标准。</p>
        </div>
        <button
          className="tr-button"
          onClick={() => onForm({ kind: 'task', athleteId: athleteFilter })}
        >
          <Plus size={16} />
          安排任务
        </button>
      </div>
      <div className="tr-task-board">
        {[
          ['TODO', '待安排'],
          ['PRACTICING', '练习中'],
          ['RETEST', '待复测'],
          ['DONE', '已复测'],
        ].map(([status, label]) => {
          const rows = tasks.filter((t) =>
            status === 'DONE' ? ['IMPROVED', 'NO_CHANGE'].includes(t.status) : t.status === status,
          );
          return (
            <div className="tr-task-column" key={status}>
              <header>
                <span className={`tr-dot ${status}`} />
                {label}
                <b>{rows.length}</b>
              </header>
              {!rows.length && <p className="tr-task-placeholder">暂无任务</p>}
              {rows.map((t) => (
                <article className="tr-task-card" key={t.id}>
                  <small>{data.athletes.find((a) => a.id === t.athleteId)?.name}</small>
                  <h4>{t.title}</h4>
                  <p>{t.instructions}</p>
                  <div className="tr-task-criterion">
                    <Target size={14} />
                    <span>{t.criterion}</span>
                  </div>
                  {t.resultNote && (
                    <div className="tr-task-result">
                      <CheckCircle2 size={14} />
                      <span>
                        {taskStatuses[t.status]} · {t.resultNote}
                      </span>
                    </div>
                  )}
                  <footer>
                    <span>
                      <CalendarDays size={13} />
                      {t.dueAt ? `${dateLabel(t.dueAt)} 复测` : '未定日期'}
                    </span>
                    <button
                      className="tr-text-button"
                      onClick={() => onForm({ kind: 'retest', task: t })}
                    >
                      更新 <ChevronRight size={14} />
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
export function ProgressPanel({ data, athleteFilter, onAttempt }: Props) {
  const [localAthlete, setLocalAthlete] = useState(
    data.athletes.find((a) => !a.archived)?.id ?? '',
  );
  const [courseId, setCourseId] = useState(data.courses[0]?.id ?? '');
  const [source, setSource] = useState('TIMER');
  const athleteId = athleteFilter || localAthlete;
  const stats = comparableProgress(data.attempts, athleteId, courseId, source);
  return (
    <section className="tr-progress">
      <div className="tr-panel">
        <div className="tr-section-heading">
          <div>
            <h3>把进步放在同一把尺子上</h3>
            <p>同一运动员、同一线路版本、全程攀爬；耗时按相同计时来源比较。</p>
          </div>
        </div>
        <div className="tr-progress-filters">
          {!athleteFilter && (
            <label>
              运动员
              <select
                aria-label="报告运动员"
                value={localAthlete}
                onChange={(e) => setLocalAthlete(e.target.value)}
              >
                <option value="">选择运动员</option>
                {data.athletes.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            线路版本
            <select
              aria-label="报告线路版本"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              <option value="">选择线路版本</option>
              {data.courses.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name} · {c.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            计时来源
            <select
              aria-label="报告计时来源"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {Object.entries(timingSources)
                .filter(([k]) => k !== 'NONE')
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </div>
      <div className="tr-stats">
        <Stat
          label="最佳有效成绩"
          value={secondsLabel(stats.best)}
          unit="秒"
          detail={`${stats.timed.length} 次同来源有效计时`}
          accent
        />
        <Stat
          label="有效成绩中位数"
          value={secondsLabel(stats.median)}
          unit="秒"
          detail="观察常态表现，而不只看最快一次"
        />
        <Stat
          label="全程完成率"
          value={stats.completionRate ?? '—'}
          unit="%"
          detail={`${stats.success.length} / ${stats.known.length} 次已确认结果（所有计时来源）`}
        />
        <Stat label="待确认结果" value={stats.unknown} unit="次" detail="未计入完成率分母" />
      </div>
      <div className="tr-panel">
        <div className="tr-section-heading">
          <div>
            <h3>成绩轨迹</h3>
            <p>点击数据点打开当次复盘。仅展示近期已载入记录，不将失败尝试计为零秒。</p>
          </div>
          <Pill>{timingSources[source]}</Pill>
        </div>
        {stats.timed.length ? (
          <TimeChart attempts={stats.timed} onAttempt={onAttempt} />
        ) : (
          <Empty
            title="还没有可比较的计时记录"
            text="选择运动员和线路版本，记录有效完攀成绩后，进步轨迹会出现在这里。"
          />
        )}
      </div>
      {stats.rows.length > 0 && (
        <div className="tr-panel">
          <h3>全部尝试 · 包含失误与待确认</h3>
          <div className="tr-table-wrap">
            <table className="tr-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>赛道</th>
                  <th>结果</th>
                  <th>成绩 / 来源</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {stats.rows.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.attemptedAt).toLocaleString('zh-CN')}</td>
                    <td>{a.lane}</td>
                    <td>
                      <Pill tone={a.outcome === 'SUCCESS' ? 'green' : ''}>
                        {outcomes[a.outcome]}
                      </Pill>
                    </td>
                    <td>
                      {secondsLabel(a.timeMs)} 秒 · {timingSources[a.timingSource]}
                    </td>
                    <td>
                      <button className="tr-text-button" onClick={() => onAttempt(a.id)}>
                        <Play size={14} />
                        复盘
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
function TimeChart({
  attempts,
  onAttempt,
}: {
  attempts: Attempt[];
  onAttempt: (id: string) => void;
}) {
  const values = attempts.map((a) => a.timeMs! / 1000);
  const min = Math.max(0, Math.min(...values) - 0.5);
  const max = Math.max(...values) + 0.5;
  const points = attempts.map((a, i) => ({
    a,
    x: attempts.length === 1 ? 440 : 65 + (i / (attempts.length - 1)) * 785,
    y: 210 - ((a.timeMs! / 1000 - min) / (max - min)) * 165,
  }));
  return (
    <div className="tr-chart">
      <svg
        viewBox="0 0 900 265"
        role="img"
        aria-label={`${attempts.length} 次有效攀爬成绩趋势，纵轴单位秒`}
      >
        <defs>
          <linearGradient id="training-area" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#94bda8" stopOpacity=".35" />
            <stop offset="1" stopColor="#94bda8" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="65"
              x2="850"
              y1={45 + i * 55}
              y2={45 + i * 55}
              stroke="#e5eae4"
              strokeDasharray="4 5"
            />
            <text x="48" y={50 + i * 55} textAnchor="end" fill="#7c8982" fontSize="12">
              {(max - ((max - min) * i) / 3).toFixed(1)}
            </text>
          </g>
        ))}
        <path
          d={`M${points[0].x},215 L${points.map((p) => `${p.x},${p.y}`).join(' L')} L${points.at(-1)!.x},215 Z`}
          fill="url(#training-area)"
        />
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#27634e"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {points.map(({ a, x, y }, i) => (
          <g
            key={a.id}
            tabIndex={0}
            role="button"
            aria-label={`${dateLabel(a.attemptedAt)}，${secondsLabel(a.timeMs)} 秒，打开复盘`}
            onClick={() => onAttempt(a.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onAttempt(a.id);
            }}
          >
            <circle cx={x} cy={y} r="10" fill="transparent" />
            <circle cx={x} cy={y} r="4.5" fill="#fff" stroke="#27634e" strokeWidth="2" />
            <title>
              {dateLabel(a.attemptedAt)} · {secondsLabel(a.timeMs)} 秒
            </title>
            {(attempts.length <= 12 || i === 0 || i === points.length - 1) && (
              <text x={x} y="244" textAnchor="middle" fill="#7c8982" fontSize="11">
                {dateLabel(a.attemptedAt)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
