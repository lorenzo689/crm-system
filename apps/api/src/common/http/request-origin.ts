import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const LOCAL_DEFAULT_ORIGIN = 'http://localhost:3000';

function isLocalEnvironment(env: NodeJS.ProcessEnv) {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}

/**
 * The explicit list of browser origins allowed to talk to the API (CORS and
 * the Origin check below). Exact matches only: scheme, host and port.
 */
export function getAllowedOrigins(env: NodeJS.ProcessEnv = process.env) {
  const configured = (env.WEB_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.length === 0 && isLocalEnvironment(env)) {
    return [LOCAL_DEFAULT_ORIGIN];
  }
  return configured;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseOrigin(origin: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`WEB_ORIGIN contains an invalid origin: ${origin}`);
  }
  if (parsed.origin !== origin) {
    throw new Error(
      `WEB_ORIGIN entries must be bare origins without path or trailing slash: ${origin}`,
    );
  }
  return parsed;
}

/** Plain-HTTP origin on this machine (the only place insecure cookies are allowed). */
function isLoopbackHttp(url: URL) {
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * Whether the session cookie may go without `Secure`/`__Host-`. True only when
 * NODE_ENV explicitly says development/test AND every allowed origin is plain
 * HTTP on a loopback host. Any HTTPS origin, any other host or any other
 * NODE_ENV means secure cookies; an accidental NODE_ENV=development on an HTTPS
 * deployment therefore does not weaken them.
 */
export function allowsInsecureLocalCookies(
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!isLocalEnvironment(env)) {
    return false;
  }
  const origins = getAllowedOrigins(env);
  return origins.every((origin) => {
    try {
      return isLoopbackHttp(new URL(origin));
    } catch {
      return false;
    }
  });
}

/**
 * Fails startup on an unsafe origin configuration:
 * - outside development/test: at least one origin, HTTPS only;
 * - development/test: HTTPS origins, or HTTP on loopback hosts only (never
 *   HTTP on an external domain), and never a mix of HTTP and HTTPS, which
 *   would need two different cookie configurations at once.
 */
export function assertOriginConfig(env: NodeJS.ProcessEnv = process.env) {
  const local = isLocalEnvironment(env);
  const origins = getAllowedOrigins(env);
  if (origins.length === 0) {
    throw new Error(
      'WEB_ORIGIN must be set outside development (e.g. https://erp.example.com).',
    );
  }
  const parsed = origins.map(parseOrigin);
  for (const url of parsed) {
    if (url.protocol === 'https:') continue;
    if (!local) {
      throw new Error(
        `WEB_ORIGIN entries must be bare https origins without path or trailing slash: ${url.origin}`,
      );
    }
    if (!isLoopbackHttp(url)) {
      throw new Error(
        `Plain-HTTP WEB_ORIGIN is only allowed for localhost/127.0.0.1/[::1] in development: ${url.origin}`,
      );
    }
  }
  const schemes = new Set(parsed.map((url) => url.protocol));
  if (schemes.size > 1) {
    throw new Error(
      'WEB_ORIGIN must not mix http and https origins (the session cookie is either Secure or not).',
    );
  }
}

function reject(res: Response, status: number, message: string) {
  // Distinct code, so clients never confuse this with a CSRF-token failure.
  res
    .status(status)
    .json({ statusCode: status, message, code: 'ORIGIN_REJECTED' });
}

/**
 * First CSRF layer for every state-changing request, authenticated or not
 * (login CSRF included):
 *
 * - An `Origin` header, which every current browser sends on POST/PUT/PATCH/
 *   DELETE, must be on the allowlist. `Origin: null` (sandboxed frames,
 *   some redirects) is rejected too.
 * - Without `Origin`, Fetch Metadata must not report a cross-site or
 *   same-site (sibling subdomain) request.
 * - Requests with neither header come from non-browser clients, which cannot
 *   carry a victim's cookies; the per-session CSRF token still applies to
 *   everything authenticated.
 *
 * The cookie-less auth endpoints additionally only accept application/json;
 * that check is bound to the routes (JsonBodyGuard), not to URL strings.
 */
export function createOriginGuardMiddleware(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (!allowed.has(origin)) {
        reject(res, 403, 'Anfrage von nicht erlaubter Herkunft');
        return;
      }
    } else {
      const site = req.headers['sec-fetch-site'];
      if (site === 'cross-site' || site === 'same-site') {
        reject(res, 403, 'Anfrage von nicht erlaubter Herkunft');
        return;
      }
    }

    next();
  };
}

/** API answers carry personal data and session state; never cache them. */
export function noStoreMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}
