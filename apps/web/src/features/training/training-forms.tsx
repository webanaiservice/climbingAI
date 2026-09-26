'use client';
import { useState, type FormEvent } from 'react';
import { apiRequest } from '../../lib/api';
import { TrainingDialog, Field } from './training-ui';
import {
  categories,
  outcomes,
  timingSources,
  taskStatuses,
  type FormState,
  type Workspace,
} from './training-types';
import { localDate } from './training-utils';
const titles = {
  athlete: '运动员档案',
  measurement: '记录成长与体能',
  course: '建立线路版本',
  session: '记录一次训练',
  attempt: '记录一次攀爬',
  task: '安排训练任务',
  retest: '更新任务与复测',
};
const get = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
const optionalNumber = (data: FormData, key: string) =>
  get(data, key) ? Number(get(data, key)) : null;
export function TrainingForm({
  state,
  workspace,
  onClose,
  onSaved,
}: {
  state: FormState;
  workspace: Workspace;
  onClose: () => void;
  onSaved: (attemptId?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [athleteId, setAthleteId] = useState(
    state.attempt?.athleteId ??
      state.task?.athleteId ??
      state.athleteId ??
      workspace.athletes.find((a) => !a.archived)?.id ??
      '',
  );
  const [outcome, setOutcome] = useState(state.attempt?.outcome ?? 'UNKNOWN');
  const [taskStatus, setTaskStatus] = useState(state.task?.status ?? 'TODO');
  const [courseKind, setCourseKind] = useState(state.courseKind ?? 'STAR');
  const athleteOptions = workspace.athletes.filter((a) => !a.archived || a.id === athleteId);
  const activeAthlete = workspace.athletes.find((a) => a.id === athleteId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    let path = '';
    let method = 'POST';
    let body: Record<string, unknown> = {};
    try {
      switch (state.kind) {
        case 'athlete':
          path = `/athletes${state.athlete ? `/${state.athlete.id}` : ''}`;
          method = state.athlete ? 'PUT' : 'POST';
          body = {
            name: get(data, 'name'),
            birthDate: get(data, 'birthDate') || null,
            trainingSince: get(data, 'trainingSince') || null,
            coachName: get(data, 'coachName'),
            groupName: get(data, 'groupName'),
            goal: get(data, 'goal'),
            notes: get(data, 'notes'),
          };
          break;
        case 'measurement':
          path = `/athletes/${athleteId}/measurements`;
          body = {
            measuredAt: get(data, 'measuredAt'),
            heightCm: optionalNumber(data, 'heightCm'),
            weightKg: optionalNumber(data, 'weightKg'),
            armSpanCm: optionalNumber(data, 'armSpanCm'),
            testName: get(data, 'testName'),
            testResult: get(data, 'testResult'),
            notes: get(data, 'notes'),
          };
          break;
        case 'course':
          path = '/courses';
          body = {
            name: get(data, 'name'),
            kind: courseKind,
            version: get(data, 'version'),
            standardReference: get(data, 'standardReference'),
            notes: get(data, 'notes'),
          };
          break;
        case 'session':
          path = '/sessions';
          body = {
            athleteId,
            trainedAt: get(data, 'trainedAt'),
            focus: get(data, 'focus'),
            category: get(data, 'category'),
            durationMinutes: Number(get(data, 'durationMinutes')),
            fatigue: optionalNumber(data, 'fatigue'),
            painNote: get(data, 'painNote'),
            actualWork: get(data, 'actualWork'),
            notes: get(data, 'notes'),
          };
          break;
        case 'attempt':
          path = `/attempts${state.attempt ? `/${state.attempt.id}` : ''}`;
          method = state.attempt ? 'PUT' : 'POST';
          body = {
            athleteId,
            courseId: get(data, 'courseId'),
            sessionId: get(data, 'sessionId') || null,
            attemptedAt: new Date(get(data, 'attemptedAt')).toISOString(),
            lane: get(data, 'lane'),
            type: get(data, 'type'),
            outcome,
            timeMs:
              outcome === 'SUCCESS' && get(data, 'seconds')
                ? Math.round(Number(get(data, 'seconds')) * 1000)
                : null,
            timingSource:
              outcome === 'SUCCESS' && get(data, 'seconds') ? get(data, 'timingSource') : 'NONE',
            targetDescription: get(data, 'targetDescription'),
            notes: get(data, 'notes'),
          };
          break;
        case 'task':
          path = '/tasks';
          body = {
            athleteId,
            analysisId: state.analysisId ?? null,
            title: get(data, 'title'),
            instructions: get(data, 'instructions'),
            criterion: get(data, 'criterion'),
            dueAt: get(data, 'dueAt') || null,
          };
          break;
        case 'retest':
          path = `/tasks/${state.task!.id}`;
          method = 'PATCH';
          body = {
            status: taskStatus,
            retestAttemptId: get(data, 'retestAttemptId') || null,
            resultNote: get(data, 'resultNote'),
          };
          break;
      }
      const saved = await apiRequest<{ id: string }>(`/training${path}`, {
        method,
        body: JSON.stringify(body),
      });
      await onSaved(state.kind === 'attempt' ? saved.id : undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  }
  const notes = (
    <Field label="教练备注" wide>
      <textarea
        name="notes"
        rows={3}
        maxLength={2000}
        defaultValue={state.athlete?.notes ?? state.attempt?.notes}
        placeholder={
          state.kind === 'attempt'
            ? '分段训练请写明起止位置；可补充本次目标和感受'
            : '记录需要在下一次训练中关注的内容'
        }
      />
    </Field>
  );
  return (
    <TrainingDialog
      title={titles[state.kind]}
      subtitle={
        state.kind === 'course'
          ? '安装点位或加点发生变化时，建立新的版本，保留历史可比性。'
          : '真实记录每一步，留给下一次训练一个清晰的起点。'
      }
      onClose={onClose}
      busy={busy}
    >
      <form className="tr-form" onSubmit={submit}>
        <fieldset disabled={busy} className="tr-form-grid">
          {['measurement', 'session', 'attempt', 'task'].includes(state.kind) &&
            !athleteOptions.length && (
              <p className="tr-form-note is-wide">请先在“运动员档案”中新建运动员。</p>
            )}
          {state.kind === 'attempt' && !workspace.courses.length && (
            <p className="tr-form-note is-wide">
              请先在“运动员档案”的“固定速度线路”中建立星星道或飞鸟道版本。
            </p>
          )}
          {['measurement', 'session', 'attempt', 'task'].includes(state.kind) && (
            <Field label="运动员">
              <select
                name="athleteId"
                required
                value={athleteId}
                disabled={Boolean(state.attempt || state.analysisId)}
                onChange={(e) => setAthleteId(e.target.value)}
              >
                <option value="" disabled>
                  选择运动员
                </option>
                {athleteOptions.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {state.kind === 'athlete' && (
            <>
              <Field label="姓名 / 训练昵称 *">
                <input
                  name="name"
                  required
                  maxLength={60}
                  defaultValue={state.athlete?.name}
                  placeholder="运动员姓名"
                  autoFocus
                />
              </Field>
              <Field label="出生日期">
                <input
                  type="date"
                  name="birthDate"
                  max={localDate()}
                  defaultValue={state.athlete?.birthDate?.slice(0, 10)}
                />
              </Field>
              <Field label="负责教练">
                <input
                  name="coachName"
                  maxLength={60}
                  defaultValue={state.athlete?.coachName}
                  placeholder="教练姓名"
                />
              </Field>
              <Field label="训练组别">
                <input
                  name="groupName"
                  maxLength={60}
                  defaultValue={state.athlete?.groupName}
                  placeholder="例如：U9 提升组"
                />
              </Field>
              <Field label="开始攀岩训练日期">
                <input
                  type="date"
                  name="trainingSince"
                  max={localDate()}
                  defaultValue={state.athlete?.trainingSince?.slice(0, 10)}
                />
              </Field>
              <Field label="当前训练目标" wide>
                <input
                  name="goal"
                  maxLength={500}
                  defaultValue={state.athlete?.goal}
                  placeholder="例如：稳定完成星星道，减少中段调整"
                />
              </Field>
              {notes}
            </>
          )}
          {state.kind === 'measurement' && (
            <>
              <Field label="测量日期 *">
                <input
                  type="date"
                  name="measuredAt"
                  defaultValue={localDate()}
                  max={localDate()}
                  required
                />
              </Field>
              <Field label="身高（cm）">
                <input name="heightCm" type="number" min="40" max="250" step="0.1" />
              </Field>
              <Field label="体重（kg）">
                <input name="weightKg" type="number" min="5" max="250" step="0.1" />
              </Field>
              <Field label="臂展（cm）">
                <input name="armSpanCm" type="number" min="40" max="280" step="0.1" />
              </Field>
              <Field label="体能测试项目与方法">
                <input name="testName" maxLength={100} placeholder="例如：立定跳远，取 3 次最佳" />
              </Field>
              <Field label="测试结果与单位" wide>
                <input
                  name="testResult"
                  maxLength={500}
                  placeholder="例如：145 cm；请保持每次测试方法一致"
                />
              </Field>
              {notes}
            </>
          )}
          {state.kind === 'course' && (
            <>
              <Field label="线路类型">
                <select
                  value={courseKind}
                  onChange={(e) => setCourseKind(e.target.value as 'STAR' | 'BIRD')}
                >
                  <option value="STAR">星星道</option>
                  <option value="BIRD">飞鸟道</option>
                </select>
              </Field>
              <Field label="馆内线路名称 *">
                <input
                  name="name"
                  key={courseKind}
                  defaultValue={courseKind === 'STAR' ? '星星道' : '飞鸟道'}
                  required
                  maxLength={80}
                />
              </Field>
              <Field label="安装版本 *">
                <input
                  name="version"
                  required
                  placeholder="例如：2026.09 馆内安装版"
                  maxLength={60}
                />
              </Field>
              <Field label="标准来源 / 版本">
                <input
                  name="standardReference"
                  maxLength={300}
                  placeholder="按实际安装资料填写，可后续建立新版本"
                />
              </Field>
              {notes}
            </>
          )}
          {state.kind === 'session' && (
            <>
              <Field label="训练日期 *">
                <input
                  type="date"
                  name="trainedAt"
                  required
                  defaultValue={localDate()}
                  max={localDate()}
                />
              </Field>
              <Field label="训练类型">
                <select name="category">
                  {Object.entries(categories).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="训练时长（分钟）*">
                <input
                  type="number"
                  name="durationMinutes"
                  required
                  min="1"
                  max="480"
                  placeholder="例如：120"
                />
              </Field>
              <Field label="本次目标 *" wide>
                <input
                  name="focus"
                  required
                  maxLength={200}
                  placeholder="今天最希望改善的一个动作"
                />
              </Field>
              <Field label="实际训练内容" wide>
                <textarea
                  name="actualWork"
                  rows={3}
                  maxLength={2000}
                  placeholder="项目、组数、次数、间歇与实际完成情况"
                />
              </Field>
              <Field label="主观疲劳（1 轻松—10 极累）">
                <input name="fatigue" type="number" min="1" max="10" />
              </Field>
              <Field label="疼痛 / 不适情况">
                <input
                  name="painNote"
                  maxLength={300}
                  placeholder="未询问可留空；没有不适可填“无”"
                />
              </Field>
              {notes}
            </>
          )}
          {state.kind === 'attempt' && (
            <>
              <Field label="线路与安装版本 *">
                <select
                  name="courseId"
                  defaultValue={state.attempt?.courseId ?? workspace.courses[0]?.id}
                  required
                  disabled={Boolean(state.attempt)}
                >
                  {workspace.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.version}
                    </option>
                  ))}
                </select>
                {state.attempt && (
                  <input type="hidden" name="courseId" value={state.attempt.courseId} />
                )}
              </Field>
              <Field label="攀爬时间 *">
                <input
                  type="datetime-local"
                  name="attemptedAt"
                  required
                  defaultValue={
                    state.attempt
                      ? toLocalDateTime(state.attempt.attemptedAt)
                      : toLocalDateTime(new Date().toISOString())
                  }
                />
              </Field>
              <Field label="关联训练课">
                <select
                  name="sessionId"
                  defaultValue={state.attempt?.sessionId ?? ''}
                  key={athleteId}
                >
                  <option value="">不关联训练课</option>
                  {workspace.sessions
                    .filter((s) => s.athleteId === athleteId)
                    .map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.trainedAt.slice(0, 10)} · {s.focus}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="赛道">
                <select name="lane" defaultValue={state.attempt?.lane ?? 'A'}>
                  <option value="A">A 道</option>
                  <option value="B">B 道</option>
                </select>
              </Field>
              <Field label="尝试类型">
                <select name="type" defaultValue={state.attempt?.type ?? 'FULL'}>
                  <option value="FULL">全程攀爬</option>
                  <option value="SEGMENT">分段练习</option>
                </select>
              </Field>
              <Field label="攀爬结果">
                <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                  {Object.entries(outcomes).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              {outcome === 'SUCCESS' && (
                <>
                  <Field label="成绩（秒，可留空）">
                    <input
                      type="number"
                      name="seconds"
                      min="0.1"
                      max="600"
                      step="0.001"
                      defaultValue={
                        state.attempt?.timeMs != null ? state.attempt.timeMs / 1000 : undefined
                      }
                      placeholder="按计时设备实际读数填写"
                    />
                  </Field>
                  <Field label="计时来源">
                    <select
                      name="timingSource"
                      defaultValue={
                        state.attempt?.timingSource === 'NONE'
                          ? 'TIMER'
                          : (state.attempt?.timingSource ?? 'TIMER')
                      }
                    >
                      {Object.entries(timingSources)
                        .filter(([k]) => k !== 'NONE')
                        .map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                    </select>
                  </Field>
                </>
              )}
              <Field label="视频中运动员的位置与衣着" wide>
                <input
                  name="targetDescription"
                  maxLength={300}
                  defaultValue={state.attempt?.targetDescription}
                  placeholder="例如：画面左侧赛道，黑色上衣、灰色短裤的孩子"
                />
              </Field>
              {notes}
              <p className="tr-form-note is-wide">
                保存后进入复盘页上传视频。成绩、赛道和目标人物均可在分析前核对。
              </p>
            </>
          )}
          {state.kind === 'task' && (
            <>
              <Field label="计划复测日期">
                <input type="date" name="dueAt" />
              </Field>
              <Field label="任务名称 *" wide>
                <input
                  name="title"
                  maxLength={120}
                  required
                  defaultValue={state.finding?.title}
                  placeholder="例如：中段换脚衔接"
                />
              </Field>
              <Field label="练习内容与安排 *" wide>
                <textarea
                  name="instructions"
                  rows={4}
                  required
                  maxLength={3000}
                  defaultValue={state.finding?.suggestion}
                  placeholder="由教练确定练习方式、组次和休息"
                />
              </Field>
              <Field label="怎样算有改善 *" wide>
                <textarea
                  name="criterion"
                  rows={2}
                  required
                  maxLength={1000}
                  defaultValue={state.finding?.criterion}
                  placeholder="例如：同一段连续通过，补救动作减少"
                />
              </Field>
              {state.analysisId && (
                <p className="tr-form-note is-wide">
                  已关联教练确认的复盘报告。保存前可调整 AI 建议。
                </p>
              )}
            </>
          )}
          {state.kind === 'retest' && (
            <>
              <div className="tr-form-note is-wide">
                <strong>{state.task?.title}</strong>
                <p>{state.task?.criterion}</p>
              </div>
              <Field label="任务状态">
                <select value={taskStatus} onChange={(e) => setTaskStatus(e.target.value)}>
                  {Object.entries(taskStatuses).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="关联复测攀爬">
                <select
                  name="retestAttemptId"
                  defaultValue={state.task?.retestAttemptId ?? ''}
                  required={['IMPROVED', 'NO_CHANGE'].includes(taskStatus)}
                >
                  <option value="">选择复测记录</option>
                  {workspace.attempts
                    .filter((a) => a.athleteId === state.task?.athleteId)
                    .map((a) => (
                      <option value={a.id} key={a.id}>
                        {new Date(a.attemptedAt).toLocaleString('zh-CN')} ·{' '}
                        {workspace.courses.find((c) => c.id === a.courseId)?.name} ·{' '}
                        {outcomes[a.outcome]}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="复测结论" wide>
                <textarea
                  name="resultNote"
                  rows={4}
                  maxLength={2000}
                  required={['IMPROVED', 'NO_CHANGE'].includes(taskStatus)}
                  defaultValue={state.task?.resultNote}
                  placeholder="记录与上次相比的变化，以及下一步调整"
                />
              </Field>
            </>
          )}
        </fieldset>
        {activeAthlete?.archived && (
          <p className="tr-error">该运动员已归档，请先恢复档案后新增记录。</p>
        )}
        {error && (
          <p className="tr-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" className="tr-button secondary" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="submit"
            className="tr-button"
            disabled={
              busy ||
              Boolean(
                activeAthlete?.archived && state.kind !== 'athlete' && state.kind !== 'retest',
              )
            }
          >
            {busy ? '正在保存…' : '保存记录'}
          </button>
        </footer>
      </form>
    </TrainingDialog>
  );
}
function toLocalDateTime(value: string) {
  const date = new Date(value);
  return `${localDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
