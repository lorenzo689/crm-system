import {
  assertAuthConfig,
  assertMailConfig,
  describeWeakSecret,
  getJwtExpiresInSeconds,
  getJwtSecret,
} from './auth-config';

const STRONG = 'k9Qm2xVb7LrTz4WcN8pYd1HfJs6GaEu3Xo5Bi0RtMwKq';

const env = (values: Record<string, string | undefined>) =>
  values as unknown as NodeJS.ProcessEnv;

describe('auth configuration', () => {
  describe('production-like environments', () => {
    it.each(['production', 'staging', undefined])(
      'refuses to start without JWT_SECRET (NODE_ENV=%s)',
      (nodeEnv) => {
        expect(() => assertAuthConfig(env({ NODE_ENV: nodeEnv }))).toThrow(
          /JWT_SECRET is not set/,
        );
      },
    );

    it.each([
      ['too short', 'short-secret'],
      ['the old development fallback', 'dev-secret-nur-lokal-aendern-vor-prod'],
      [
        'the .env.example placeholder',
        'replace-with-a-local-development-secret-min-32',
      ],
      ['a repeated character', 'a'.repeat(64)],
      ['an obvious password', 'my-super-password-that-is-long-enough-1234'],
    ])('rejects %s', (_label, secret) => {
      expect(() =>
        assertAuthConfig(env({ NODE_ENV: 'production', JWT_SECRET: secret })),
      ).toThrow(/not acceptable/);
    });

    it('never prints the rejected secret', () => {
      const secret = 'dev-secret-nur-lokal-aendern-vor-prod';
      try {
        getJwtSecret(env({ NODE_ENV: 'production', JWT_SECRET: secret }));
        fail('expected an error');
      } catch (error) {
        expect((error as Error).message).not.toContain(secret);
      }
    });

    it('refuses to start without a mail transport (password reset)', () => {
      expect(() =>
        assertAuthConfig(env({ NODE_ENV: 'production', JWT_SECRET: STRONG })),
      ).toThrow(/SMTP_HOST and MAIL_FROM/);
      expect(() =>
        assertMailConfig(
          env({ NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com' }),
        ),
      ).toThrow(/MAIL_FROM/);
      expect(() =>
        assertAuthConfig(
          env({
            NODE_ENV: 'production',
            JWT_SECRET: STRONG,
            SMTP_HOST: 'smtp.example.com',
            MAIL_FROM: 'noreply@example.com',
          }),
        ),
      ).not.toThrow();
    });

    it('does not require SMTP locally', () => {
      expect(() =>
        assertMailConfig(env({ NODE_ENV: 'development' })),
      ).not.toThrow();
    });

    it('accepts a strong random secret', () => {
      expect(
        getJwtSecret(env({ NODE_ENV: 'production', JWT_SECRET: STRONG })),
      ).toBe(STRONG);
    });
  });

  describe('local development', () => {
    it('generates a random per-process secret instead of a known constant', () => {
      const secret = getJwtSecret(env({ NODE_ENV: 'development' }));
      expect(secret.length).toBeGreaterThanOrEqual(32);
      expect(describeWeakSecret(secret)).toBeNull();
      // Stable inside the process so JwtModule and the strategy agree.
      expect(getJwtSecret(env({ NODE_ENV: 'development' }))).toBe(secret);
      expect(secret).not.toMatch(/dev-secret|insecure/i);
    });

    it('uses an explicit secret when given', () => {
      expect(getJwtSecret(env({ NODE_ENV: 'test', JWT_SECRET: 'abc' }))).toBe(
        'abc',
      );
    });
  });

  describe('token lifetime', () => {
    it('defaults to 8 hours', () => {
      expect(getJwtExpiresInSeconds(env({}))).toBe(8 * 3600);
    });

    it('is configurable within the cap', () => {
      expect(
        getJwtExpiresInSeconds(env({ JWT_EXPIRES_IN_MINUTES: '30' })),
      ).toBe(1800);
    });

    it.each(['481', '0', '-5', '1.5', 'abc', '99999'])(
      'rejects JWT_EXPIRES_IN_MINUTES=%s',
      (value) => {
        expect(() =>
          getJwtExpiresInSeconds(env({ JWT_EXPIRES_IN_MINUTES: value })),
        ).toThrow(/between 1 and 480/);
      },
    );
  });
});
