import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OrganizationMemberRole } from '../../../generated/prisma/client';
import {
  AccessService,
  type LockedActor,
  type Tx,
} from '../access/access.service';
import type { AuthUser } from '../auth/strategies/jwt.strategies';

/**
 * Administrative changes to accounts. Every method runs in one transaction
 * that locks the organization row exclusively and then re-validates the
 * acting user (see AccessService.runAsAdmin), so concurrent demotions or
 * lockouts can neither both pass the "last owner" check nor let an admin
 * whose rights were just withdrawn finish an action.
 */
@Injectable()
export class UsersAdminService {
  constructor(private readonly access: AccessService) {}

  async changeRole(
    actor: AuthUser,
    targetUserId: string,
    role: OrganizationMemberRole,
  ) {
    return this.run(actor, targetUserId, async (tx, current, target) => {
      // Only an OWNER may grant or take away ownership.
      if (
        (role === 'OWNER' || target.role === 'OWNER') &&
        current.role !== 'OWNER'
      ) {
        throw new ForbiddenException(
          'Nur ein Owner darf Owner-Rechte vergeben oder ändern',
        );
      }
      if (target.role === 'OWNER' && role !== 'OWNER') {
        await this.assertAnotherActiveOwnerExists(
          tx,
          current.organizationId,
          targetUserId,
        );
      }
      await tx.organizationMember.update({
        where: { id: target.id },
        data: { role },
      });
      return { id: targetUserId, role };
    });
  }

  /** Locks the account and invalidates every token it has ever been issued. */
  async deactivate(actor: AuthUser, targetUserId: string) {
    return this.run(actor, targetUserId, async (tx, current, target) => {
      this.assertMayManage(current, target.role);
      if (target.role === 'OWNER') {
        await this.assertAnotherActiveOwnerExists(
          tx,
          current.organizationId,
          targetUserId,
        );
      }
      await tx.user.update({
        where: { id: targetUserId },
        data: { archivedAt: new Date(), tokenVersion: { increment: 1 } },
      });
      await this.endAllSessions(tx, targetUserId);
      return { id: targetUserId, active: false };
    });
  }

  async revokeSessions(actor: AuthUser, targetUserId: string) {
    return this.run(actor, targetUserId, async (tx, current, target) => {
      this.assertMayManage(current, target.role);
      await tx.user.update({
        where: { id: targetUserId },
        data: { tokenVersion: { increment: 1 } },
      });
      await this.endAllSessions(tx, targetUserId);
      return { id: targetUserId, sessionsRevoked: true };
    });
  }

  /** Revokes the session rows; the tokenVersion bump stays as second barrier. */
  private async endAllSessions(tx: Tx, userId: string) {
    await tx.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private assertMayManage(
    actor: LockedActor,
    targetRole: OrganizationMemberRole,
  ) {
    if (targetRole === 'OWNER' && actor.role !== 'OWNER') {
      throw new ForbiddenException('Nur ein Owner darf Owner-Konten verwalten');
    }
  }

  private async run<T>(
    actor: AuthUser,
    targetUserId: string,
    action: (
      tx: Tx,
      current: LockedActor,
      target: { id: string; role: OrganizationMemberRole },
    ) => Promise<T>,
  ): Promise<T> {
    return this.access.runAsAdmin(
      {
        userId: actor.sub,
        organizationId: actor.organizationId,
        tokenVersion: actor.tokenVersion,
      },
      async (tx, current) => {
        // Foreign or unknown users answer 404: their existence is not revealed.
        const target = await tx.organizationMember.findFirst({
          where: {
            organizationId: current.organizationId,
            userId: targetUserId,
          },
          select: { id: true, role: true },
        });
        if (!target) {
          throw new NotFoundException('User not found');
        }
        return action(tx, current, target);
      },
      { exclusive: true },
    );
  }

  private async assertAnotherActiveOwnerExists(
    tx: Tx,
    organizationId: string,
    excludedUserId: string,
  ) {
    const others = await tx.organizationMember.count({
      where: {
        organizationId,
        role: 'OWNER',
        userId: { not: excludedUserId },
        user: { archivedAt: null },
      },
    });
    if (others === 0) {
      throw new ConflictException(
        'Der letzte aktive Owner kann nicht entfernt, gesperrt oder herabgestuft werden',
      );
    }
  }
}
