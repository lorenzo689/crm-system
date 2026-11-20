/**
 * Mirrors apps/api/src/modules/auth/password-policy.ts. The API is the source
 * of truth; this only gives users immediate feedback. Keep both in sync.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export function getPasswordRequirements(password: string) {
  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    specialCharacter: /[^A-Za-z0-9]/.test(password),
  };
}

export function isPasswordValid(password: string) {
  return (
    password.length <= PASSWORD_MAX_LENGTH &&
    Object.values(getPasswordRequirements(password)).every(Boolean)
  );
}
