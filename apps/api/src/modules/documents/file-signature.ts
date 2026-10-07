import { BadRequestException } from '@nestjs/common';

/**
 * Magic-byte detection for the upload whitelist. file-type is ESM-only (no CJS
 * build) and cannot be loaded by this project's CJS/Jest setup, and the allowed
 * set is small, so the few signatures are checked directly.
 */
export type FileKind = 'pdf' | 'jpeg' | 'png' | 'ole' | 'docx' | 'xlsx' | 'dwg';

const KIND_LABELS: Record<FileKind, string> = {
  pdf: 'PDF',
  jpeg: 'JPEG-Bild',
  png: 'PNG-Bild',
  ole: 'Word/Excel (DOC/XLS)',
  docx: 'Word (DOCX)',
  xlsx: 'Excel (XLSX)',
  dwg: 'DWG-Zeichnung',
};

const OLE_SIGNATURE = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const ZIP_SIGNATURE = Buffer.from('504b0304', 'hex');

const KIND_BY_MIME: Record<string, FileKind> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'application/msword': 'ole',
  'application/vnd.ms-excel': 'ole',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/dwg': 'dwg',
  'image/vnd.dwg': 'dwg',
};

function startsWith(buffer: Buffer, signature: Buffer) {
  return (
    buffer.length >= signature.length &&
    buffer.subarray(0, signature.length).equals(signature)
  );
}

export function detectFileKind(buffer: Buffer): FileKind | null {
  if (buffer.subarray(0, 1024).includes('%PDF-')) {
    // The PDF spec allows leading junk, but only within the first 1024 bytes.
    return 'pdf';
  }
  if (startsWith(buffer, Buffer.from('ffd8ff', 'hex'))) return 'jpeg';
  if (startsWith(buffer, Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (startsWith(buffer, OLE_SIGNATURE)) return 'ole';
  if (/^AC10\d\d/.test(buffer.subarray(0, 6).toString('latin1'))) return 'dwg';
  if (startsWith(buffer, ZIP_SIGNATURE)) {
    // OOXML are ZIPs; entry names appear in local and central directory headers.
    if (buffer.includes('word/document.xml')) return 'docx';
    if (buffer.includes('xl/workbook.xml')) return 'xlsx';
  }
  return null;
}

export function assertFileSignature(buffer: Buffer, mimeType: string) {
  if (buffer.length === 0) {
    throw new BadRequestException('Die Datei ist leer.');
  }

  const expected = KIND_BY_MIME[mimeType];
  if (expected && detectFileKind(buffer) !== expected) {
    throw new BadRequestException(
      `Der Dateiinhalt passt nicht zum angegebenen Dateityp (erwartet: ${KIND_LABELS[expected]}). Die Datei wurde abgelehnt.`,
    );
  }
}
