'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  ChartNoAxesCombined,
  Film,
  Flag,
  LoaderCircle,
  RefreshCw,
  Users,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import {
  AthletePanel,
  AthleteProfile,
  ProgressPanel,
  SessionsPanel,
  TasksPanel,
} from './training-panels';
import { ReviewPanel } from './training-review';
import { TrainingForm } from './training-forms';
import { Stat } from './training-ui';
import type { FormState, Tab, Workspace } from './training-types';
import './training.css';
const tabs = [
  { id: 'athletes', label: '运动员档案', icon: Users },
  { id: 'sessions', label: '训练日志', icon: BookOpen },
  { id: 'review', label: '视频复盘', icon: Film },
  { id: 'tasks', label: '训练任务', icon: Flag },
  { id: 'progress', label: '成长报告', icon: ChartNoAxesCombined },
] as const;
export function TrainingWorkspace() {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('athletes');
  const [athleteFilter, setAthleteFilter] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [profileId, setProfileId] = useState('');
  const [attemptId, setAttemptId] = useState('');
  const [savedRevision, setSavedRevision] = useState(0);
  const reload = useCallback(async () => {
    const result = await apiRequest<Workspace>('/training/workspace');
    setData(result);
    setError('');
  }, []);
  useEffect(() => {
    void reload().catch((e: Error) => setError(e.message));
  }, [reload]);
  const openAttempt = (id: string) => {
    setAttemptId(id);
    setTab('review');
  };
  const openForm = (value: FormState) => setForm(value);
  const profile = data?.athletes.find((a) => a.id === profileId);
  return (
    <div className="training-workspace">
      <section className="tr-hero">
        <div>
          <span className="tr-overline">TRAIN WITH PURPOSE</span>
          <h2>每一攀，都更进一步。</h2>
          <p>从一份档案，到一次复盘，再到下一次突破。</p>
          <div className="tr-hero-tags">
            <span>青少年攀岩训练</span>
            <span>星星道 / 飞鸟道</span>
          </div>
        </div>
        <div className="tr-hero-right">
          <div className="tr-hero-route" aria-hidden="true">
            <svg viewBox="0 0 220 150">
              <path
                d="m30 140 42-28-14-29 65-18-17-27 56-26"
                fill="none"
                stroke="currentColor"
                strokeDasharray="4 6"
              />
              {[
                [30, 140],
                [72, 112],
                [58, 83],
                [123, 65],
                [106, 38],
                [162, 12],
              ].map(([x, y], i) => (
                <rect
                  x={x - 6}
                  y={y - 4}
                  width="13"
                  height="9"
                  rx="3"
                  transform={`rotate(-20 ${x} ${y})`}
                  key={i}
                  fill="currentColor"
                />
              ))}
            </svg>
          </div>
          <button
            className="tr-button lime"
            disabled={!data}
            onClick={() => openForm({ kind: 'attempt', athleteId: athleteFilter })}
          >
            记录一次攀爬 <ArrowUpRight size={18} />
          </button>
        </div>
      </section>
      {error && (
        <div className="tr-error" role="alert">
          {error}
          <button
            className="tr-text-button"
            onClick={() => void reload().catch((e: Error) => setError(e.message))}
          >
            <RefreshCw size={15} />
            重试
          </button>
        </div>
      )}
      {!data ? (
        !error && (
          <div className="tr-loading">
            <LoaderCircle className="tr-spin" size={24} />
            正在读取训练档案…
          </div>
        )
      ) : (
        <>
          <div className="tr-stats">
            <Stat
              label="在训运动员"
              value={data.athletes.filter((a) => !a.archived).length}
              unit="位"
              detail="每位运动员，一份持续成长的档案"
              accent
            />
            <Stat
              label="攀爬记录"
              value={data.totalAttempts}
              unit="次"
              detail="保留成功、失误与每次尝试"
            />
            <Stat
              label="待教练复核"
              value={
                data.attempts.filter(
                  (a) => a.analyses[0]?.status === 'READY' && !a.analyses[0]?.reviews.length,
                ).length
              }
              unit="份"
              detail="近期视频的最新 AI 复盘"
            />
            <Stat
              label="进行中的任务"
              value={data.tasks.filter((t) => !['IMPROVED', 'NO_CHANGE'].includes(t.status)).length}
              unit="项"
              detail="用下一次训练检验建议"
            />
          </div>
          <div className="tr-navigation">
            <nav aria-label="训练中心功能">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  aria-current={tab === id ? 'page' : undefined}
                  className={tab === id ? 'is-active' : ''}
                  onClick={() => {
                    setTab(id);
                    if (id !== 'review') setAttemptId('');
                  }}
                >
                  <Icon size={17} />
                  {label}
                </button>
              ))}
            </nav>
            {tab !== 'athletes' && (
              <select
                aria-label="筛选运动员"
                value={athleteFilter}
                onChange={(e) => {
                  setAthleteFilter(e.target.value);
                  setAttemptId('');
                }}
              >
                <option value="">全部运动员</option>
                {data.athletes.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                    {a.archived ? '（已归档）' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          {tab === 'athletes' && (
            <AthletePanel
              data={data}
              athleteFilter={athleteFilter}
              onForm={openForm}
              onAttempt={openAttempt}
              onProfile={setProfileId}
            />
          )}
          {tab === 'sessions' && (
            <SessionsPanel
              data={data}
              athleteFilter={athleteFilter}
              onForm={openForm}
              onAttempt={openAttempt}
            />
          )}
          {tab === 'tasks' && (
            <TasksPanel
              data={data}
              athleteFilter={athleteFilter}
              onForm={openForm}
              onAttempt={openAttempt}
            />
          )}
          {tab === 'progress' && (
            <ProgressPanel
              data={data}
              athleteFilter={athleteFilter}
              onForm={openForm}
              onAttempt={openAttempt}
            />
          )}
          {tab === 'review' && (
            <ReviewPanel
              key={savedRevision}
              data={data}
              athleteFilter={athleteFilter}
              attemptId={attemptId}
              onSelect={openAttempt}
              onForm={openForm}
              onReload={reload}
            />
          )}
          <div className="tr-bottom-note">
            <span>记录 → 复盘 → 练习 → 复测</span>
            <small>
              近期视图显示最多 {data.limits.attempts} 次攀爬与 {data.limits.sessions}{' '}
              次训练课，历史数据保存在档案中。
            </small>
          </div>
          {profile && (
            <AthleteProfile
              athlete={profile}
              data={data}
              onClose={() => setProfileId('')}
              onForm={openForm}
              onReload={reload}
            />
          )}
          {form && (
            <TrainingForm
              state={form}
              workspace={data}
              onClose={() => setForm(null)}
              onSaved={async (id) => {
                await reload();
                setSavedRevision((value) => value + 1);
                setForm(null);
                if (id) openAttempt(id);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
