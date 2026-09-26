'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Film,
  Flag,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { apiBaseUrl, apiRequest } from '../../lib/api';
import { Empty, Pill } from './training-ui';
import {
  outcomes,
  timingSources,
  type Attempt,
  type FormState,
  type Workspace,
} from './training-types';
import { dateLabel, secondsLabel } from './training-utils';
import { uploadTrainingVideo } from './training-upload';
interface Props {
  data: Workspace;
  athleteFilter: string;
  attemptId: string;
  onSelect: (id: string) => void;
  onForm: (state: FormState) => void;
  onReload: () => Promise<void>;
}
const analysisLabels: Record<string, string> = {
  QUEUED: '等待分析',
  RUNNING: '分析中',
  READY: '待教练复核',
  FAILED: '分析未完成',
};
export function ReviewPanel(props: Props) {
  const rows = props.data.attempts.filter(
    (a) => !props.athleteFilter || a.athleteId === props.athleteFilter,
  );
  if (props.attemptId) return <ReviewDetail key={props.attemptId} {...props} />;
  return (
    <section className="tr-panel">
      <div className="tr-section-heading">
        <div>
          <h3>每一次攀爬，都有值得回看的细节</h3>
          <p>先记录尝试，再上传视频。教练确认的建议可以直接转为训练任务。</p>
        </div>
        <button
          className="tr-button"
          onClick={() => props.onForm({ kind: 'attempt', athleteId: props.athleteFilter })}
        >
          <Plus size={16} />
          记录攀爬
        </button>
      </div>
      {!rows.length ? (
        <Empty
          title="留下你的第一段攀爬记录"
          text="支持 MP4、MOV 和 WebM；完整保留起步、脚部与终点画面，便于逐段复盘。"
          action={
            <button
              className="tr-button secondary"
              onClick={() => props.onForm({ kind: 'attempt', athleteId: props.athleteFilter })}
            >
              <Film size={16} />
              记录一次攀爬
            </button>
          }
        />
      ) : (
        <div className="tr-attempt-grid">
          {rows.map((a) => {
            const athlete = props.data.athletes.find((v) => v.id === a.athleteId);
            const course = props.data.courses.find((v) => v.id === a.courseId);
            const analysis = a.analyses[0];
            return (
              <button className="tr-attempt-card" key={a.id} onClick={() => props.onSelect(a.id)}>
                <div className={`tr-attempt-cover ${course?.kind === 'BIRD' ? 'is-bird' : ''}`}>
                  <RouteMotif />
                  <span className="tr-cover-top">
                    <Pill>{course?.name ?? '线路'}</Pill>
                    <span>{a.lane} 道</span>
                  </span>
                  <span className="tr-play-disc">
                    {a.video ? <Play size={23} fill="currentColor" /> : <Upload size={23} />}
                  </span>
                  <span className="tr-cover-bottom">
                    {a.video ? `${(a.video.durationMs / 1000).toFixed(0)}s 视频` : '待上传视频'}
                    <span>{a.type === 'FULL' ? '全程' : '分段'}</span>
                  </span>
                </div>
                <div className="tr-attempt-card-body">
                  <div>
                    <h4>{athlete?.name}</h4>
                    <strong>
                      {a.timeMs == null ? '—' : secondsLabel(a.timeMs)}
                      <small>{a.timeMs == null ? '' : ' s'}</small>
                    </strong>
                  </div>
                  <p>
                    {dateLabel(a.attemptedAt)} · {course?.version}
                  </p>
                  <footer>
                    <Pill
                      tone={a.outcome === 'SUCCESS' ? 'green' : a.outcome === 'FALL' ? 'amber' : ''}
                    >
                      {outcomes[a.outcome]}
                    </Pill>
                    <span>
                      {analysis
                        ? analysis.reviews[0]?.decision === 'APPROVED'
                          ? '教练已确认'
                          : analysisLabels[analysis.status]
                        : '开始复盘'}{' '}
                      <ChevronRight size={13} />
                    </span>
                  </footer>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
function RouteMotif() {
  return (
    <svg className="tr-route-motif" viewBox="0 0 280 200" aria-hidden="true">
      <path
        d="M86 185 126 159 106 130 160 100 137 71 182 35 162 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="4 7"
      />
      {[
        [86, 185],
        [126, 159],
        [106, 130],
        [160, 100],
        [137, 71],
        [182, 35],
        [162, 10],
      ].map(([x, y], i) => (
        <rect
          key={i}
          x={x - 5}
          y={y - 5}
          width="10"
          height="10"
          rx="3"
          transform={`rotate(25 ${x} ${y})`}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
function ReviewDetail({ data, attemptId, onSelect, onForm, onReload }: Props) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [analysisId, setAnalysisId] = useState('');
  const [compareId, setCompareId] = useState('');
  const [marker, setMarker] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [model, setModel] = useState(data.ai.model);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const uploadAbort = useRef<AbortController | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const compareVideo = useRef<HTMLVideoElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const reload = useCallback(async () => {
    const row = await apiRequest<Attempt>(`/training/attempts/${attemptId}`);
    if (mounted.current) setAttempt(row);
  }, [attemptId]);
  useEffect(() => {
    mounted.current = true;
    void reload().catch((e: Error) => setError(e.message));
    return () => {
      mounted.current = false;
      uploadAbort.current?.abort();
    };
  }, [reload]);
  const pending = attempt?.analyses.some((a) => ['QUEUED', 'RUNNING'].includes(a.status));
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(
      () => void reload().catch((e: Error) => setError(e.message)),
      4000,
    );
    return () => clearInterval(interval);
  }, [pending, reload]);
  async function perform(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    try {
      await fn();
      await reload();
      await onReload();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy('');
    }
  }
  function seek(seconds: number) {
    if (video.current) {
      video.current.currentTime = seconds;
      video.current.pause();
      setCurrentTime(seconds);
    }
  }
  async function uploadVideo(file?: File) {
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) {
      setError('视频不能超过 200 MB');
      return;
    }
    setNotice('');
    setUploadPercent(0);
    const controller = new AbortController();
    uploadAbort.current = controller;
    await perform('正在上传视频…', async () => {
      await uploadTrainingVideo(
        attemptId,
        file,
        (percent) => {
          if (mounted.current) {
            setUploadPercent(percent);
            setBusy(
              percent === 100 ? '视频已上传，正在转换为可播放格式…' : `正在上传视频 ${percent}%…`,
            );
          }
        },
        controller.signal,
      );
      if (mounted.current) setNotice('视频上传成功，可以选择模型开始分析。');
    });
    if (mounted.current) {
      setUploadPercent(null);
      if (upload.current) upload.current.value = '';
    }
    uploadAbort.current = null;
  }

  async function analyze(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    setAnalysisId('');
    await perform('正在提交分析…', () =>
      apiRequest(`/training/attempts/${attemptId}/analyses`, {
        method: 'POST',
        body: JSON.stringify({
          focus: values.get('focus'),
          startSeconds: Number(values.get('startSeconds') || 0),
          ...(values.get('endSeconds') ? { endSeconds: Number(values.get('endSeconds')) } : {}),
          processingConsent: true,
          model,
          targetDescription: values.get('targetDescription'),
        }),
      }),
    );
  }
  async function review(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    if (!analysis) return;
    await perform('正在保存教练意见…', () =>
      apiRequest(`/training/analyses/${analysis.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ decision: values.get('decision'), comment: values.get('comment') }),
      }),
    );
  }
  const athlete = data.athletes.find((a) => a.id === attempt?.athleteId);
  const course = data.courses.find((c) => c.id === attempt?.courseId);
  const analysis = attempt?.analyses.find((a) => a.id === analysisId) ?? attempt?.analyses[0];
  const approved = analysis?.reviews[0]?.decision === 'APPROVED';
  const comparisons = data.attempts.filter(
    (a) =>
      a.id !== attemptId &&
      a.video &&
      a.athleteId === attempt?.athleteId &&
      a.courseId === attempt?.courseId &&
      a.type === attempt?.type,
  );
  if (!attempt)
    return (
      <div className="tr-panel">
        <button className="tr-text-button" onClick={() => onSelect('')}>
          <ArrowLeft size={16} />
          返回视频列表
        </button>
        {error ? (
          <p role="alert" className="tr-error">
            {error}
          </p>
        ) : (
          <div className="tr-loading">
            <LoaderCircle className="tr-spin" />
            正在读取攀爬记录…
          </div>
        )}
      </div>
    );
  return (
    <div className="tr-review-stack">
      <div className="tr-section-heading">
        <div>
          <button className="tr-text-button" onClick={() => onSelect('')}>
            <ArrowLeft size={15} />
            全部攀爬记录
          </button>
          <h3>
            {athlete?.name} <span className="tr-heading-divider">/</span> {course?.name} ·{' '}
            {attempt.lane} 道
          </h3>
          <p>
            {new Date(attempt.attemptedAt).toLocaleString('zh-CN')} · {course?.version} ·{' '}
            {attempt.type === 'FULL' ? '全程攀爬' : '分段练习'}
          </p>
        </div>
        <button
          className="tr-button secondary"
          disabled={Boolean(busy)}
          onClick={() => onForm({ kind: 'attempt', attempt })}
        >
          <Pencil size={15} />
          核对记录
        </button>
      </div>
      {error && (
        <p className="tr-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <div className="tr-status-banner" role="status">
          <CheckCircle2 size={16} />
          {notice}
        </div>
      )}
      {uploadPercent !== null && (
        <div className="tr-upload-progress">
          <progress aria-label="视频上传进度" value={uploadPercent} max={100} />
          <span>{uploadPercent < 100 ? `${uploadPercent}%` : '转换处理中'}</span>
          <button className="tr-text-button" onClick={() => uploadAbort.current?.abort()}>
            取消
          </button>
        </div>
      )}
      {busy && (
        <div className="tr-status-banner" role="status">
          <LoaderCircle className="tr-spin" size={16} />
          {busy}
        </div>
      )}
      <div className="tr-review-grid">
        <div className="tr-review-main">
          <div className="tr-video-card">
            {attempt.video ? (
              <>
                <video
                  ref={video}
                  controls
                  playsInline
                  preload="metadata"
                  src={`${apiBaseUrl}/training/attempts/${attemptId}/video`}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onError={() => setError('视频暂时无法播放，请重试或联系管理员检查存储服务。')}
                />
                <div className="tr-video-toolbar">
                  <span>
                    <Film size={14} />
                    {attempt.video.filename}
                  </span>
                  <label>
                    播放速度
                    <select
                      aria-label="播放速度"
                      defaultValue="1"
                      onChange={(e) => {
                        if (video.current) video.current.playbackRate = Number(e.target.value);
                      }}
                    >
                      <option value="0.25">0.25×</option>
                      <option value="0.5">0.5×</option>
                      <option value="1">1×</option>
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <div className="tr-upload-zone">
                <Upload size={34} strokeWidth={1.3} />
                <h3>把这一次攀爬带进来</h3>
                <p>上传完整片段，保留起步、双脚和终点画面。</p>
                <button
                  className="tr-button"
                  disabled={Boolean(busy)}
                  onClick={() => upload.current?.click()}
                >
                  <Plus size={16} />
                  选择视频
                </button>
                <small>MP4 / MOV / WebM · 最长 3 分钟 · 最大 200 MB</small>
                <small>请上传已获得运动员及监护人授权的训练视频。</small>
                <input
                  ref={upload}
                  type="file"
                  accept=".mp4,.mov,.m4v,.webm"
                  hidden
                  onChange={(e) => void uploadVideo(e.target.files?.[0])}
                />
              </div>
            )}
          </div>
          <div className="tr-result-strip">
            <div>
              <small>本次结果</small>
              <strong>{outcomes[attempt.outcome]}</strong>
            </div>
            <div>
              <small>{timingSources[attempt.timingSource]}</small>
              <strong>
                {secondsLabel(attempt.timeMs)}
                <em> 秒</em>
              </strong>
            </div>
            <div>
              <small>画面中的运动员</small>
              <p>{attempt.targetDescription || '请在“核对记录”中描述位置与衣着'}</p>
            </div>
          </div>
          {attempt.notes && (
            <div className="tr-panel tr-small-panel">
              <span className="tr-overline">本次备注</span>
              <p>{attempt.notes}</p>
            </div>
          )}
          {attempt.video && (
            <div className="tr-panel">
              <div className="tr-section-heading">
                <h3>
                  <Flag size={17} />
                  关键时间点
                </h3>
                <span className="tr-caption">当前 {currentTime.toFixed(2)} 秒</span>
              </div>
              <form
                className="tr-marker-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!marker.trim()) return;
                  void perform('正在保存标记…', async () => {
                    await apiRequest(`/training/attempts/${attemptId}/events`, {
                      method: 'PUT',
                      body: JSON.stringify({
                        events: [
                          ...attempt.events,
                          {
                            label: marker.trim(),
                            timeMs: Math.min(
                              attempt.video!.durationMs,
                              Math.round(currentTime * 1000),
                            ),
                          },
                        ],
                      }),
                    });
                    setMarker('');
                  });
                }}
              >
                <input
                  aria-label="时间点名称"
                  value={marker}
                  onChange={(e) => setMarker(e.target.value)}
                  maxLength={80}
                  placeholder="暂停视频，标记起步、换脚或终点"
                />
                <button
                  className="tr-button secondary"
                  disabled={Boolean(busy) || attempt.events.length >= 30}
                >
                  <Plus size={15} />
                  标记此刻
                </button>
              </form>
              <div className="tr-markers">
                {attempt.events.map((event, i) => (
                  <div key={`${event.timeMs}-${i}`}>
                    <button onClick={() => seek(event.timeMs / 1000)}>
                      <Play size={12} />
                      {(event.timeMs / 1000).toFixed(2)}s <b>{event.label}</b>
                    </button>
                    <button
                      aria-label={`移除标记${event.label}`}
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void perform('正在移除标记…', () =>
                          apiRequest(`/training/attempts/${attemptId}/events`, {
                            method: 'PUT',
                            body: JSON.stringify({
                              events: attempt.events.filter((_, j) => i !== j),
                            }),
                          }),
                        )
                      }
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="tr-panel">
            <div className="tr-section-heading">
              <div>
                <h3>与自己的历史表现对照</h3>
                <p>仅列出同一线路版本、同类型的本人视频。</p>
              </div>
            </div>
            <select
              className="tr-full-select"
              aria-label="对照视频"
              value={compareId}
              onChange={(e) => setCompareId(e.target.value)}
            >
              <option value="">
                {comparisons.length ? '选择一次历史尝试' : '还没有可对照的视频'}
              </option>
              {comparisons.map((a) => (
                <option key={a.id} value={a.id}>
                  {dateLabel(a.attemptedAt)} · {outcomes[a.outcome]} · {secondsLabel(a.timeMs)} 秒 ·{' '}
                  {timingSources[a.timingSource]}
                </option>
              ))}
            </select>
            {compareId && (
              <div className="tr-comparison">
                <video
                  ref={compareVideo}
                  key={compareId}
                  controls
                  playsInline
                  preload="metadata"
                  src={`${apiBaseUrl}/training/attempts/${compareId}/video`}
                />
                <div>
                  <button
                    className="tr-button secondary small"
                    onClick={() => {
                      if (video.current && compareVideo.current) {
                        video.current.pause();
                        compareVideo.current.pause();
                        video.current.currentTime = 0;
                        compareVideo.current.currentTime = 0;
                      }
                    }}
                  >
                    都回到片头
                  </button>
                  <button
                    className="tr-button secondary small"
                    onClick={() => {
                      void video.current?.play().catch(() => setError('请先加载本次视频'));
                      void compareVideo.current?.play().catch(() => setError('请先加载对照视频'));
                    }}
                  >
                    从当前位置一起播放
                  </button>
                </div>
                <p className="tr-caption">
                  可分别拖动到同一动作再播放。此处为人工对齐预览，不用于精确同步计时。
                </p>
              </div>
            )}
          </div>
        </div>
        <aside className="tr-review-aside">
          <div className="tr-panel tr-ai-panel">
            <div className="tr-section-heading">
              <div className="tr-ai-title">
                <span>
                  <Sparkles size={18} />
                </span>
                <div>
                  <h3>AI 动作复盘</h3>
                  <small>有画面证据的训练建议</small>
                </div>
              </div>
              <Pill tone={data.ai.enabled ? 'green' : ''}>
                {data.ai.enabled ? '已接入' : '待配置'}
              </Pill>
            </div>
            {!data.ai.enabled && (
              <p className="tr-info">
                <CircleAlert size={16} />
                管理员配置模型服务后即可分析。现在可以播放、标记视频并安排训练任务。
              </p>
            )}
            <form className="tr-analysis-form" onSubmit={analyze}>
              <label>
                分析模型
                <select
                  aria-label="分析模型"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={pending || Boolean(busy)}
                >
                  {data.ai.models.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                画面中的运动员（多人时填写）
                <input
                  name="targetDescription"
                  maxLength={300}
                  defaultValue={attempt.targetDescription}
                  placeholder="例如：左侧赛道、穿黑色上衣的孩子"
                />
              </label>
              <label>
                这次希望重点看什么？
                <textarea
                  name="focus"
                  maxLength={500}
                  rows={2}
                  placeholder="例如：中段换脚为什么容易脱落？"
                />
              </label>
              <div className="tr-analysis-range">
                <label>
                  开始（秒）
                  <input
                    type="number"
                    name="startSeconds"
                    min="0"
                    step="0.01"
                    max={attempt.video ? attempt.video.durationMs / 1000 : 180}
                    placeholder="0"
                  />
                </label>
                <label>
                  结束（秒）
                  <input
                    type="number"
                    name="endSeconds"
                    min="0.01"
                    step="0.01"
                    max={attempt.video ? attempt.video.durationMs / 1000 : 180}
                    placeholder={
                      attempt.video ? (attempt.video.durationMs / 1000).toFixed(2) : '视频结尾'
                    }
                  />
                </label>
              </div>
              <p className="tr-caption">
                全程看节奏，短片段看细节。每次最多抽取 40 张画面，快速动作需结合原片复核。
              </p>
              <p className="tr-caption">
                点击开始分析，将使用已配置的 AI 服务处理所选片段的抽样画面及相关训练记录。
              </p>
              <button
                className="tr-button tr-full-button"
                disabled={!attempt.video || !data.ai.enabled || pending || Boolean(busy)}
              >
                <Sparkles size={16} />
                {pending ? '正在生成复盘…' : attempt.analyses.length ? '重新分析' : '开始分析'}
              </button>
            </form>
          </div>
          {analysis ? (
            <div className="tr-panel tr-report-panel">
              <div className="tr-section-heading">
                <div>
                  <h3>本次复盘</h3>
                  <small className="tr-caption">
                    {data.ai.models.find((m) => m.id === analysis.model)?.label ?? analysis.model}
                  </small>
                </div>
                <Pill tone={approved ? 'green' : 'amber'}>
                  {approved
                    ? '教练已确认'
                    : analysis.reviews[0]?.decision === 'REJECTED'
                      ? '教练未采纳'
                      : analysisLabels[analysis.status]}
                </Pill>
              </div>
              {attempt.analyses.length > 1 && (
                <select
                  aria-label="分析版本"
                  className="tr-full-select"
                  value={analysis.id}
                  onChange={(e) => setAnalysisId(e.target.value)}
                >
                  {attempt.analyses.map((a, i) => (
                    <option key={a.id} value={a.id}>
                      {i === 0 ? '最新分析' : `历史分析 ${attempt.analyses.length - i}`} ·{' '}
                      {a.createdAt ? new Date(a.createdAt).toLocaleString('zh-CN') : ''}
                    </option>
                  ))}
                </select>
              )}
              {['QUEUED', 'RUNNING'].includes(analysis.status) && (
                <div className="tr-ai-wait">
                  <LoaderCircle className="tr-spin" size={28} />
                  <h4>
                    {analysis.status === 'QUEUED' ? '视频已进入分析队列' : '正在核对画面与动作'}
                  </h4>
                  <p>你可以继续记录其他训练，结果会保存在本次攀爬中。</p>
                </div>
              )}
              {analysis.status === 'FAILED' && (
                <p className="tr-error">{analysis.error || '分析未完成，可重新提交。'}</p>
              )}
              {analysis.status === 'READY' && analysis.report && (
                <>
                  <p className="tr-report-summary">{analysis.report.summary}</p>
                  {analysis.report.strengths.length > 0 && (
                    <div className="tr-strengths">
                      <h4>
                        <CheckCircle2 size={16} />
                        继续保持
                      </h4>
                      {analysis.report.strengths.map((s, i) => (
                        <p key={i}>{s}</p>
                      ))}
                    </div>
                  )}
                  {analysis.report.findings.map((finding, i) => (
                    <article className="tr-finding" key={i}>
                      <div>
                        <span className="tr-finding-number">0{i + 1}</span>
                        <h4>{finding.title}</h4>
                      </div>
                      <button
                        className="tr-evidence-link"
                        onClick={() => seek(finding.startSeconds)}
                      >
                        <Play size={13} />
                        {finding.startSeconds.toFixed(1)}–{finding.endSeconds.toFixed(1)}s ·
                        查看证据
                      </button>
                      <p>{finding.observation}</p>
                      <small>
                        证据{finding.evidence === 'CLEAR' ? '较清晰' : '有限'} · 需结合原视频复核
                      </small>
                      {finding.hypothesis && (
                        <div className="tr-hypothesis">
                          <b>可能解释</b>
                          <p>{finding.hypothesis}</p>
                        </div>
                      )}
                      <h5>下次可以怎样练</h5>
                      <p>{finding.suggestion}</p>
                      <h5>复测时观察</h5>
                      <p>{finding.criterion}</p>
                      <button
                        className="tr-button secondary small"
                        disabled={!approved}
                        title={!approved ? '请先由教练确认报告' : ''}
                        onClick={() =>
                          onForm({
                            kind: 'task',
                            athleteId: attempt.athleteId,
                            analysisId: analysis.id,
                            finding,
                          })
                        }
                      >
                        <Plus size={14} />
                        转为训练任务
                      </button>
                    </article>
                  ))}
                  {!analysis.report.findings.length && (
                    <p className="tr-info">
                      没有足够证据提出具体动作问题，可缩短分析区间或补充更清晰的视频。
                    </p>
                  )}
                  <details className="tr-limitations">
                    <summary>分析范围与限制</summary>
                    {analysis.report.limitations.map((l, i) => (
                      <p key={i}>{l}</p>
                    ))}
                  </details>
                  <form className="tr-coach-review" onSubmit={review}>
                    <h4>教练意见</h4>
                    <select name="decision" aria-label="教练复核决定" defaultValue="APPROVED">
                      <option value="APPROVED">确认建议，可用于安排训练</option>
                      <option value="REJECTED">暂不采纳，需补充证据</option>
                    </select>
                    <textarea
                      name="comment"
                      required
                      maxLength={3000}
                      rows={3}
                      placeholder="写下你的判断、修改或练习安排；保留 AI 原稿。"
                    />
                    <button className="tr-button tr-full-button" disabled={Boolean(busy)}>
                      <CheckCircle2 size={16} />
                      保存教练意见
                    </button>
                  </form>
                  {analysis.reviews.map((r) => (
                    <div className="tr-review-comment" key={r.id}>
                      <span>
                        {r.decision === 'APPROVED' ? '已确认' : '未采纳'} ·{' '}
                        {new Date(r.createdAt).toLocaleString('zh-CN')}
                      </span>
                      <p>{r.comment}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : (
            <div className="tr-panel tr-report-placeholder">
              <Sparkles size={26} strokeWidth={1.4} />
              <h3>从观察走向改善</h3>
              <p>报告会区分看见的事实与可能的原因，并为下一次训练提供可验证的方向。</p>
              <div>
                <span>视频证据</span>
                <ChevronRight size={13} />
                <span>教练确认</span>
                <ChevronRight size={13} />
                <span>训练任务</span>
              </div>
            </div>
          )}
          <button
            className="tr-text-button"
            disabled={Boolean(busy)}
            onClick={() => void perform('正在刷新…', async () => undefined)}
          >
            <RefreshCw size={14} />
            刷新复盘状态
          </button>
        </aside>
      </div>
    </div>
  );
}
