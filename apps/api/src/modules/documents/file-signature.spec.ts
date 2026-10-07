import { assertFileSignature, detectFileKind } from './file-signature';
import {
  DWG_HEADER,
  EXE_HEADER,
  JPEG_HEADER,
  OLE_HEADER,
  PNG_HEADER,
  makeDocx,
  makePdf,
  makeXlsx,
} from './test-fixtures';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('file signature check', () => {
  it.each([
    ['application/pdf', makePdf('x')],
    ['image/jpeg', JPEG_HEADER],
    ['image/png', PNG_HEADER],
    ['application/msword', OLE_HEADER],
    ['application/vnd.ms-excel', OLE_HEADER],
    [DOCX_MIME, makeDocx('x')],
    [XLSX_MIME, makeXlsx(['x'], 1)],
    ['image/vnd.dwg', DWG_HEADER],
    ['application/dwg', DWG_HEADER],
  ])('accepts a genuine file for %s', (mimeType, buffer) => {
    expect(() => assertFileSignature(buffer, mimeType)).not.toThrow();
  });

  it('detects OOXML as docx/xlsx and not as the other', () => {
    expect(detectFileKind(makeDocx('x'))).toBe('docx');
    expect(detectFileKind(makeXlsx(['x'], 1))).toBe('xlsx');
  });

  it.each([
    ['application/pdf', EXE_HEADER],
    ['image/png', JPEG_HEADER],
    ['image/jpeg', PNG_HEADER],
    [DOCX_MIME, makeXlsx(['x'], 1)],
    [XLSX_MIME, makeDocx('x')],
    [DOCX_MIME, PNG_HEADER],
    ['image/vnd.dwg', makePdf('x')],
    ['application/msword', makeDocx('x')],
  ])('rejects disguised content for %s', (mimeType, buffer) => {
    expect(() => assertFileSignature(buffer, mimeType)).toThrow(
      'Dateiinhalt passt nicht zum angegebenen Dateityp',
    );
  });

  it('rejects an empty file', () => {
    expect(() =>
      assertFileSignature(Buffer.alloc(0), 'application/pdf'),
    ).toThrow('Die Datei ist leer');
  });

  it('rejects a plain ZIP that is neither docx nor xlsx', () => {
    const zip = Buffer.from('504b03040a000000', 'hex');
    expect(() => assertFileSignature(zip, DOCX_MIME)).toThrow('DOCX');
  });
});
