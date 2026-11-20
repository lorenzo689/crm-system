import { UnsupportedMediaTypeException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  createOriginGuardMiddleware,
  getAllowedOrigins,
} from '../../common/http/request-origin';
import {
  CSRF_ERROR_CODE,
  CSRF_FAILURE_MESSAGE,
  CsrfTokenException,
  csrfTokenFor,
  isStateChangingMethod,
  isValidCsrfToken,
} from './csrf';
import { JsonBodyGuard } from './guards/json-body.guard';
import {
  clearSessionCookie,
  getSessionCookieConfig,
  LOCAL_SESSION_COOKIE,
  PRODUCTION_SESSION_COOKIE,
  readCookie,
} from './session-cookie';

const env = (values: Record<string, string | undefined>) =>
  values as unknown as NodeJS.ProcessEnv;

describe('session cookie configuration', () => {
  it.each(['production', 'staging', undefined])(
    'is __Host-, Secure, HttpOnly, Lax, Path=/ without Domain (NODE_ENV=%s)',
    (nodeEnv) => {
      const { name, options } = getSessionCookieConfig(
        env({ NODE_ENV: nodeEnv }),
      );
      expect(name).toBe(PRODUCTION_SESSION_COOKIE);
      expect(name.startsWith('__Host-')).toBe(true);
      expect(options).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
      expect(options).not.toHaveProperty('domain');
    },
  );

  it.each(['development', 'test'])(
    'drops only the Secure flag and prefix for plain-HTTP %s',
    (nodeEnv) => {
      const { name, options } = getSessionCookieConfig(
        env({ NODE_ENV: nodeEnv }),
      );
      expect(name).toBe(LOCAL_SESSION_COOKIE);
      expect(options).toMatchObject({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
      });
    },
  );

  describe('R2-02: HTTPS always means Secure + __Host-, whatever NODE_ENV says', () => {
    const secure = { name: PRODUCTION_SESSION_COOKIE, secure: true };
    const insecure = { name: LOCAL_SESSION_COOKIE, secure: false };
    it.each([
      [
        'HTTP localhost, development',
        'development',
        'http://localhost:3000',
        insecure,
      ],
      ['HTTP 127.0.0.1, test', 'test', 'http://127.0.0.1:3000', insecure],
      ['HTTP [::1], development', 'development', 'http://[::1]:3000', insecure],
      [
        'HTTPS, development (misconfigured production)',
        'development',
        'https://erp.example.com',
        secure,
      ],
      [
        'HTTPS localhost, development',
        'development',
        'https://localhost:3000',
        secure,
      ],
      ['HTTPS, production', 'production', 'https://erp.example.com', secure],
      [
        'HTTP on an external host, development',
        'development',
        'http://erp.example.com',
        secure,
      ],
      [
        'HTTP localhost but production',
        'production',
        'http://localhost:3000',
        secure,
      ],
      [
        'mixed HTTP localhost + HTTPS, development',
        'development',
        'http://localhost:3000,https://erp.example.com',
        secure,
      ],
      ['garbage origin, development', 'development', 'not a url', secure],
      [
        'no NODE_ENV, HTTP localhost',
        undefined,
        'http://localhost:3000',
        secure,
      ],
    ])('%s', (_label, nodeEnv, origin, expected) => {
      const { name, options } = getSessionCookieConfig(
        env({ NODE_ENV: nodeEnv, WEB_ORIGIN: origin }),
      );
      expect({ name, secure: options.secure }).toEqual(expected);
      expect(options).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
      expect(options).not.toHaveProperty('domain');
    });
  });

  describe('cookie deletion', () => {
    function recorder() {
      const cleared: { name: string; options: Record<string, unknown> }[] = [];
      const res = {
        clearCookie: (name: string, options: Record<string, unknown>) => {
          cleared.push({ name, options });
        },
      } as unknown as Response;
      return { res, cleared };
    }
    const withEnv = (values: Record<string, string>, run: () => void) => {
      const previous = Object.fromEntries(
        Object.keys(values).map((key) => [key, process.env[key]]),
      );
      Object.assign(process.env, values);
      try {
        run();
      } finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    };

    it('deletes the secure cookie with its exact attributes and any stale local duplicate', () => {
      withEnv(
        { NODE_ENV: 'production', WEB_ORIGIN: 'https://erp.example.com' },
        () => {
          const { res, cleared } = recorder();
          clearSessionCookie(res);
          expect(cleared).toEqual([
            {
              name: PRODUCTION_SESSION_COOKIE,
              options: {
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                path: '/',
              },
            },
            {
              name: LOCAL_SESSION_COOKIE,
              options: { httpOnly: true, sameSite: 'lax', path: '/' },
            },
          ]);
        },
      );
    });

    it('deletes only the local cookie on plain-HTTP localhost', () => {
      withEnv(
        { NODE_ENV: 'development', WEB_ORIGIN: 'http://localhost:3000' },
        () => {
          const { res, cleared } = recorder();
          clearSessionCookie(res);
          expect(cleared).toEqual([
            {
              name: LOCAL_SESSION_COOKIE,
              options: {
                httpOnly: true,
                secure: false,
                sameSite: 'lax',
                path: '/',
              },
            },
          ]);
        },
      );
    });
  });

  it('reads exactly the named cookie', () => {
    const req = {
      headers: { cookie: 'a=1; bissinger_session_x=2; bissinger_session=v%3D' },
    } as unknown as Request;
    expect(readCookie(req, 'bissinger_session')).toBe('v=');
    expect(readCookie(req, 'missing')).toBeNull();
    const broken = {
      headers: { cookie: 'bissinger_session=%E0%A4%A' },
    } as unknown as Request;
    expect(readCookie(broken, 'bissinger_session')).toBeNull();
  });
});

