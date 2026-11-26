import { addMonths, nextRunAfter } from './recurrence';

const d = (value: string) => new Date(`${value}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe('addMonths', () => {
  it('adds months and clamps to the end of shorter months', () => {
    expect(iso(addMonths(d('2026-01-31'), 1))).toBe('2026-02-28');
    expect(iso(addMonths(d('2028-01-31'), 1))).toBe('2028-02-29');
    expect(iso(addMonths(d('2026-11-15'), 3))).toBe('2027-02-15');
  });
});

describe('nextRunAfter', () => {
  it('moves one period ahead when on schedule', () => {
    expect(iso(nextRunAfter(d('2026-10-01'), 1, d('2026-10-01')))).toBe(
      '2026-11-01',
    );
  });

  it('skips missed periods instead of back-filling', () => {
    expect(iso(nextRunAfter(d('2026-01-01'), 1, d('2026-10-17')))).toBe(
      '2026-11-01',
    );
  });

  it('works for quarterly and yearly intervals', () => {
    expect(iso(nextRunAfter(d('2026-01-01'), 3, d('2026-01-01')))).toBe(
      '2026-04-01',
    );
    expect(iso(nextRunAfter(d('2026-01-01'), 12, d('2026-01-01')))).toBe(
      '2027-01-01',
    );
  });
});
