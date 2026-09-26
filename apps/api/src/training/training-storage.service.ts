import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppConfigService } from '../config/app-config.service';
import { ObjectStorageService } from '../storage/object-storage.service';

// Local development can retain videos on disk; deployed installations use existing MinIO.
// The key records its backend, so changing configuration never silently reads another store.
@Injectable()
export class TrainingStorageService {
  constructor(
    private readonly config: AppConfigService,
    private readonly objects: ObjectStorageService,
  ) {}
  prefix() {
    return this.config.values.TRAINING_STORAGE_PATH ? 'local-training/' : '';
  }
  private localPath(key: string) {
    const directory = this.config.values.TRAINING_STORAGE_PATH;
    if (!directory)
      throw new ServiceUnavailableException('本地视频存储路径未配置，请联系管理员恢复原存储路径');
    return join(resolve(directory), createHash('sha256').update(key).digest('hex'));
  }
  async putStream(key: string, stream: Readable, size: number, type: string) {
    if (!key.startsWith('local-training/')) return this.objects.putStream(key, stream, size, type);
    const path = this.localPath(key);
    const temporary = `${path}.${randomUUID()}.part`;
    await mkdir(resolve(this.config.values.TRAINING_STORAGE_PATH!), {
      recursive: true,
      mode: 0o700,
    });
    try {
      await pipeline(stream, createWriteStream(temporary, { mode: 0o600 }));
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async get(key: string) {
    return key.startsWith('local-training/')
      ? createReadStream(this.localPath(key))
      : this.objects.get(key);
  }
  async getPartial(key: string, start: number, length: number) {
    return key.startsWith('local-training/')
      ? createReadStream(this.localPath(key), { start, end: start + length - 1 })
      : this.objects.getPartial(key, start, length);
  }
  async remove(key: string) {
    return key.startsWith('local-training/')
      ? rm(this.localPath(key), { force: true })
      : this.objects.remove(key);
  }
}
