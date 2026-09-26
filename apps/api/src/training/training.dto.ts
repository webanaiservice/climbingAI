import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { trainingModelIds } from './training-models';

const text = (max = 2000) => z.string().trim().max(max).default('');
const id = z.string().trim().min(1).max(100);
const date = z.iso.date().refine((value) => !Number.isNaN(Date.parse(value)), '日期不正确');
const historicalDate = date.refine(
  (value) => value <= new Date().toISOString().slice(0, 10),
  '不能晚于今天',
);
const optionalDate = historicalDate.nullable().optional();
export const athleteSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    birthDate: optionalDate,
    trainingSince: optionalDate,
    coachName: text(60),
    groupName: text(60),
    goal: text(500),
    notes: text(),
  })
  .strict()
  .refine(
    (v) => !v.birthDate || !v.trainingSince || v.trainingSince >= v.birthDate,
    '开始训练日期不能早于出生日期',
  );
export const measurementSchema = z
  .object({
    measuredAt: historicalDate,
    heightCm: z.number().min(40).max(250).nullable().optional(),
    weightKg: z.number().min(5).max(250).nullable().optional(),
    armSpanCm: z.number().min(40).max(280).nullable().optional(),
    testName: text(100),
    testResult: text(500),
    notes: text(),
  })
  .strict()
  .refine(
    (v) => v.heightCm || v.weightKg || v.armSpanCm || (v.testName && v.testResult),
    '请填写至少一项测量或完整测试结果',
  );
export const courseSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(['STAR', 'BIRD']),
    version: z.string().trim().min(1).max(60),
    standardReference: text(300),
    notes: text(),
    routeVersionId: id.nullable().optional(),
  })
  .strict();
export const sessionSchema = z
  .object({
    athleteId: id,
    trainedAt: historicalDate,
    focus: z.string().trim().min(1).max(200),
    category: z.enum(['TECHNIQUE', 'SPEED', 'CONDITIONING', 'COMPETITION']),
    durationMinutes: z.number().int().min(1).max(480),
    fatigue: z.number().int().min(1).max(10).nullable().optional(),
    painNote: text(300),
    actualWork: text(),
    notes: text(),
  })
  .strict();
export const eventSchema = z
  .object({ label: z.string().trim().min(1).max(80), timeMs: z.number().int().min(0).max(180000) })
  .strict();
export const attemptSchema = z
  .object({
    athleteId: id,
    sessionId: id.nullable().optional(),
    courseId: id,
    attemptedAt: z.iso
      .datetime({ offset: true })
      .refine((v) => Date.parse(v) <= Date.now() + 60000, '拍摄时间不能晚于现在'),
    lane: z.enum(['A', 'B']),
    type: z.enum(['FULL', 'SEGMENT']),
    outcome: z.enum(['SUCCESS', 'FALL', 'ABORTED', 'UNKNOWN']),
    timeMs: z.number().int().min(100).max(600000).nullable().optional(),
    timingSource: z.enum(['TIMER', 'VIDEO', 'MANUAL', 'NONE']),
    targetDescription: text(300),
    notes: text(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.timeMs != null && (v.outcome !== 'SUCCESS' || v.timingSource === 'NONE'))
      ctx.addIssue({ code: 'custom', message: '仅有效完攀可记录成绩，并需选择计时来源' });
    if (v.timeMs == null && v.timingSource !== 'NONE')
      ctx.addIssue({ code: 'custom', message: '选择计时来源后请填写成绩' });
    if (v.type === 'SEGMENT' && !v.notes)
      ctx.addIssue({ code: 'custom', message: '分段训练请在备注中说明起止位置' });
  });
export const reviewSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    comment: z.string().trim().min(1).max(3000),
  })
  .strict();
export const taskSchema = z
  .object({
    athleteId: id,
    analysisId: id.nullable().optional(),
    title: z.string().trim().min(1).max(120),
    instructions: z.string().trim().min(1).max(3000),
    criterion: z.string().trim().min(1).max(1000),
    dueAt: date.nullable().optional(),
  })
  .strict();
export const taskUpdateSchema = z
  .object({
    status: z.enum(['TODO', 'PRACTICING', 'RETEST', 'IMPROVED', 'NO_CHANGE']),
    retestAttemptId: id.nullable().optional(),
    resultNote: text(2000),
  })
  .strict()
  .refine(
    (v) => !['IMPROVED', 'NO_CHANGE'].includes(v.status) || (v.retestAttemptId && v.resultNote),
    '完成复测需要关联攀爬记录并填写结论',
  );
export const analysisRequestSchema = z
  .object({
    model: z.enum(trainingModelIds).default('gpt-6-astra'),
    targetDescription: text(300),
    focus: text(500),
    startSeconds: z.number().min(0).max(180).default(0),
    endSeconds: z.number().positive().max(180).optional(),
    processingConsent: z.literal(true),
  })
  .strict()
  .refine(
    (v) => v.endSeconds === undefined || v.endSeconds > v.startSeconds,
    '分析结束时间必须晚于开始时间',
  );
export const findingSchema = z
  .object({
    title: z.string().min(1).max(100),
    observation: z.string().min(1).max(1000),
    hypothesis: z.string().max(1000),
    startSeconds: z.number().min(0),
    endSeconds: z.number().min(0),
    evidence: z.enum(['CLEAR', 'LIMITED']),
    suggestion: z.string().max(1500),
    criterion: z.string().max(600),
  })
  .strict()
  .refine((v) => v.endSeconds >= v.startSeconds, '证据时间区间错误');
export const reportSchema = z
  .object({
    summary: z.string().min(1).max(2000),
    strengths: z.array(z.string().max(500)).max(4),
    limitations: z.array(z.string().max(500)).max(8),
    findings: z.array(findingSchema).max(3),
  })
  .strict();
export type TrainingReport = z.infer<typeof reportSchema>;
export function parseTraining<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(result.error.issues[0]?.message ?? '输入不正确');
  return result.data;
}
export const eventsSchema = z.object({ events: z.array(eventSchema).max(30) }).strict();
