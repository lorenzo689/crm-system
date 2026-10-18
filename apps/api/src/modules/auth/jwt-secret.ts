const DEV_FALLBACK_SECRET = 'dev-secret-nur-lokal-aendern-vor-prod';
const MIN_SECRET_LENGTH = 32;

/**
 * The fallback secret is only usable in local development; in every other
 * environment a missing or weak secret must stop the app from starting
 * instead of silently signing tokens with a publicly known key.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isDevelopment =
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

  if (secret && (secret.length >= MIN_SECRET_LENGTH || isDevelopment)) {
    return secret;
  }
  if (isDevelopment) {
    return DEV_FALLBACK_SECRET;
  }
  throw new Error(
    `JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters outside of development`,
  );
}
