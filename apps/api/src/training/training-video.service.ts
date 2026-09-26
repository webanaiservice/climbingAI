import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { MultipartFile } from '@fastify/multipart';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { CurrentSession } from '../auth/session.service';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../database/prisma.service';
import { TrainingStorageService } from './training-storage.service';
import { ObjectCleanupService } from '../storage/object-cleanup.service';
import { TrainingService } from './training.service';

const exec = promisify(execFile);
export const MAX_TRAINING_VIDEO_BYTES = 200 * 1024 * 1024;
export async function runTrainingFfmpeg(executable: string, args: string[]) {
  try {
    return await exec(executable, ['-hide_banner', '-nostdin', ...args], {
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new ServiceUnavailableException('服务器缺少 FFmpeg，请管理员配置后重试');
    throw new BadRequestException(
      '视频无法解码或处理超时，请使用不超过 3 分钟的 MP4 / MOV / WebM 视频',
    );
  }
}
export function trainingByteRange(value: string | undefined, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) throw new HttpException('视频范围请求不正确', 416);
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start)
    throw new HttpException('视频范围超出文件大小', 416);
  return { start, end, length: end - start + 1 };
}

@Injectable()
export class TrainingVideoService {
  constructor(
    private readonly training: TrainingService,
    private readonly db: PrismaService,
    private readonly storage: TrainingStorageService,
    private readonly cleanup: ObjectCleanupService,
    private readonly config: AppConfigService,
  ) {}

  async upload(session: CurrentSession, id: string, file: MultipartFile) {
    const organizationId = this.training.scope(session, true);
    const attempt = await this.training.attempt(session, id);
    if (attempt.video) throw new ConflictException('此尝试已有视频，请为下一次攀爬新建记录');
    if (!/\.(mp4|mov|m4v|webm)$/i.test(file.filename))
      throw new BadRequestException('请选择 MP4、MOV 或 WebM 视频');
    const directory = await mkdtemp(join(tmpdir(), 'climbing-training-'));
    const source = join(directory, 'source');
    const output = join(directory, 'playback.mp4');
    const base = `${this.storage.prefix()}${organizationId}/training/${id}/${randomUUID()}`;
    const originalKey = `${base}/original`;
    const objectKey = `${base}/playback.mp4`;
    const written: string[] = [];
    let uploadedBytes = 0;
    const hash = createHash('sha256');
    try {
      await pipeline(
        file.file,
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            uploadedBytes += chunk.length;
            if (uploadedBytes > MAX_TRAINING_VIDEO_BYTES)
              return callback(new PayloadTooLargeException('视频不能超过 200 MB'));
            hash.update(chunk);
            callback(null, chunk);
          },
        }),
        createWriteStream(source),
      );
      if (file.file.truncated) throw new PayloadTooLargeException('视频不能超过 200 MB');
      if (!uploadedBytes) throw new BadRequestException('视频文件为空');
      const probe = await runTrainingFfmpeg(this.config.values.TRAINING_FFMPEG_PATH, [
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mov,matroska,webm',
        '-i',
        source,
        '-map',
        '0:v:0',
        '-t',
        '0',
        '-f',
        'null',
        '-',
      ]);
      const match = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe.stderr);
      const duration = match
        ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
        : NaN;
      if (!Number.isFinite(duration) || duration < 0.3 || duration > 180)
        throw new BadRequestException('请选择 0.3 秒至 3 分钟的完整攀爬片段');
      await runTrainingFfmpeg(this.config.values.TRAINING_FFMPEG_PATH, [
        '-loglevel',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mov,matroska,webm',
        '-i',
        source,
        '-map',
        '0:v:0',
        '-an',
        '-map_metadata',
        '-1',
        '-vf',
        "scale=w='min(1280,iw)':h=-2",
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-fps_mode',
        'vfr',
        output,
      ]);
      const info = await stat(output);
      written.push(originalKey);
      await this.storage.putStream(
        originalKey,
        createReadStream(source),
        uploadedBytes,
        'application/octet-stream',
      );
      written.push(objectKey);
      await this.storage.putStream(objectKey, createReadStream(output), info.size, 'video/mp4');
      const row = await this.db.trainingVideo.create({
        data: {
          organizationId,
          attemptId: id,
          filename: file.filename.slice(0, 180),
          objectKey,
          originalKey,
          sizeBytes: info.size,
          durationMs: Math.round(duration * 1000),
          sha256: hash.digest('hex'),
          uploadedBy: session.account.id,
        },
      });
      return { id: row.id, filename: row.filename, durationMs: row.durationMs };
    } catch (error) {
      for (const key of written) {
        try {
          await this.storage.remove(key);
        } catch (cleanupError) {
          await this.cleanup.enqueue(key, 'training-upload-failed', cleanupError);
        }
      }
      if ((error as NodeJS.ErrnoException).code === 'ERR_STREAM_PREMATURE_CLOSE')
        throw new BadRequestException('上传连接中断，视频未完整接收，请重新选择视频上传');
      throw error;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  async playback(session: CurrentSession, id: string, header?: string) {
    const attempt = await this.training.attempt(session, id);
    if (!attempt.video) throw new BadRequestException('此记录尚未上传视频');
    const video = attempt.video;
    const range = trainingByteRange(header, video.sizeBytes);
    const stream = range
      ? await this.storage.getPartial(video.objectKey, range.start, range.length)
      : await this.storage.get(video.objectKey);
    return { stream, range, size: video.sizeBytes };
  }
  async sample(objectKey: string, start: number, end: number) {
    const directory = await mkdtemp(join(tmpdir(), 'climbing-analysis-'));
    try {
      const source = join(directory, 'source.mp4');
      await pipeline(await this.storage.get(objectKey), createWriteStream(source));
      const interval = Math.max((end - start) / 39, 1 / 15);
      const result = await runTrainingFfmpeg(this.config.values.TRAINING_FFMPEG_PATH, [
        '-protocol_whitelist',
        'file,pipe',
        '-ss',
        String(start),
        '-i',
        source,
        '-t',
        String(end - start),
        '-an',
        '-vf',
        `select='isnan(prev_selected_t)+gte(t-prev_selected_t,${interval})',scale=w='min(960,iw)':h=-2,showinfo`,
        '-fps_mode',
        'vfr',
        '-frames:v',
        '40',
        '-q:v',
        '3',
        join(directory, 'frame-%03d.jpg'),
      ]);
      const timestamps = [...result.stderr.matchAll(/\bn:\s*\d+\s+pts:.*?pts_time:([\d.-]+)/g)].map(
        (match) => start + Number(match[1]),
      );
      const names = (await readdir(directory)).filter((name) => name.startsWith('frame-')).sort();
      if (!names.length || timestamps.length < names.length)
        throw new BadRequestException('视频未生成可核对时间戳的分析画面');
      return await Promise.all(
        names.map(async (name, index) => ({
          seconds: Math.round(timestamps[index] * 1000) / 1000,
          image: (await readFile(join(directory, name))).toString('base64'),
        })),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
