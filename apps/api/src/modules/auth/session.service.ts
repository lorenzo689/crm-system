import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Prisma } from '../../../generated/prisma/client';
import { BackgroundJobsService } from '../../common/jobs/background-jobs.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getJwtExpiresInSeconds } from './auth-config';
import { csrfTokenFor } from './csrf';

const SESSION_SECRET_BYTES = 32;
/** lastUsedAt is informational; writing it at most every 5 minutes is enough. */
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;
/** Ended sessions are kept briefly for support questions, then deleted. */
const ENDED_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

type Client = PrismaService | Prisma.TransactionClient;

/** Claims inside the session cookie's JWT. */
export interface SessionClaims {
  sub: string;
  email: string;
  /** User.tokenVersion at issue time. */
  tv: number;
  /** UserSession.id */
  sid: string;
  /** Session secret; only its SHA-256 hash is stored. */
  jti: string;
}

export interface IssuedSession {
  /** Cookie value. Never returned to browser JavaScript. */
  cookieValue: string;
  sessionId: string;
  expiresAt: Date;
  csrfToken: string;
}

function hashSecret(secret: string) {
  return createHash('sha256').update(secret).digest();
}

/**
 * Server-side browser sessions. A request is only authenticated when the
 * cookie's JWT is validly signed AND points at a stored, unrevoked, unexpired
 * session whose secret hash matches. A leaked database alone (hashes only) or a
 * leaked signing key alone (no session secrets) is therefore not enough to
 * impersonate anyone.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly jobs: BackgroundJobsService,
  ) {}

  async create(user: {
    id: string;
    email: string;
    tokenVersion: number;
  }): Promise<IssuedSession> {
    const now = new Date();
    const lifetimeSeconds = getJwtExpiresInSeconds();
    const expiresAt = new Date(now.getTime() + lifetimeSeconds * 1000);
    const secret = randomBytes(SESSION_SECRET_BYTES).toString('base64url');

    const session = await this.prisma.$transaction(async (tx) => {
      // Keeps the table bounded per user without a separate job.
      await tx.userSession.deleteMany({
        where: {
          userId: user.id,
          OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }],
        },
      });
      return tx.userSession.create({
        data: {
          userId: user.id,
          secretHash: hashSecret(secret).toString('hex'),
          expiresAt,
        },
        select: { id: true },
      });
    });

    const claims: SessionClaims = {
      sub: user.id,
      email: user.email,
      tv: user.tokenVersion,
      sid: session.id,
      jti: secret,
    };
    const cookieValue = this.jwtService.sign(claims, {
      expiresIn: lifetimeSeconds,
    });

    return {
      cookieValue,
      sessionId: session.id,
      expiresAt,
      csrfToken: csrfTokenFor(session.id),
    };
  }

  /** Returns the live session for these claims, or null. */
  async findActive(claims: SessionClaims) {
    const session = await this.prisma.userSession.findUnique({
      where: { id: claims.sid },
      select: {
        id: true,
        userId: true,
        secretHash: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
    });
    const now = Date.now();
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt.getTime() <= now
    ) {
      return null;
    }

    const stored = Buffer.from(session.secretHash, 'hex');
    const presented = hashSecret(claims.jti);
    if (
      stored.length !== presented.length ||
      !timingSafeEqual(stored, presented)
    ) {
      return null;
    }

    if (now - session.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date(now) },
      });
    }
    return { id: session.id, expiresAt: session.expiresAt };
  }

  /** Ends exactly one session (logout on this device). */
  async revoke(sessionId: string, client: Client = this.prisma) {
    await client.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Ends every session of a user (lock, admin revoke, password reset). */
  async revokeAllForUser(userId: string, client: Client = this.prisma) {
    await client.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'session-purge' })
  async purgeEndedSessionsScheduled() {
    await this.jobs.run('session-purge', () => this.purgeEndedSessions());
  }

  /** Sessions are never stored indefinitely. */
  async purgeEndedSessions() {
    const cutoff = new Date(Date.now() - ENDED_SESSION_RETENTION_MS);
    const { count } = await this.prisma.userSession.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
      },
    });
    if (count > 0) {
      this.logger.log(`${count} beendete Sitzungen gelöscht`);
    }
  }
}
