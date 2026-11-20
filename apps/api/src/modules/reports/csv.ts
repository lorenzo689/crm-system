/**
 * Excel and LibreOffice execute cells that start with = + - @ as formulas.
 * User-controlled text (customer names, descriptions) therefore gets a
 * leading apostrophe, which keeps it a plain string.
 */
export function safeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[;"\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export const euro = (cents: number) =>
  (cents / 100).toFixed(2).replace('.', ',');

export const isoDay = (date: Date | null | undefined) =>
  date ? date.toISOString().slice(0, 10) : '';

/** Semicolon separated, UTF-8 with BOM: opens correctly in German Excel. */
export function toCsv(
  header: string[],
  rows: (string | number | null | undefined)[][],
) {
  const lines = [header, ...rows].map((row) => row.map(safeCell).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
