import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';
/** Accepts ids from the reverse proxy (Caddy UUIDs); anything else is replaced. */
const VALID_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

const requestIds = new WeakMap<Request, string>();

/** The id assigned to this request by requestContextMiddleware. */
export function requestIdOf(req: Request): string | undefined {
  return requestIds.get(req);
}

const accessLogger = new Logger('HTTP');

/**
 * Gives every request an id (from the proxy's X-Request-Id or a new UUID),
 * returns it in the response and writes one access log line per request.
 *
 * Logged: id, method, path WITHOUT query string, status, duration and the
 * user id if authenticated. Never logged: query strings, headers (cookies,
 * CSRF tokens), bodies or IP addresses.
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();
  requestIds.set(req, requestId);
  res.setHeader('X-Request-Id', requestId);

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0];
    if (path.startsWith('/api/v1/health')) return; // probe noise
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const user: unknown = req.user;
    const userId =
      typeof user === 'object' &&
      user !== null &&
      'sub' in user &&
      typeof user.sub === 'string'
        ? user.sub
        : undefined;
    const line = `requestId=${requestId} method=${req.method} path=${path} status=${res.statusCode} durationMs=${durationMs.toFixed(1)}${userId ? ` userId=${userId}` : ''}`;
    if (res.statusCode >= 500) accessLogger.error(line);
    else accessLogger.log(line);
  });
  next();
}

/**
 * Unexpected (non-HTTP) errors: logged once with the request id, the error
 * class and stack (no request data), answered with a generic 500 that
 * carries the id so a user report can be correlated with the log.
 */
@Catch()
export class RequestIdExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof HttpException) {
      super.catch(exception, host);
      return;
    }
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const name = exception instanceof Error ? exception.name : 'UnknownError';
    // Stack frames without the first line: messages may contain user input.
    const frames =
      exception instanceof Error
        ? exception.stack
            ?.split(String.fromCharCode(10))
            .slice(1)
            .join(String.fromCharCode(10))
        : undefined;
    this.logger.error(
      `requestId=${requestIdOf(req) ?? '-'} error=${name}`,
      frames,
    );
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.status(500).json({
      statusCode: 500,
      message: 'Interner Serverfehler',
      requestId: requestIdOf(req),
    });
  }
}
