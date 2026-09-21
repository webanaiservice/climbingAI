import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CurrentSessionContext } from '../auth/current-session.decorator';
import { SessionGuard } from '../auth/session.guard';
import type { CurrentSession } from '../auth/session.service';
import { AppConfigService } from '../config/app-config.service';
import { AccessControlService, Capability } from '../security/access-control.service';
import { RateLimitService } from '../security/rate-limit.service';
import { generateRouteCandidates } from './route-candidates';

@ApiTags('route-setting')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('route-setting')
export class RouteSettingController {
  constructor(
    private readonly access: AccessControlService,
    private readonly rateLimits: RateLimitService,
    private readonly config: AppConfigService,
  ) {}

  @Post('candidates')
  @ApiOperation({ summary: '根据当前岩点库存生成三条 AI 辅助定线候选' })
  async candidates(
    @CurrentSessionContext() session: CurrentSession,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.access.assert(session, Capability.ASSET_DRAFT_WRITE);
    await this.rateLimits.consume(
      'ai-route-candidates',
      `${session.organization.id}:${session.account.id}`,
      12,
      60,
    );
    const result = await generateRouteCandidates(body, this.config.values);
    reply.status(result.status);
    return result.json();
  }
}