describe('CSRF tokens', () => {
  it('R2-01: the rejection is readable German and carries a machine-readable code', () => {
    expect(CSRF_FAILURE_MESSAGE).toBe('CSRF-Pr\u00fcfung fehlgeschlagen');
    expect(new CsrfTokenException().getResponse()).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'CSRF-Pr\u00fcfung fehlgeschlagen',
      code: CSRF_ERROR_CODE,
    });
  });

  it('are bound to the session', () => {
    expect(csrfTokenFor('session-a')).toBe(csrfTokenFor('session-a'));
    expect(csrfTokenFor('session-a')).not.toBe(csrfTokenFor('session-b'));
    expect(isValidCsrfToken('session-a', csrfTokenFor('session-a'))).toBe(true);
    expect(isValidCsrfToken('session-a', csrfTokenFor('session-b'))).toBe(
      false,
    );
  });

  it.each([undefined, '', 'x', ['a', 'b']])('rejects %p', (value) => {
    expect(isValidCsrfToken('session-a', value)).toBe(false);
  });

  it('treats everything except GET/HEAD/OPTIONS as state-changing', () => {
    for (const method of [
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'post',
      'PROPFIND',
    ]) {
      expect(isStateChangingMethod(method)).toBe(true);
    }
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(isStateChangingMethod(method)).toBe(false);
    }
  });
});

describe('origin allowlist', () => {
  it('defaults to localhost:3000 only in local environments', () => {
    expect(getAllowedOrigins(env({ NODE_ENV: 'development' }))).toEqual([
      'http://localhost:3000',
    ]);
    expect(getAllowedOrigins(env({ NODE_ENV: 'production' }))).toEqual([]);
    expect(
      getAllowedOrigins(
        env({ WEB_ORIGIN: ' https://a.example , https://b.example ' }),
      ),
    ).toEqual(['https://a.example', 'https://b.example']);
  });

  function run(method: string, headers: Record<string, string>, path = '/x') {
    const middleware = createOriginGuardMiddleware(['https://erp.example.com']);
    const req = {
      method,
      path,
      headers,
      is: (type: string) =>
        (headers['content-type'] ?? '').startsWith(type) ? type : false,
    } as unknown as Request;
    let status = 0;
    let passed = false;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {
        return this;
      },
    };
    middleware(req, res as never, () => {
      passed = true;
    });
    return passed ? 'next' : status;
  }

  it('lets safe methods through regardless of origin', () => {
    expect(run('GET', { origin: 'https://evil.example' })).toBe('next');
  });

  it('checks the Origin header of state-changing requests exactly', () => {
    expect(run('POST', { origin: 'https://erp.example.com' })).toBe('next');
    expect(run('POST', { origin: 'https://evil.example' })).toBe(403);
    expect(run('POST', { origin: 'null' })).toBe(403);
    expect(
      run('POST', { origin: 'https://erp.example.com.evil.example' }),
    ).toBe(403);
    expect(run('DELETE', { origin: 'http://erp.example.com' })).toBe(403);
  });

  it('uses Fetch Metadata when the Origin header is missing', () => {
    expect(run('POST', { 'sec-fetch-site': 'cross-site' })).toBe(403);
    expect(run('POST', { 'sec-fetch-site': 'same-site' })).toBe(403);
    expect(run('POST', { 'sec-fetch-site': 'same-origin' })).toBe('next');
    expect(run('POST', {})).toBe('next');
  });

  it('reports its rejections with a code distinct from CSRF failures', () => {
    const middleware = createOriginGuardMiddleware(['https://erp.example.com']);
    let body: unknown;
    const res = {
      status() {
        return this;
      },
      json(value: unknown) {
        body = value;
        return this;
      },
    };
    middleware(
      {
        method: 'POST',
        path: '/x',
        headers: { origin: 'https://evil.example' },
      } as unknown as Request,
      res as never,
      () => undefined,
    );
    expect(body).toMatchObject({ statusCode: 403, code: 'ORIGIN_REJECTED' });
  });
});

describe('R2-03: JsonBodyGuard (bound to the auth routes)', () => {
  const contextFor = (contentType: string | undefined) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          is: (type: string) => {
            if (contentType === undefined) return null;
            return contentType.split(';')[0].trim() === type ? type : false;
          },
        }),
      }),
    }) as unknown as ExecutionContext;
  const guard = new JsonBodyGuard();

  it.each([
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=x',
    'text/plain',
    'application/vnd.api+json',
    undefined,
  ])('rejects %p with 415', (contentType) => {
    expect(() => guard.canActivate(contextFor(contentType))).toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it.each(['application/json', 'application/json; charset=utf-8'])(
    'accepts %p',
    (contentType) => {
      expect(guard.canActivate(contextFor(contentType))).toBe(true);
    },
  );
});
