import {
  MAX_EXTRACTED_CHARS,
  sanitizeExtractedText,
  TextExtractionService,
} from './text-extraction.service';
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
