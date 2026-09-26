import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { z } from 'zod';
import { trainingModels } from './training-models';
import { Prisma } from '@prisma/client';
import type { CurrentSession } from '../auth/session.service';
import { PrismaService } from '../database/prisma.service';
import { AccessControlService, Capability } from '../security/access-control.service';
import { AuditService } from '../common/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { RateLimitService } from '../security/rate-limit.service';
import {
  analysisRequestSchema,
  athleteSchema,
  attemptSchema,
  courseSchema,
  measurementSchema,
  reviewSchema,
  sessionSchema,
  taskSchema,
  taskUpdateSchema,
  type eventSchema,
} from './training.dto';

@Injectable()
export class TrainingService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: AccessControlService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly rateLimit: RateLimitService,
  ) {}

  scope(session: CurrentSession, write = false) {
    this.access.assert(session, write ? Capability.TRAINING_WRITE : Capability.TRAINING_READ);
    return session.organization.id;
  }
  async athlete(session: CurrentSession, id: string, active = false) {
    const athlete = await this.db.trainingAthlete.findFirst({
      where: { id, organizationId: this.scope(session), ...(active ? { archived: false } : {}) },
    });
    if (!athlete) throw new NotFoundException('运动员不存在或已归档');
    return athlete;
  }
  async attempt(session: CurrentSession, id: string) {
    const row = await this.db.trainingAttempt.findFirst({
      where: { id, organizationId: this.scope(session) },
      include: {
        video: true,
        course: true,
        athlete: true,
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { reviews: { orderBy: { createdAt: 'desc' } } },
        },
      },
    });
    if (!row) throw new NotFoundException('攀爬记录不存在');
    return row;
  }
  async workspace(session: CurrentSession) {
    const organizationId = this.scope(session);
    const [athletes, courses, sessions, attempts, tasks, count] = await Promise.all([
      this.db.trainingAthlete.findMany({
        where: { organizationId },
        orderBy: [{ archived: 'asc' }, { createdAt: 'desc' }],
        include: {
          measurements: { orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }], take: 30 },
        },
        take: 500,
      }),
      this.db.trainingCourse.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } }),
      this.db.trainingSession.findMany({
        where: { organizationId },
        orderBy: { trainedAt: 'desc' },
        take: 200,
      }),
      this.db.trainingAttempt.findMany({
        where: { organizationId },
        orderBy: [{ attemptedAt: 'desc' }, { createdAt: 'desc' }],
        take: 400,
        include: {
          video: { select: { id: true, filename: true, durationMs: true } },
          analyses: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              reviews: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
          },
        },
      }),
      this.db.trainingTask.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 400,
      }),
      this.db.trainingAttempt.count({ where: { organizationId } }),
    ]);
    return {
      athletes,
      courses,
      sessions,
      attempts,
      tasks,
      totalAttempts: count,
      ai: {
        enabled: Boolean(this.config.values.DEROUTER_API_KEY),
        model: this.config.values.TRAINING_AI_MODEL,
        models: trainingModels,
      },
      limits: { attempts: 400, sessions: 200 },
    };
  }
  async saveAthlete(session: CurrentSession, input: z.infer<typeof athleteSchema>, id?: string) {
    const organizationId = this.scope(session, true);
    if (id) await this.athlete(session, id);
    const data = {
      ...input,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      trainingSince: input.trainingSince ? new Date(input.trainingSince) : null,
    };
    return this.db.$transaction(async (tx) => {
      const row = id
        ? await tx.trainingAthlete.update({
            where: { organizationId_id: { organizationId, id } },
            data,
          })
        : await tx.trainingAthlete.create({ data: { ...data, organizationId } });
      await this.audit.record(
        {
          organizationId,
          actorAccountId: session.account.id,
          type: 'training.athlete.saved',
          outcome: 'SUCCESS',
          metadata: { athleteId: row.id },
        },
        tx,
      );
      return row;
    });
  }
  async archiveAthlete(session: CurrentSession, id: string, archived: boolean) {
    const organizationId = this.scope(session, true);
    await this.athlete(session, id);
    return this.db.trainingAthlete.update({
      where: { organizationId_id: { organizationId, id } },
      data: { archived },
    });
  }
  async addMeasurement(
    session: CurrentSession,
    id: string,
    input: z.infer<typeof measurementSchema>,
  ) {
    const organizationId = this.scope(session, true);
    const athlete = await this.athlete(session, id, true);
    if (athlete.birthDate && new Date(input.measuredAt) < athlete.birthDate)
      throw new BadRequestException('测量时间不能早于出生日期');
    return this.db.trainingMeasurement.create({
      data: { ...input, measuredAt: new Date(input.measuredAt), organizationId, athleteId: id },
    });
  }
  async createCourse(session: CurrentSession, input: z.infer<typeof courseSchema>) {
    const organizationId = this.scope(session, true);
    if (
      input.routeVersionId &&
      !(await this.db.routeVersion.findFirst({
        where: { id: input.routeVersionId, organizationId },
      }))
    )
      throw new NotFoundException('关联线路版本不存在');
    return this.db.trainingCourse.create({ data: { ...input, organizationId } });
  }
  async createSession(session: CurrentSession, input: z.infer<typeof sessionSchema>) {
    const organizationId = this.scope(session, true);
    await this.athlete(session, input.athleteId, true);
    return this.db.trainingSession.create({
      data: { ...input, trainedAt: new Date(input.trainedAt), organizationId },
    });
  }
  async saveAttempt(session: CurrentSession, input: z.infer<typeof attemptSchema>, id?: string) {
    const organizationId = this.scope(session, true);
    await this.athlete(session, input.athleteId, true);
    if (
      !(await this.db.trainingCourse.findFirst({ where: { id: input.courseId, organizationId } }))
    )
      throw new NotFoundException('线路版本不存在');
    if (
      input.sessionId &&
      !(await this.db.trainingSession.findFirst({
        where: { id: input.sessionId, athleteId: input.athleteId, organizationId },
      }))
    )
      throw new BadRequestException('训练课与运动员不匹配');
    if (id) {
      const current = await this.attempt(session, id);
      if (current.athleteId !== input.athleteId || current.courseId !== input.courseId)
        throw new BadRequestException('已有记录不能更换运动员或线路，请新建尝试');
    }
    const data = {
      ...input,
      timeMs: input.timeMs ?? null,
      sessionId: input.sessionId ?? null,
      attemptedAt: new Date(input.attemptedAt),
    };
    return id
      ? this.db.trainingAttempt.update({
          where: { organizationId_id: { organizationId, id } },
          data,
        })
      : this.db.trainingAttempt.create({ data: { ...data, organizationId } });
  }
  async saveEvents(session: CurrentSession, id: string, events: z.infer<typeof eventSchema>[]) {
    const organizationId = this.scope(session, true);
    const attempt = await this.attempt(session, id);
    if (!attempt.video) throw new BadRequestException('请先上传视频');
    if (events.some((e) => e.timeMs > attempt.video!.durationMs))
      throw new BadRequestException('标记时间超出视频范围');
    return this.db.trainingAttempt.update({
      where: { organizationId_id: { organizationId, id } },
      data: { events: [...events].sort((a, b) => a.timeMs - b.timeMs) },
    });
  }
  async enqueueAnalysis(
    session: CurrentSession,
    id: string,
    input: z.infer<typeof analysisRequestSchema>,
  ) {
    const organizationId = this.scope(session, true);
    if (!this.config.values.DEROUTER_API_KEY)
      throw new ServiceUnavailableException(
        'AI 分析尚未配置，请管理员设置服务端模型密钥；可继续人工复盘',
      );
    const attempt = await this.attempt(session, id);
    if (!attempt.video) throw new BadRequestException('请先上传视频');
    const targetDescription =
      input.targetDescription ||
      attempt.targetDescription ||
      '画面中唯一正在攀爬的运动员（如同时有多人则目标不明确）';
    const endSeconds = input.endSeconds ?? attempt.video.durationMs / 1000;
    if (endSeconds > attempt.video.durationMs / 1000 + 0.05 || input.startSeconds >= endSeconds)
      throw new BadRequestException('分析区间超出视频范围');
    await this.rateLimit.consume('training.analysis', organizationId, 30, 60);
    const measurement = await this.db.trainingMeasurement.findFirst({
      where: {
        organizationId,
        athleteId: attempt.athleteId,
        measuredAt: { lte: attempt.attemptedAt },
      },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
    });
    const recent = await this.db.trainingAttempt.findMany({
      where: {
        organizationId,
        athleteId: attempt.athleteId,
        courseId: attempt.courseId,
        type: attempt.type,
        attemptedAt: { lt: attempt.attemptedAt },
      },
      orderBy: { attemptedAt: 'desc' },
      take: 5,
      select: { attemptedAt: true, outcome: true, timeMs: true, timingSource: true, notes: true },
    });
    const trainingContext = attempt.sessionId
      ? await this.db.trainingSession.findFirst({
          where: { id: attempt.sessionId, organizationId, athleteId: attempt.athleteId },
          select: {
            trainedAt: true,
            focus: true,
            category: true,
            durationMinutes: true,
            fatigue: true,
            painNote: true,
            actualWork: true,
            notes: true,
          },
        })
      : null;
    const fitnessTests = await this.db.trainingMeasurement.findMany({
      where: {
        organizationId,
        athleteId: attempt.athleteId,
        measuredAt: { lte: attempt.attemptedAt },
        NOT: { testName: '' },
      },
      orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
      take: 5,
      select: { measuredAt: true, testName: true, testResult: true },
    });
    const snapshot = {
      promptVersion: 'speed-review-v1',
      trainingContext,
      fitnessTests,
      course: {
        name: attempt.course.name,
        kind: attempt.course.kind,
        version: attempt.course.version,
        standardReference: attempt.course.standardReference,
        notes: attempt.course.notes,
      },
      athlete: {
        ageMonths: attempt.athlete.birthDate
          ? Math.floor(
              (attempt.attemptedAt.getTime() - attempt.athlete.birthDate.getTime()) / 2629800000,
            )
          : null,
        trainingMonths: attempt.athlete.trainingSince
          ? Math.max(
              0,
              Math.floor(
                (attempt.attemptedAt.getTime() - attempt.athlete.trainingSince.getTime()) /
                  2629800000,
              ),
            )
          : null,
        measurement: measurement
          ? {
              measuredAt: measurement.measuredAt,
              heightCm: measurement.heightCm,
              weightKg: measurement.weightKg,
              armSpanCm: measurement.armSpanCm,
            }
          : null,
      },
      attempt: {
        attemptedAt: attempt.attemptedAt,
        lane: attempt.lane,
        type: attempt.type,
        outcome: attempt.outcome,
        timeMs: attempt.timeMs,
        timingSource: attempt.timingSource,
        notes: attempt.notes,
        events: attempt.events,
        targetDescription,
      },
      focus: input.focus,
      startSeconds: input.startSeconds,
      endSeconds,
      recent,
      sampling: '最多40张连续等间隔画面；快速动作可能遗漏；仅对可见证据作判断',
    };
    return this.db.$transaction(async (tx) => {
      await lockTrainingAnalysis(tx, id);
      if (
        await tx.trainingAnalysis.findFirst({
          where: { attemptId: id, organizationId, status: { in: ['QUEUED', 'RUNNING'] } },
        })
      )
        throw new ConflictException('这段视频已有分析任务，请等待完成');
      const row = await tx.trainingAnalysis.create({
        data: {
          organizationId,
          attemptId: id,
          videoId: attempt.video!.id,
          model: input.model,
          requestedBy: session.account.id,
          inputSnapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
        },
      });
      await this.audit.record(
        {
          organizationId,
          actorAccountId: session.account.id,
          type: 'training.analysis.requested',
          outcome: 'SUCCESS',
          metadata: { analysisId: row.id, processingConsent: true },
        },
        tx,
      );
      return row;
    });
  }
  async review(session: CurrentSession, id: string, input: z.infer<typeof reviewSchema>) {
    this.access.assert(session, Capability.TRAINING_REVIEW);
    const organizationId = this.scope(session, true);
    const analysis = await this.db.trainingAnalysis.findFirst({
      where: { id, organizationId, status: 'READY' },
    });
    if (!analysis) throw new NotFoundException('没有可复核的分析报告');
    return this.db.trainingReview.create({
      data: { ...input, organizationId, analysisId: id, reviewedBy: session.account.id },
    });
  }
  async createTask(session: CurrentSession, input: z.infer<typeof taskSchema>) {
    this.access.assert(session, Capability.TRAINING_REVIEW);
    const organizationId = this.scope(session, true);
    await this.athlete(session, input.athleteId, true);
    if (input.analysisId) {
      const analysis = await this.db.trainingAnalysis.findFirst({
        where: { id: input.analysisId, organizationId, attempt: { athleteId: input.athleteId } },
        include: { reviews: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      if (!analysis || analysis.reviews[0]?.decision !== 'APPROVED')
        throw new BadRequestException('请先由教练确认该运动员的分析报告');
    }
    return this.db.trainingTask.create({
      data: {
        ...input,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        organizationId,
        createdBy: session.account.id,
      },
    });
  }
  async updateTask(session: CurrentSession, id: string, input: z.infer<typeof taskUpdateSchema>) {
    const organizationId = this.scope(session, true);
    const task = await this.db.trainingTask.findFirst({ where: { id, organizationId } });
    if (!task) throw new NotFoundException('训练任务不存在');
    if (
      input.retestAttemptId &&
      !(await this.db.trainingAttempt.findFirst({
        where: { id: input.retestAttemptId, organizationId, athleteId: task.athleteId },
      }))
    )
      throw new BadRequestException('复测记录与运动员不匹配');
    return this.db.trainingTask.update({
      where: { id: task.id },
      data: { ...input, retestAttemptId: input.retestAttemptId ?? null },
    });
  }
}

// PostgreSQL advisory locks return void. Select a scalar so Prisma can deserialize the result.
export async function lockTrainingAnalysis(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw<{ locked: number }[]>`
    SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`training-analysis:${id}`}, 0))
  `;
}
