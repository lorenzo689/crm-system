/**
 * Central authentication configuration. Every consumer (JwtModule, the passport
 * strategy, application bootstrap) reads from here so there is exactly one place
 * that decides which secret, algorithm and lifetime are acceptable.
 */
import { randomBytes } from 'crypto';

export const JWT_ALGORITHM = 'HS256' as const;
export const JWT_ALGORITHMS = [JWT_ALGORITHM];

const MIN_SECRET_LENGTH = 32;
const MIN_DISTINCT_CHARS = 10;
const MAX_EXPIRY_MINUTES = 8 * 60;
const DEFAULT_EXPIRY_MINUTES = 8 * 60;

/**
 * Local development without JWT_SECRET gets a secret generated once per
 * process. It is never printed or persisted, so there is no known value to
 * forge tokens with; the price is that dev sessions end on every restart.
 */
let processLocalSecret: string | undefined;
function getProcessLocalSecret() {
  processLocalSecret ??= randomBytes(48).toString('base64url');
  return processLocalSecret;
}

const KNOWN_WEAK_FRAGMENTS = [
  'dev-secret',
  'insecure',
  'changeme',
  'change-me',
  'replace-with',
  'your-secret',
  'your_secret',
  'secret-key',
  'example',
  'password',
  'ci-only',
];

function isLocalEnvironment(env: NodeJS.ProcessEnv) {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}

/** Returns a description of why the secret is unusable in production, or null. */
export function describeWeakSecret(secret: string): string | null {
  if (secret.length < MIN_SECRET_LENGTH) {
    return `must be at least ${MIN_SECRET_LENGTH} characters long`;
  }
  const lowered = secret.toLowerCase();
  if (KNOWN_WEAK_FRAGMENTS.some((fragment) => lowered.includes(fragment))) {
    return 'looks like a placeholder or development value';
  }
  if (new Set(secret).size < MIN_DISTINCT_CHARS) {
    return 'has too little variety; generate it randomly';
  }
  return null;
}

export function getJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;

  if (isLocalEnvironment(env)) {
    return secret || getProcessLocalSecret();
  }

  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set. Generate one with: openssl rand -base64 48',
    );
  }
  const problem = describeWeakSecret(secret);
  if (problem) {
    // Deliberately does not echo the value.
    throw new Error(`JWT_SECRET is not acceptable: it ${problem}.`);
  }
  return secret;
}

/** Token lifetime in seconds. Configurable via JWT_EXPIRES_IN_MINUTES, hard-capped at 8 hours. */
export function getJwtExpiresInSeconds(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.JWT_EXPIRES_IN_MINUTES;
  if (raw === undefined || raw === '') {
    return DEFAULT_EXPIRY_MINUTES * 60;
  }
  const minutes = Number(raw);
  if (
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > MAX_EXPIRY_MINUTES
  ) {
    throw new Error(
      `JWT_EXPIRES_IN_MINUTES must be a whole number between 1 and ${MAX_EXPIRY_MINUTES}`,
    );
  }
  return minutes * 60;
}

/**
 * Password reset is the only way back into a locked-out account, and its
 * answer must not depend on whether mail works. Production therefore refuses
 * to start without a mail transport instead of failing per request.
 */
export function assertMailConfig(env: NodeJS.ProcessEnv = process.env) {
  if (isLocalEnvironment(env)) {
    return;
  }
  if (!env.SMTP_HOST || !env.MAIL_FROM) {
    throw new Error(
      'SMTP_HOST and MAIL_FROM must be set outside development (password reset needs a mail transport).',
    );
  }
}

/** Fails fast at startup so a bad configuration never serves a single request. */
export function assertAuthConfig(env: NodeJS.ProcessEnv = process.env) {
  getJwtSecret(env);
  getJwtExpiresInSeconds(env);
  assertMailConfig(env);
}
