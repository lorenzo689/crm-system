import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import type { AuthUser } from '../strategies/jwt.strategies';
import { SESSION_CONTEXT_HEADER, sessionContextFor } from '../session-context';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Stamps every authenticated answer with the session context it was produced
   * for. The header is set before the handler runs, so streamed bodies (document
   * downloads) carry it as well; it is set only after a successful
   * authentication, and the answer is built from exactly this user/org/role.
   */
  handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    const authenticated: TUser = super.handleRequest(
      err,
      user,
      info,
      context,
      status,
    );
    const auth = authenticated as unknown as AuthUser;
    if (auth?.sessionId) {
      context
        .switchToHttp()
        .getResponse<Response>()
        .setHeader(
          SESSION_CONTEXT_HEADER,
          sessionContextFor({
            sessionId: auth.sessionId,
            userId: auth.sub,
            organizationId: auth.organizationId,
            role: auth.role,
          }),
        );
    }
    return authenticated;
  }
}
