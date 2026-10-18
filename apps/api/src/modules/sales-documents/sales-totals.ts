export type PricedLine = {
  quantity: number;
  unitPriceCents: number;
  vatRateBp: number;
};

export type DocumentTotals = {
  lineNetCents: number[];
  netCents: number;
  vatCents: number;
  grossCents: number;
};

/**
 * All money is integer cents. VAT is computed per rate on the summed net
 * amount (not per line) so rounding matches what an invoice prints.
 */
export function calculateTotals(lines: PricedLine[]): DocumentTotals {
  const lineNetCents = lines.map((line) =>
    Math.round(line.quantity * line.unitPriceCents),
  );

  const netByRate = new Map<number, number>();
  lines.forEach((line, index) => {
    netByRate.set(
      line.vatRateBp,
      (netByRate.get(line.vatRateBp) ?? 0) + lineNetCents[index],
    );
  });

  let vatCents = 0;
  for (const [rateBp, net] of netByRate) {
    vatCents += Math.round((net * rateBp) / 10000);
  }

  const netCents = lineNetCents.reduce((sum, value) => sum + value, 0);
  return { lineNetCents, netCents, vatCents, grossCents: netCents + vatCents };
}
