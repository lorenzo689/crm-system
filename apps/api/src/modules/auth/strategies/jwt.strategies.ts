import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-jwt';
import type { OrganizationMemberRole } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ACCOUNT_STATE_SELECT, getUsableMembership } from '../account-status';
import { getJwtSecret, JWT_ALGORITHMS } from '../auth-config';
import {
  CSRF_HEADER,
  CsrfTokenException,
  isStateChangingMethod,
  isValidCsrfToken,
} from '../csrf';
import { readSessionCookie } from '../session-cookie';
import { SessionService, type SessionClaims } from '../session.service';

/**
 * What controllers see as `req.user`. Everything except `sub`/`email` is read
 * from the database during this request, so it is always current.
 */
export interface AuthUser {
  sub: string;
  email: string;
  organizationId: string;
  role: OrganizationMemberRole;
  tokenVersion: number;
  sessionId: string;
  sessionExpiresAt: Date;
}

/** Kept for existing controllers that only need the user id. */
export type JwtPayload = AuthUser;

function isSessionClaims(value: unknown): value is SessionClaims {
  const claims = value as Partial<SessionClaims> | null;
  return (
    typeof claims?.sub === 'string' &&
    typeof claims.tv === 'number' &&
    typeof claims.sid === 'string' &&
    typeof claims.jti === 'string'
  );
}

/**
 * The only way to authenticate: the HttpOnly session cookie. There is no
 * Authorization: Bearer fallback; no client of this API needs one, and a
 * second credential channel would bypass the CSRF and session rules below.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {
    super({
      jwtFromRequest: (req: Request) => readSessionCookie(req),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
      algorithms: [...JWT_ALGORITHMS],
      passReqToCallback: true,
    });
  }

  /**
   * Runs on every protected request, in this order:
   * 1. the session row exists, is unrevoked, unexpired and matches the secret;
   * 2. the account is not archived, still a member of an active organization
   *    and the token version matches (sprint 1 rules, unchanged);
   * 3. state-changing methods carry the CSRF token of exactly this session.
   */
  async validate(req: Request, claims: unknown): Promise<AuthUser> {
    if (!isSessionClaims(claims)) {
      throw new UnauthorizedException();
    }

    const session = await this.sessions.findActive(claims);
    if (!session) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: ACCOUNT_STATE_SELECT,
    });
    const membership = getUsableMembership(user);
    if (!user || !membership || user.tokenVersion !== claims.tv) {
      throw new UnauthorizedException();
    }

    if (
      isStateChangingMethod(req.method) &&
      !isValidCsrfToken(session.id, req.headers[CSRF_HEADER])
    ) {
      throw new CsrfTokenException();
    }

    return {
      sub: claims.sub,
      email: user.email,
      organizationId: membership.organizationId,
      role: membership.role,
      tokenVersion: user.tokenVersion,
      sessionId: session.id,
      sessionExpiresAt: session.expiresAt,
    };
  }
}
