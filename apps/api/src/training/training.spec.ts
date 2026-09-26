import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import {
  attemptSchema,
  analysisRequestSchema,
  measurementSchema,
  taskUpdateSchema,
  taskSchema,
} from './training.dto';
import { parseTrainingReport, TrainingAnalysisService } from './training-analysis.service';
import { trainingByteRange, TrainingVideoService } from './training-video.service';
import { TrainingService } from './training.service';
import { AccessControlService } from '../security/access-control.service';
import type { PrismaService } from '../database/prisma.service';
import type { CurrentSession } from '../auth/session.service';
import type { AppConfigService } from '../config/app-config.service';
import type { AuditService } from '../common/audit.service';
import type { RateLimitService } from '../security/rate-limit.service';
import type { TrainingStorageService } from './training-storage.service';
import type { ObjectCleanupService } from '../storage/object-cleanup.service';
const attempt = {
  athleteId: 'a',
  courseId: 'c',
  attemptedAt: '2025-12-01T12:00:00Z',
  lane: 'A',
  type: 'FULL',
  outcome: 'SUCCESS',
  timeMs: 12560,
  timingSource: 'TIMER',
};
const report = {
  summary: '可见画面有限',
  strengths: [],
  limitations: ['画面遮挡'],
  findings: [
    {
      title: '换脚',
      observation: '出现一次脚位调整',
      hypothesis: '可能在确认位置',
      startSeconds: 2,
      endSeconds: 3,
      evidence: 'LIMITED',
      suggestion: '由教练复核脚位选择',
      criterion: '观察重复调整是否减少',
    },
  ],
};
const session: CurrentSession = {
  account: { id: 'owner', email: 'test@example.com' },
  membership: { id: 'member', displayName: null },
  organization: { id: 'gym-a', name: 'A' },
  role: 'L1_ADMIN',
  expiresAt: new Date(),
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('training evidence and result validation', () => {
  it('preserves millisecond timer values', () =>
    expect(attemptSchema.parse(attempt).timeMs).toBe(12560));
  it.each(['FALL', 'ABORTED', 'UNKNOWN'])('rejects a %s result with a finish time', (outcome) =>
    expect(attemptSchema.safeParse({ ...attempt, outcome }).success).toBe(false),
  );
  it('requires timing provenance and segment boundaries', () => {
    expect(attemptSchema.safeParse({ ...attempt, timingSource: 'NONE' }).success).toBe(false);
    expect(attemptSchema.safeParse({ ...attempt, type: 'SEGMENT' }).success).toBe(false);
    expect(
      attemptSchema.safeParse({ ...attempt, type: 'SEGMENT', notes: '起步至中段换脚点' }).success,
    ).toBe(true);
  });
  it('rejects empty measurements and unsupported conclusions', () => {
    expect(measurementSchema.safeParse({ measuredAt: '2025-12-01' }).success).toBe(false);
    expect(taskUpdateSchema.safeParse({ status: 'IMPROVED', resultNote: '有改善' }).success).toBe(
      false,
    );
    expect(
      taskUpdateSchema.safeParse({
        status: 'IMPROVED',
        retestAttemptId: 'new',
        resultNote: '连续换脚次数减少',
      }).success,
    ).toBe(true);
  });
  it('requires explicit processing consent and forward time intervals', () => {
    expect(analysisRequestSchema.safeParse({ processingConsent: false }).success).toBe(false);
    expect(
      analysisRequestSchema.safeParse({ processingConsent: true, startSeconds: 4, endSeconds: 3 })
        .success,
    ).toBe(false);
  });
  it('rejects model timestamps outside the requested clip and malformed reports', () => {
    expect(parseTrainingReport(JSON.stringify(report), 1, 5).findings).toHaveLength(1);
    expect(() => parseTrainingReport(JSON.stringify(report), 4, 5)).toThrow();
    expect(() =>
      parseTrainingReport(
        JSON.stringify({
          ...report,
          findings: [{ ...report.findings[0], startSeconds: 3, endSeconds: 2 }],
        }),
        0,
        5,
      ),
    ).toThrow();
    expect(() => parseTrainingReport('模型文字非JSON', 0, 5)).toThrow();
  });
});
describe('authenticated video range handling', () => {
  it('supports browser initial, open ended and suffix ranges', () => {
    expect(trainingByteRange(undefined, 1000)).toBeNull();
    expect(trainingByteRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99, length: 100 });
    expect(trainingByteRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999, length: 100 });
    expect(trainingByteRange('bytes=-80', 1000)).toEqual({ start: 920, end: 999, length: 80 });
  });
  it.each(['bytes=1000-', 'bytes=9-1', 'bytes=-0', 'bytes=0-2,8-9', 'bytes=-', 'bytes=NaN-'])(
    'rejects invalid range %s',
    (range) => expect(() => trainingByteRange(range, 1000)).toThrow(),
  );
});
describe('organization and coach boundaries', () => {
  function service(db: unknown) {
    return new TrainingService(
      db as PrismaService,
      new AccessControlService(),
      {} as AuditService,
      { values: { DEROUTER_API_KEY: 'test-only' } } as AppConfigService,
      {} as RateLimitService,
    );
  }
  it('does not expose another organization attempt', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(
      service({ trainingAttempt: { findFirst } }).attempt(session, 'foreign'),
    ).rejects.toThrow('攀爬记录不存在');
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: 'foreign', organizationId: 'gym-a' });
  });
  it('rejects unrelated training sessions before saving attempts', async () => {
    const create = vi.fn();
    const db = {
      trainingAthlete: { findFirst: vi.fn().mockResolvedValue({ id: 'a' }) },
      trainingCourse: { findFirst: vi.fn().mockResolvedValue({ id: 'c' }) },
      trainingSession: { findFirst: vi.fn().mockResolvedValue(null) },
      trainingAttempt: { create },
    };
    await expect(
      service(db).saveAttempt(
        session,
        attemptSchema.parse({ ...attempt, sessionId: 'foreign-session' }),
      ),
    ).rejects.toThrow('训练课与运动员不匹配');
    expect(create).not.toHaveBeenCalled();
  });
  it('requires the latest coach decision to approve an AI task', async () => {
    const db = {
      trainingAthlete: { findFirst: vi.fn().mockResolvedValue({ id: 'a' }) },
      trainingAnalysis: {
        findFirst: vi.fn().mockResolvedValue({ reviews: [{ decision: 'REJECTED' }] }),
      },
    };
    await expect(
      service(db).createTask(
        session,
        taskSchema.parse({
          athleteId: 'a',
          analysisId: 'analysis',
          title: '练习',
          instructions: '教练指导下进行',
          criterion: '复测观察',
        }),
      ),
    ).rejects.toThrow('请先由教练确认');
  });
  it('cannot close a task using another athlete retest', async () => {
    const db = {
      trainingTask: { findFirst: vi.fn().mockResolvedValue({ id: 't', athleteId: 'a' }) },
      trainingAttempt: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    await expect(
      service(db).updateTask(session, 't', {
        status: 'IMPROVED',
        retestAttemptId: 'foreign-attempt',
        resultNote: '改善',
      }),
    ).rejects.toThrow('复测记录与运动员不匹配');
  });
});
describe('durable AI analysis queue', () => {
  function queue(claim = 1) {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: claim });
    const job = {
      id: 'j',
      model: 'test-model',
      video: { objectKey: 'private-test' },
      inputSnapshot: { startSeconds: 1, endSeconds: 5 },
    };
    const db = { trainingAnalysis: { updateMany, findFirst: vi.fn().mockResolvedValue(job) } };
    const sample = vi.fn().mockResolvedValue([{ seconds: 2, image: 'test-base64' }]);
    const worker = new TrainingAnalysisService(
      db as unknown as PrismaService,
      {
        values: {
          DEROUTER_API_KEY: 'local-test-key',
          DEROUTER_OPENAI_BASE: 'http://localhost/test',
        },
      } as AppConfigService,
      { sample } as unknown as TrainingVideoService,
    );
    return { worker, updateMany, sample };
  }
  it('persists validated reports with frame evidence and does not double claim', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(report) } }] }),
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const { worker, updateMany } = queue();
    await worker.tick();
    const data = updateMany.mock.calls.at(-1)![0].data;
    expect(data.status).toBe('READY');
    expect(data.report.limitations.at(-1)).toContain('1 张');
    const submitted = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(submitted.messages[1].content[1].text).toContain('2.000');
    const other = queue(0);
    await other.worker.tick();
    expect(other.sample).not.toHaveBeenCalled();
  });
  it('keeps failure explicit when the provider fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));
    const { worker, updateMany } = queue();
    await worker.tick();
    expect(updateMany.mock.calls.at(-1)![0].data.status).toBe('FAILED');
  });
});
// Opt-in local media check; does not send any frames to a model provider.
it.skipIf(!process.env.TRAINING_MEDIA_TEST)(
  'samples real media with original clip timestamps',
  async () => {
    const content = await readFile(process.env.TRAINING_MEDIA_TEST!);
    const service = new TrainingVideoService(
      {} as TrainingService,
      {} as PrismaService,
      { get: async () => Readable.from(content) } as unknown as TrainingStorageService,
      {} as ObjectCleanupService,
      {
        values: { TRAINING_FFMPEG_PATH: process.env.TRAINING_FFMPEG_PATH ?? 'ffmpeg' },
      } as AppConfigService,
    );
    const frames = await service.sample('local-test', 1, 3);
    expect(frames.length).toBeGreaterThan(2);
    expect(frames.length).toBeLessThanOrEqual(40);
    expect(frames.every((frame) => frame.seconds >= 1 && frame.seconds <= 3.1)).toBe(true);
    expect(frames[0].image.length).toBeGreaterThan(100);
  },
);
