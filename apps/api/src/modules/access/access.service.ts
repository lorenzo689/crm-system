import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  OrganizationMemberRole,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ACCOUNT_STATE_SELECT,
  getUsableMembership,
} from '../auth/account-status';

export type Tx = Prisma.TransactionClient;

/** Records that can belong to a project (see ProjectWriteGuard). */
export type ProjectScopedEntity =
  | 'calendarEvent'
  | 'salesDocument'
  | 'purchaseOrder'
  | 'reservation'
  | 'recurringInvoice'
  | 'timeEntry';

export interface LockedActor {
  userId: string;
  organizationId: string;
  role: OrganizationMemberRole;
}

/** Cross-cutting authorization checks that need database state. */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs an administrative mutation in a transaction that first locks the
   * organization row and then re-validates the acting user against the
   * database: account active, membership in an active organization, token
   * version unchanged and an OWNER/ADMIN role. The token was only checked when
   * the request started; without this a user whose rights were withdrawn in
   * the meantime could still finish the action (TOCTOU).
   *
   * `exclusive` serialises against every other admin mutation (role changes,
   * lockouts). Mutations that only need a consistent actor use the shared lock
   * so they can run in parallel with each other but never with an exclusive one.
   */
  async runAsAdmin<T>(
    actor: { userId: string; organizationId: string; tokenVersion: number },
    action: (tx: Tx, current: LockedActor) => Promise<T>,
    options: { exclusive?: boolean } = {},
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      if (options.exclusive) {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${actor.organizationId}::uuid FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${actor.organizationId}::uuid FOR SHARE`;
      }

      const account = await tx.user.findUnique({
        where: { id: actor.userId },
        select: ACCOUNT_STATE_SELECT,
      });
      const membership = getUsableMembership(account);
      if (
        !account ||
        !membership ||
        account.tokenVersion !== actor.tokenVersion ||
        membership.organizationId !== actor.organizationId
      ) {
        throw new UnauthorizedException();
      }
      if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
        throw new ForbiddenException('Keine Berechtigung für diese Aktion');
      }
      return action(tx, {
        userId: actor.userId,
        organizationId: actor.organizationId,
        role: membership.role,
      });
    });
  }

  /**
   * A user id coming from a client may only be used if that user is an active
   * member of the caller's organization. Anything else answers 404 so the
   * existence of foreign users is not revealed.
   */
  async assertActiveOrganizationMember(
    organizationId: string,
    userId: string,
    client: Tx | PrismaService = this.prisma,
  ) {
    const membership = await client.organizationMember.findFirst({
      where: { organizationId, userId, user: { archivedAt: null } },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundException('User not found');
    }
  }

  /**
   * The project an existing record belongs to, read from the database. Not
   * scoped to an organization on purpose: the caller's service still answers
   * 404 for foreign records; this only decides whether VIEWER blocks the write.
   */
  async projectIdOf(
    entity: ProjectScopedEntity,
    id: string,
  ): Promise<string | null> {
    const where = { id };
    const select = { projectId: true } as const;
    let record: { projectId: string | null } | null;
    switch (entity) {
      case 'calendarEvent':
        record = await this.prisma.calendarEvent.findUnique({ where, select });
        break;
      case 'salesDocument':
        record = await this.prisma.salesDocument.findUnique({ where, select });
        break;
      case 'purchaseOrder':
        record = await this.prisma.purchaseOrder.findUnique({ where, select });
        break;
      case 'reservation':
        record = await this.prisma.reservation.findUnique({ where, select });
        break;
      case 'recurringInvoice':
        record = await this.prisma.recurringInvoice.findUnique({
          where,
          select,
        });
        break;
      case 'timeEntry':
        record = await this.prisma.timeEntry.findUnique({ where, select });
        break;
    }
    return record?.projectId ?? null;
  }

  /** Same check for data attached to a task (the task's project decides). */
  async assertTaskWritable(taskId: string | null | undefined, userId: string) {
    if (!taskId) {
      return;
    }
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    await this.assertProjectWritable(task?.projectId, userId);
  }

  /**
   * Project role VIEWER means read-only for that project. Called before any
   * mutation of a project or of data that belongs to a project.
   */
  async assertProjectWritable(
    projectId: string | null | undefined,
    userId: string,
  ) {
    if (!projectId) {
      return;
    }
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { role: true },
    });
    if (membership?.role === 'VIEWER') {
      throw new ForbiddenException(
        'Als Betrachter dieses Projekts dürfen Sie keine Änderungen vornehmen',
      );
    }
  }
}
