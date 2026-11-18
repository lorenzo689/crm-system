import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
export const PASSWORD_REQUIREMENTS_MESSAGE = `Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen sowie Groß- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen enthalten`;

/** Single source of truth for password rules (DTOs and the CLI). */
export function validatePassword(password: string): string | null {
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH ||
    !PASSWORD_PATTERN.test(password)
  ) {
    return PASSWORD_REQUIREMENTS_MESSAGE;
  }
  return null;
}

export function StrongPassword() {
  return applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_REQUIREMENTS_MESSAGE }),
    MaxLength(PASSWORD_MAX_LENGTH),
    Matches(PASSWORD_PATTERN, { message: PASSWORD_REQUIREMENTS_MESSAGE }),
  );
}
