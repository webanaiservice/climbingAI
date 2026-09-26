import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CurrentSessionContext } from '../auth/current-session.decorator';
import type { CurrentSession } from '../auth/session.service';
import { SessionGuard } from '../auth/session.guard';
import { TrainingService } from './training.service';
import { TrainingVideoService, MAX_TRAINING_VIDEO_BYTES } from './training-video.service';
import {
  parseTraining,
  athleteSchema,
  measurementSchema,
  courseSchema,
  sessionSchema,
  attemptSchema,
  eventsSchema,
  analysisRequestSchema,
  reviewSchema,
  taskSchema,
  taskUpdateSchema,
} from './training.dto';

@ApiTags('training')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('training')
export class TrainingController {
  constructor(
    private readonly training: TrainingService,
    private readonly videos: TrainingVideoService,
  ) {}
  @Get('workspace') workspace(@CurrentSessionContext() s: CurrentSession) {
    return this.training.workspace(s);
  }
  @Post('athletes') createAthlete(
    @CurrentSessionContext() s: CurrentSession,
    @Body() body: unknown,
  ) {
    return this.training.saveAthlete(s, parseTraining(athleteSchema, body));
  }
  @Put('athletes/:id') updateAthlete(
    @CurrentSessionContext() s: CurrentSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.training.saveAthlete(s, parseTraining(athleteSchema, body), id);
  }
  @Patch('athletes/:id/archive') archive(
    @CurrentSessionContext() s: CurrentSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.training.archiveAthlete(
      s,
      id,
      parseTraining(z.object({ archived: z.boolean() }).strict(), body).archived,
    );
  }
  @Post('athletes/:id/measurements') measure(
    @CurrentSessionContext() s: CurrentSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.training.addMeasurement(s, id, parseTraining(measurementSchema, body));
  }
  @Post('courses') course(@CurrentSessionContext() s: CurrentSession, @Body() body: unknown) {
    return this.training.createCourse(s, parseTraining(courseSchema, body));
  }
  @Post('sessions') session(@CurrentSessionContext() s: CurrentSession, @Body() body: unknown) {
    return this.training.createSession(s, parseTraining(sessionSchema, body));
  }
  @Post('attempts') createAttempt(
    @CurrentSessionContext() s: CurrentSession,
    @Body() body: unknown,
  ) {
    return this.training.saveAttempt(s, parseTraining(attemptSchema, body));
  }
  @Put('attempts/:id') updateAttempt(
    @CurrentSessionContext() s: CurrentSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.training.saveAttempt(s, parseTraining(attemptSchema, body), id);
  }
  @Get('attempts/:id') attempt(
    @CurrentSessionContext() s: CurrentSession,
    @Param('id') id: string,
  ) {
    return this.training.attempt(s, id);
  }
  @Put('attempts/:id/events') events(
    @CurrentSessionContext() s: CurrentSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.training.saveEvents(s, id, parseTraining(eventsSchema, body).events);
  }
  @Post('attempts/:id/analyses') analyze(
    @CurrentSessionContext() s: CurrentSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.training.enqueueAnalysis(s, id, parseTraining(analysisRequestSchema, body));
  }
  @Post('analyses/:id/reviews') review(
    @CurrentSessionContext() s: CurrentSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.training.review(s, id, parseTraining(reviewSchema, body));
  }
  @Post('tasks') task(@CurrentSessionContext() s: CurrentSession, @Body() body: unknown) {
    return this.training.createTask(s, parseTraining(taskSchema, body));
  }
  @Patch('tasks/:id') updateTask(
    @CurrentSessionContext() s: CurrentSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.training.updateTask(s, id, parseTraining(taskUpdateSchema, body));
  }
  @Post('attempts/:id/video')
  async upload(
    @CurrentSessionContext() s: CurrentSession,
    @Param('id') id: string,
    @Req() request: FastifyRequest,
  ) {
    await this.training.attempt(s, id);
    this.training.scope(s, true);
    const file = await request.file({
      limits: { files: 1, fields: 0, fileSize: MAX_TRAINING_VIDEO_BYTES },
    });
    if (!file) throw new BadRequestException('请选择视频文件');
    return this.videos.upload(s, id, file);
  }
  @Get('attempts/:id/video')
  async video(
    @CurrentSessionContext() s: CurrentSession,
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.videos.playback(s, id, range);
    reply.header('Accept-Ranges', 'bytes').header('Cache-Control', 'private, no-store');
    if (result.range)
      reply
        .code(206)
        .header('Content-Range', `bytes ${result.range.start}-${result.range.end}/${result.size}`);
    return new StreamableFile(result.stream, {
      type: 'video/mp4',
      length: result.range?.length ?? result.size,
      disposition: 'inline',
    });
  }
}
