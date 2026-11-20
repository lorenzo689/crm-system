import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('keeps only the first character and the domain', () => {
    expect(maskEmail('max.mustermann@bissinger-lights.de')).toBe(
      'm***@bissinger-lights.de',
    );
  });

  it('never returns the local part', () => {
    expect(maskEmail('ab@example.com')).not.toContain('ab@');
  });

  it('handles malformed input without leaking it', () => {
    expect(maskEmail('no-at-sign')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
  });
});
