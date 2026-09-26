import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../database/prisma.service';
import { lockTrainingAnalysis } from './training.service';
loadDotenv({ path: resolve(process.cwd(), '../../.env'), quiet: true });
const db = new PrismaService();
describe.runIf(process.env.DATABASE_INTEGRATION === 'true')(
  'training analysis PostgreSQL locking',
  () => {
    afterAll(() => db.$disconnect());
    it('locks one attempt without deserializing void and releases on commit', async () => {
      const id = randomUUID();
      const key = `training-analysis:${id}`;
      await db.$transaction(async (tx) => {
        await lockTrainingAnalysis(tx, id);
        const concurrent = await db.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`;
        expect(concurrent[0].locked).toBe(false);
      });
      const after = await db.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) AS locked`;
      expect(after[0].locked).toBe(true);
    });
  },
);
