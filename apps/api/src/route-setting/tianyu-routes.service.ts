import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CurrentSession } from '../auth/session.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../common/audit.service';
import type { TianyuRouteDocument } from './tianyu-routes.dto';

@Injectable()
export class TianyuRoutesService {
  constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}

  list(session: CurrentSession) {
    return this.db.trainingBoardRoute.findMany({
      where: { organizationId: session.organization.id }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, revision: true, name: true, grade: true, angle: true, updatedAt: true },
    });
  }

  async get(session: CurrentSession, id: string) {
    const route = await this.db.trainingBoardRoute.findFirst({ where: { id, organizationId: session.organization.id } });
    if (!route) throw new NotFoundException('线路不存在或不属于当前岩馆');
    return route;
  }

  async save(session: CurrentSession, document: TianyuRouteDocument, id?: string, revision?: number) {
    const organizationId = session.organization.id;
    const actorAccountId = session.account.id;
    const data = { name: document.name, grade: document.grade, angle: document.board.angle,
      document: document as Prisma.InputJsonValue, updatedByAccountId: actorAccountId };
    return this.db.$transaction(async tx => {
      let row;
      if (id) {
        const current = await tx.trainingBoardRoute.findFirst({ where: { id, organizationId } });
        if (!current) throw new NotFoundException('线路不存在或不属于当前岩馆');
        const updated = await tx.trainingBoardRoute.updateMany({ where: { id, organizationId, revision }, data: { ...data, revision: { increment: 1 } } });
        if (updated.count !== 1) throw new ConflictException('线路已被其他人修改，请重新打开或另存为新线路；当前草稿已保留');
        row = await tx.trainingBoardRoute.findFirstOrThrow({ where: { id, organizationId } });
      } else {
        row = await tx.trainingBoardRoute.create({ data: { ...data, organizationId, createdByAccountId: actorAccountId } });
      }
      await this.audit.record({ organizationId, actorAccountId, type: id ? 'TRAINING_BOARD_ROUTE_UPDATED' : 'TRAINING_BOARD_ROUTE_CREATED',
        outcome: 'SUCCESS', metadata: { routeId: row.id, revision: row.revision, pointCount: document.points.length, source: document.origin.kind } }, tx);
      return row;
    });
  }
}
