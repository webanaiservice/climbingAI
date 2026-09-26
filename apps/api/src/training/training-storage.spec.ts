import { expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { TrainingStorageService } from './training-storage.service';
import type { AppConfigService } from '../config/app-config.service';
import type { ObjectStorageService } from '../storage/object-storage.service';
it('retains local videos across service instances, supports ranges and safe filenames', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'training-storage-test-'));
  try {
    const config = { values: { TRAINING_STORAGE_PATH: directory } } as AppConfigService;
    const store = new TrainingStorageService(config, {} as ObjectStorageService);
    const key = store.prefix() + '../../untrusted-original.mov';
    await store.putStream(key, Readable.from(Buffer.from('0123456789')), 10, 'video/mp4');
    const reopened = new TrainingStorageService(config, {} as ObjectStorageService);
    const chunks = [];
    for await (const chunk of await reopened.getPartial(key, 2, 4)) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe('2345');
    expect((await readdir(directory))[0]).toMatch(/^[a-f0-9]{64}$/);
    await reopened.remove(key);
    expect(await readdir(directory)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('preserves MinIO access for existing object keys', async () => {
  const get = vi.fn().mockResolvedValue(Readable.from('existing'));
  const store = new TrainingStorageService(
    { values: { TRAINING_STORAGE_PATH: '/unused' } } as AppConfigService,
    { get } as unknown as ObjectStorageService,
  );
  await store.get('gym/training/old/playback.mp4');
  expect(get).toHaveBeenCalledWith('gym/training/old/playback.mp4');
});
