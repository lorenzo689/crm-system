export type ParsedTransaction = {
  bookingDate: Date;
  amountCents: number;
  counterparty: string | null;
  purpose: string | null;
};

const HEADER_ALIASES = {
  date: [
    'buchungstag',
    'buchungsdatum',
    'datum',
    'valuta',
    'valutadatum',
    'booking date',
    'date',
  ],
  amount: ['betrag', 'betrag (eur)', 'umsatz', 'amount', 'betrag in eur'],
  counterparty: [
    'name zahlungsbeteiligter',
    'zahlungsbeteiligter',
    'beguenstigter/zahlungspflichtiger',
    'begünstigter/zahlungspflichtiger',
    'auftraggeber/empfänger',
    'auftraggeber / begünstigter',
    'empfänger',
    'auftraggeber',
    'name',
    'counterparty',
  ],
  purpose: ['verwendungszweck', 'buchungstext', 'zweck', 'purpose', 'details'],
} as const;

/** Splits one CSV line, honouring double quotes and escaped quotes. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function detectDelimiter(headerLine: string) {
  const counts = [';', '\t', ','].map((delimiter) => ({
    delimiter,
    count: headerLine.split(delimiter).length,
  }));
  return counts.sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseGermanAmountToCents(raw: string): number | null {
  let value = raw.replace(/[^\d,.\-+]/g, '');
  if (!value) return null;
  if (value.includes(',')) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if ((value.match(/\./g) ?? []).length > 1) {
    value = value.replace(/\./g, '');
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

export function parseBankDate(raw: string): Date | null {
  const value = raw.trim();
  let match = /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/.exec(value);
  if (match) {
    const year =
      match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return validDate(year, Number(match[2]), Number(match[1]));
  }
  match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match)
    return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  return null;
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

/**
 * Parses bank statement CSVs as exported by German banks (semicolon or
 * comma separated, German or ISO dates, comma decimals). Some banks put
 * preamble lines before the header; the header is the first line that
 * contains both a date and an amount column.
 */
export function parseBankCsv(csv: string): {
  transactions: ParsedTransaction[];
  skipped: number;
} {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');

  for (
    let headerIndex = 0;
    headerIndex < Math.min(lines.length, 30);
    headerIndex++
  ) {
    const delimiter = detectDelimiter(lines[headerIndex]);
    const headers = splitLine(lines[headerIndex], delimiter).map((cell) =>
      cell.toLowerCase(),
    );
    const column = (aliases: readonly string[]) =>
      headers.findIndex((header) => aliases.includes(header));

    const dateColumn = column(HEADER_ALIASES.date);
    const amountColumn = column(HEADER_ALIASES.amount);
    if (dateColumn === -1 || amountColumn === -1) continue;

    const counterpartyColumn = column(HEADER_ALIASES.counterparty);
    const purposeColumn = column(HEADER_ALIASES.purpose);

    const transactions: ParsedTransaction[] = [];
    let skipped = 0;
    for (const line of lines.slice(headerIndex + 1)) {
      const cells = splitLine(line, delimiter);
      const bookingDate = parseBankDate(cells[dateColumn] ?? '');
      const amountCents = parseGermanAmountToCents(cells[amountColumn] ?? '');
      if (!bookingDate || amountCents === null) {
        skipped++;
        continue;
      }
      transactions.push({
        bookingDate,
        amountCents,
        counterparty:
          (counterpartyColumn >= 0 ? cells[counterpartyColumn] : '')?.slice(
            0,
            200,
          ) || null,
        purpose:
          (purposeColumn >= 0 ? cells[purposeColumn] : '')?.slice(0, 1000) ||
          null,
      });
    }
    return { transactions, skipped };
  }
  return { transactions: [], skipped: lines.length };
}
