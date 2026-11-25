import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Accepts only `application/json` request bodies (415 otherwise).
 *
 * Bound to the route handler instead of matching URL strings, so every path
 * variant the router accepts (case, trailing slash, …) is covered. Used on the
 * cookie-less auth endpoints: an HTML form cannot send JSON, and a
 * cross-origin JSON request needs a CORS preflight that unknown origins fail.
 */
@Injectable()
export class JsonBodyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.is('application/json') !== 'application/json') {
      throw new UnsupportedMediaTypeException(
        'Nur application/json wird akzeptiert',
      );
    }
    return true;
  }
}
