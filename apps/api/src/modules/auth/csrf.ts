import { ForbiddenException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { getJwtSecret } from './auth-config';

/**
 * CSRF protection for cookie-authenticated requests (OWASP "HMAC-based token
 * pattern"): the token is HMAC-SHA256(key, session id). It is
 *
 * - bound to one server-side session (another session yields another token),
 * - not computable by the client (the key never leaves the server, the session
 *   id only travels inside the HttpOnly cookie),
 * - stateless to verify (recomputed from the authenticated session).
 *
 * The browser receives it in the JSON body of login/session responses, keeps
 * it in memory only and sends it in the X-CSRF-Token header. It is never put
 * into a cookie, a URL or Web Storage.
 */
export const CSRF_HEADER = 'x-csrf-token';
export const CSRF_FAILURE_MESSAGE = 'CSRF-Prüfung fehlgeschlagen';
/**
 * Machine-readable marker of a CSRF-token rejection. Clients may only react to
 * this code (e.g. by re-reading the session), never to a generic 403: role,
 * project and origin rejections carry no or a different code.
 */
export const CSRF_ERROR_CODE = 'CSRF_INVALID';

/** 403 for a missing/foreign/forged CSRF token; nothing ran before it. */
export class CsrfTokenException extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      error: 'Forbidden',
      message: CSRF_FAILURE_MESSAGE,
      code: CSRF_ERROR_CODE,
    });
  }
}
const CSRF_KEY_LABEL = 'bissinger-os/csrf/v1';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Domain-separated key, so a CSRF token can never double as a JWT signature. */
function csrfKey() {
  return createHmac('sha256', getJwtSecret()).update(CSRF_KEY_LABEL).digest();
}

export function csrfTokenFor(sessionId: string) {
  return createHmac('sha256', csrfKey())
    .update(`session:${sessionId}`)
    .digest('base64url');
}

export function isValidCsrfToken(
  sessionId: string,
  provided: string | string[] | undefined,
) {
  if (typeof provided !== 'string' || provided.length === 0) {
    return false;
  }
  const expected = Buffer.from(csrfTokenFor(sessionId));
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isStateChangingMethod(method: string) {
  return !SAFE_METHODS.has(method.toUpperCase());
}
