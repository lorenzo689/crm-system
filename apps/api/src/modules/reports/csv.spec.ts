import { euro, safeCell, toCsv } from './csv';

describe('safeCell', () => {
  it('neutralises spreadsheet formulas in text', () => {
    expect(safeCell('=HYPERLINK("http://evil")')).toBe(
      `"'=HYPERLINK(""http://evil"")"`,
    );
    expect(safeCell('+49 89')).toBe("'+49 89");
    expect(safeCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('keeps negative numbers as numbers', () => {
    expect(safeCell(-5)).toBe('-5');
  });

  it('quotes delimiters and line breaks', () => {
    expect(safeCell('Müller; Söhne')).toBe('"Müller; Söhne"');
    expect(safeCell('a\nb')).toBe('"a\nb"');
  });
});

describe('toCsv', () => {
  it('starts with a BOM and uses CRLF', () => {
    const csv = toCsv(['A', 'B'], [[1, 'x']]);
    expect(csv.startsWith('\uFEFFA;B\r\n1;x')).toBe(true);
  });
});

describe('euro', () => {
  it('formats cents with a decimal comma', () => {
    expect(euro(123456)).toBe('1234,56');
    expect(euro(-5)).toBe('-0,05');
  });
});
