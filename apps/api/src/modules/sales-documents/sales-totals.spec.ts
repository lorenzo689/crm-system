import { calculateTotals } from './sales-totals';

describe('calculateTotals', () => {
  it('sums net, vat and gross', () => {
    const totals = calculateTotals([
      { quantity: 2, unitPriceCents: 10000, vatRateBp: 1900 },
      { quantity: 1.5, unitPriceCents: 3333, vatRateBp: 700 },
    ]);
    expect(totals.lineNetCents).toEqual([20000, 5000]);
    expect(totals.netCents).toBe(25000);
    expect(totals.vatCents).toBe(3800 + 350);
    expect(totals.grossCents).toBe(25000 + 4150);
  });

  it('rounds vat once per rate, not per line', () => {
    const totals = calculateTotals([
      { quantity: 1, unitPriceCents: 333, vatRateBp: 1900 },
      { quantity: 1, unitPriceCents: 333, vatRateBp: 1900 },
      { quantity: 1, unitPriceCents: 333, vatRateBp: 1900 },
    ]);
    expect(totals.netCents).toBe(999);
    expect(totals.vatCents).toBe(190);
  });

  it('handles zero vat and empty input', () => {
    expect(
      calculateTotals([{ quantity: 3, unitPriceCents: 100, vatRateBp: 0 }])
        .grossCents,
    ).toBe(300);
    expect(calculateTotals([]).grossCents).toBe(0);
  });
});
