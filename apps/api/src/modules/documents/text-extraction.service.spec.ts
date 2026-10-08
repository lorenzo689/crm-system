import {
  MAX_EXTRACTED_CHARS,
  sanitizeExtractedText,
  TextExtractionService,
} from './text-extraction.service';
import { strToU8, zipSync } from 'fflate';
import { PNG_HEADER, makeDocx, makePdf, makeXlsx } from './test-fixtures';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('TextExtractionService', () => {
  const service = new TextExtractionService();

  it('extracts the text layer of a PDF', async () => {
    await expect(
      service.extract(makePdf('Gewaehrleistung drei Jahre'), 'application/pdf'),
    ).resolves.toContain('Gewaehrleistung drei Jahre');
  });

  it('returns null for a PDF without text layer (scan)', async () => {
    await expect(
      service.extract(makePdf(null), 'application/pdf'),
    ).resolves.toBeNull();
  });

  it('extracts DOCX text', async () => {
    await expect(
      service.extract(makeDocx('Lieferbedingungen Frankfurt'), DOCX_MIME),
    ).resolves.toContain('Lieferbedingungen Frankfurt');
  });

  it('extracts XLSX strings and numbers with entities decoded', async () => {
    const text = await service.extract(
      makeXlsx(['Artikel &amp; Zubehoer', 'Leuchte'], 4711),
      XLSX_MIME,
    );

    expect(text).toContain('Artikel & Zubehoer');
    expect(text).toContain('Leuchte');
    expect(text).toContain('4711');
  });

  it('extracts all sheets and skips empty cells', async () => {
    const ns =
      'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const buffer = Buffer.from(
      zipSync({
        'xl/workbook.xml': strToU8('<workbook/>'),
        'xl/sharedStrings.xml': strToU8(
          `<sst ${ns}><si><t>Alpha</t></si><si><r><t>Be</t></r><r><t>ta</t></r></si></sst>`,
        ),
        'xl/worksheets/sheet1.xml': strToU8(
          `<worksheet ${ns}><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1"/><c r="C1" s="1"></c></row></sheetData></worksheet>`,
        ),
        'xl/worksheets/sheet2.xml': strToU8(
          `<worksheet ${ns}><sheetData><row><c r="A1" t="s"><v>1</v></c><c r="B1" t="inlineStr"><is><t>Gamma</t></is></c></row></sheetData></worksheet>`,
        ),
      }),
    );

    const text = await service.extract(buffer, XLSX_MIME);

    expect(text?.split('\n')).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it.each([
    ['XLSX', XLSX_MIME, 'xl/worksheets/sheet1.xml'],
    ['DOCX', DOCX_MIME, 'word/document.xml'],
  ])(
    'rejects a highly expanding %s archive (zip bomb)',
    async (_, mime, entry) => {
      // 60 MB of zeros compresses to a few KB.
      const bomb = Buffer.from(
        zipSync({ [entry]: new Uint8Array(60 * 1024 * 1024) }, { level: 9 }),
      );
      expect(bomb.length).toBeLessThan(1024 * 1024);

      await expect(service.extract(bomb, mime)).rejects.toThrow(/expands to/);
      await expect(
        service.extractSafely(bomb, mime, 'bomb'),
      ).resolves.toBeNull();
    },
  );

  it.each([
    'image/png',
    'image/vnd.dwg',
    'application/msword',
    'application/vnd.ms-excel',
  ])('returns null without extraction for %s', async (mimeType) => {
    await expect(service.extract(PNG_HEADER, mimeType)).resolves.toBeNull();
  });

  it('extractSafely swallows errors of broken files', async () => {
    await expect(
      service.extractSafely(
        Buffer.from('%PDF-1.4 kaputt'),
        'application/pdf',
        'x',
      ),
    ).resolves.toBeNull();
    await expect(
      service.extractSafely(Buffer.from('keine zip'), DOCX_MIME, 'x'),
    ).resolves.toBeNull();
    await expect(
      service.extractSafely(Buffer.from('keine zip'), XLSX_MIME, 'x'),
    ).resolves.toBeNull();
  });
});

describe('sanitizeExtractedText', () => {
  it('removes null bytes', () => {
    expect(sanitizeExtractedText('a\u0000b')).toBe('ab');
  });

  it('caps the length', () => {
    expect(
      sanitizeExtractedText('x'.repeat(MAX_EXTRACTED_CHARS + 100)),
    ).toHaveLength(MAX_EXTRACTED_CHARS);
  });

  it('turns empty or whitespace-only text into null', () => {
    expect(sanitizeExtractedText(' \n\t ')).toBeNull();
    expect(sanitizeExtractedText('')).toBeNull();
  });
});
