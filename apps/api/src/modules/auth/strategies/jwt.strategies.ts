import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { OrganizationMemberRole } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ACCOUNT_STATE_SELECT, getUsableMembership } from '../account-status';
import { getJwtSecret, JWT_ALGORITHMS } from '../auth-config';

/** Claims inside the signed token. `tv` is the user's tokenVersion at issue time. */
export interface JwtClaims {
  sub: string;
  email: string;
  tv: number;
}

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
}

/** Kept for existing controllers that only need the user id. */
export type JwtPayload = AuthUser;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
      algorithms: [...JWT_ALGORITHMS],
    });
  }

  /**
   * Runs on every protected request. A token is only honoured while the user is
   * not archived, still has a membership in an active organization and the
   * token version matches. One query, so there is no check/use gap.
   */
  async validate(claims: JwtClaims): Promise<AuthUser> {
    if (typeof claims?.sub !== 'string' || typeof claims.tv !== 'number') {
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

    return {
      sub: claims.sub,
      email: user.email,
      organizationId: membership.organizationId,
      role: membership.role,
      tokenVersion: user.tokenVersion,
    };
  }
}
