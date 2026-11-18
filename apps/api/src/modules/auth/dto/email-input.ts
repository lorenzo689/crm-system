import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

/**
 * Same normalization as the CLI (user-provisioning.normalizeEmail): surrounding
 * whitespace is ignored. Case is irrelevant because every lookup compares
 * case-insensitively and the database enforces uniqueness on lower(email).
 */
export function EmailInput() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsEmail(),
    MaxLength(254),
  );
}
