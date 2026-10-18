import { minAvailable } from './availability';

const d = (value: string) => new Date(`${value}T00:00:00Z`);

describe('minAvailable', () => {
  it('returns the full stock without bookings', () => {
    expect(minAvailable(10, [], d('2026-05-01'), d('2026-05-03'))).toBe(10);
  });

  it('subtracts overlapping bookings', () => {
    const bookings = [
      { quantity: 4, startsOn: d('2026-05-02'), endsOn: d('2026-05-04') },
    ];
    expect(minAvailable(10, bookings, d('2026-05-01'), d('2026-05-03'))).toBe(
      6,
    );
  });

  it('ignores bookings outside the requested range', () => {
    const bookings = [
      { quantity: 9, startsOn: d('2026-04-01'), endsOn: d('2026-04-30') },
      { quantity: 9, startsOn: d('2026-05-10'), endsOn: d('2026-05-12') },
    ];
    expect(minAvailable(10, bookings, d('2026-05-01'), d('2026-05-03'))).toBe(
      10,
    );
  });

  it('uses the busiest day of the range, not the sum of all bookings', () => {
    const bookings = [
      { quantity: 6, startsOn: d('2026-05-01'), endsOn: d('2026-05-01') },
      { quantity: 6, startsOn: d('2026-05-02'), endsOn: d('2026-05-02') },
    ];
    expect(minAvailable(10, bookings, d('2026-05-01'), d('2026-05-02'))).toBe(
      4,
    );
  });

  it('adds up bookings that overlap on the same day', () => {
    const bookings = [
      { quantity: 4, startsOn: d('2026-05-01'), endsOn: d('2026-05-03') },
      { quantity: 3, startsOn: d('2026-05-03'), endsOn: d('2026-05-05') },
    ];
    expect(minAvailable(10, bookings, d('2026-05-01'), d('2026-05-05'))).toBe(
      3,
    );
  });

  it('never returns a negative number', () => {
    const bookings = [
      { quantity: 20, startsOn: d('2026-05-01'), endsOn: d('2026-05-01') },
    ];
    expect(minAvailable(10, bookings, d('2026-05-01'), d('2026-05-01'))).toBe(
      0,
    );
  });
});
