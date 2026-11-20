import { createHmac } from 'crypto';
import { getJwtSecret } from './auth-config';

/**
 * Non-secret session-context marker.
 *
 * The browser must be able to tell WHICH session context an API answer was
 * produced for (cookies are shared between tabs, so the page's idea of "who am
 * I" and the cookie that was actually sent can differ). The marker is
 *
 *   HMAC-SHA256(derivedKey, sessionId | userId | organizationId | role)
 *
 * and is
 * - returned in the X-Session-Context response header of every authenticated
 *   answer and as `contextId` in the login/session JSON,
 * - one-way: it does not reveal the session id, and it cannot be used to
 *   authenticate or to compute the CSRF token (separate key label),
 * - never accepted as an input anywhere on the server,
 * - changing whenever session, user, organization or role changes.
 */
export const SESSION_CONTEXT_HEADER = 'X-Session-Context';
const CONTEXT_KEY_LABEL = 'bissinger-os/session-context/v1';

function contextKey() {
  return createHmac('sha256', getJwtSecret())
    .update(CONTEXT_KEY_LABEL)
    .digest();
}

export function sessionContextFor(input: {
  sessionId: string;
  userId: string;
  organizationId: string;
  role: string;
}) {
  return createHmac('sha256', contextKey())
    .update(
      JSON.stringify([
        input.sessionId,
        input.userId,
        input.organizationId,
        input.role,
      ]),
    )
    .digest('base64url');
}
