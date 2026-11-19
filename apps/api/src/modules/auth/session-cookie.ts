import type { CookieOptions, Request, Response } from 'express';
import { allowsInsecureLocalCookies } from '../../common/http/request-origin';

/**
 * The browser session lives in exactly one HttpOnly cookie.
 *
 * Secure by default: the `__Host-` prefix, which browsers only accept together
 * with `Secure`, `Path=/` and no `Domain` attribute, binds the cookie to the
 * exact HTTPS host. The unprefixed, non-Secure variant is used only when
 * NODE_ENV is development/test AND every allowed origin is plain HTTP on a
 * loopback host (see allowsInsecureLocalCookies). An HTTPS origin always gets
 * the secure cookie, whatever NODE_ENV says.
 */
export const PRODUCTION_SESSION_COOKIE = '__Host-bissinger_session';
export const LOCAL_SESSION_COOKIE = 'bissinger_session';

export interface SessionCookieConfig {
  name: string;
  options: CookieOptions;
}

/** Read per request so the attributes always match the running environment. */
export function getSessionCookieConfig(
  env: NodeJS.ProcessEnv = process.env,
): SessionCookieConfig {
  const insecureLocal = allowsInsecureLocalCookies(env);
  return {
    name: insecureLocal ? LOCAL_SESSION_COOKIE : PRODUCTION_SESSION_COOKIE,
    options: {
      httpOnly: true,
      secure: !insecureLocal,
      // Same-origin deployment (Caddy serves web and /api on one host) and the
      // local localhost:3000 -> localhost:4000 setup are both same-site, so Lax
      // never blocks a legitimate request. It is defence in depth only; CSRF
      // tokens are the actual protection.
      sameSite: 'lax',
      path: '/',
    },
  };
}

/** Minimal RFC 6265 cookie lookup; avoids a dependency for one header. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() !== name) {
      continue;
    }
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function readSessionCookie(req: Request): string | null {
  return readCookie(req, getSessionCookieConfig().name);
}

export function setSessionCookie(
  res: Response,
  value: string,
  expiresAt: Date,
) {
  const { name, options } = getSessionCookieConfig();
  clearStaleVariant(res, name);
  res.cookie(name, value, {
    ...options,
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
}

/**
 * Deletes the session cookie with exactly the name and attributes it was set
 * with. A leftover cookie of the other variant (from a configuration change
 * on the same host) is deleted too, so no stale duplicate survives a logout
 * or a new login.
 */
export function clearSessionCookie(res: Response) {
  const { name, options } = getSessionCookieConfig();
  res.clearCookie(name, options);
  clearStaleVariant(res, name);
}

/**
 * Only the unprefixed variant can be left over: a plain-HTTP localhost cannot
 * have stored a `__Host-` cookie, so the reverse case needs no cleanup.
 */
function clearStaleVariant(res: Response, currentName: string) {
  if (currentName === PRODUCTION_SESSION_COOKIE) {
    res.clearCookie(LOCAL_SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }
}
