import {
  parseBankCsv,
  parseBankDate,
  parseGermanAmountToCents,
} from './bank-csv';

describe('parseGermanAmountToCents', () => {
  it.each([
    ['1.234,56', 123456],
    ['-89,00', -8900],
    ['12,5', 1250],
    ['+1.000.000,01', 100000001],
    ['1234.56', 123456],
    ['119,00 EUR', 11900],
  ])('%s -> %i', (raw, expected) => {
    expect(parseGermanAmountToCents(raw)).toBe(expected);
  });

  it('returns null for text', () => {
    expect(parseGermanAmountToCents('abc')).toBeNull();
  });
});

describe('parseBankDate', () => {
  it('reads German and ISO dates and rejects invalid ones', () => {
    expect(parseBankDate('17.10.2026')?.toISOString()).toContain('2026-10-17');
    expect(parseBankDate('17.10.26')?.toISOString()).toContain('2026-10-17');
    expect(parseBankDate('2026-10-17')?.toISOString()).toContain('2026-10-17');
    expect(parseBankDate('31.02.2026')).toBeNull();
    expect(parseBankDate('morgen')).toBeNull();
  });
});

describe('parseBankCsv', () => {
  it('parses a semicolon export with preamble and quoted fields', () => {
    const csv = [
      'Umsatzanzeige;Konto 123',
      '',
      'Buchungstag;Valuta;Name Zahlungsbeteiligter;Verwendungszweck;Betrag',
      '17.10.2026;17.10.2026;"Kunde; GmbH";"Rechnung RE-2026-0001, danke";1.071,00',
      '18.10.2026;18.10.2026;Lieferant AG;Rechnung 4711;-250,00',
      'kaputte;Zeile',
    ].join('\n');
    const { transactions, skipped } = parseBankCsv(csv);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      amountCents: 107100,
      counterparty: 'Kunde; GmbH',
      purpose: 'Rechnung RE-2026-0001, danke',
    });
    expect(transactions[1].amountCents).toBe(-25000);
    expect(skipped).toBe(1);
  });

  it('handles comma separated ISO exports with a BOM', () => {
    const csv =
      '\uFEFFdate,amount,name,purpose\n2026-10-17,"1234.56",ACME,Zahlung';
    const { transactions } = parseBankCsv(csv);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].amountCents).toBe(123456);
  });

  it('returns nothing when no header is recognisable', () => {
    expect(parseBankCsv('a;b;c\n1;2;3').transactions).toEqual([]);
  });
});
