import { Injectable, Logger } from '@nestjs/common';
import { unzipSync } from 'fflate';
import { extractRawText } from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

export const MAX_EXTRACTED_CHARS = 500_000;
const EXTRACTION_TIMEOUT_MS = 30_000;
const MAX_XML_ENTRY_BYTES = 100 * 1024 * 1024;

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function isTextExtractable(mimeType: string): boolean {
  return (
    mimeType === 'application/pdf' ||
    mimeType === DOCX_MIME ||
    mimeType === XLSX_MIME
  );
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&amp;/g, '&');
}

function joinTextRuns(xml: string): string {
  return Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g))
    .map((match) => decodeXmlEntities(match[1]))
    .join('');
}

/** Cell values of all sheets (shared/inline strings and numbers) as text. */
export function extractXlsxText(buffer: Buffer): string {
  const files = unzipSync(new Uint8Array(buffer), {
    filter: (file) =>
      file.originalSize <= MAX_XML_ENTRY_BYTES &&
      (file.name === 'xl/sharedStrings.xml' ||
        /^xl\/worksheets\/[^/]+\.xml$/.test(file.name)),
  });
  const decoder = new TextDecoder('utf-8');

  const sharedXml = files['xl/sharedStrings.xml'];
  const shared = sharedXml
    ? Array.from(
        decoder.decode(sharedXml).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g),
      ).map((match) => joinTextRuns(match[1]))
    : [];

  const values: string[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (name === 'xl/sharedStrings.xml') continue;
    const sheet = decoder.decode(data);
    for (const cell of sheet.matchAll(
      /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const type = /\bt="([^"]*)"/.exec(cell[1])?.[1];
      const body = cell[2] ?? '';
      const raw = /<v>([^<]*)<\/v>/.exec(body)?.[1];

      if (type === 's' && raw !== undefined) {
        values.push(shared[Number(raw)] ?? '');
      } else if (type === 'inlineStr') {
        values.push(joinTextRuns(body));
      } else if (type === 'str' && raw !== undefined) {
        values.push(decodeXmlEntities(raw));
      } else if ((type === undefined || type === 'n') && raw !== undefined) {
        values.push(raw);
      }
    }
  }
  return values.join('\n');
}

function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(`${label}: timeout after ${EXTRACTION_TIMEOUT_MS} ms`),
        ),
      EXTRACTION_TIMEOUT_MS,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Null bytes break Postgres text columns; cap the size, empty text becomes null. */
export function sanitizeExtractedText(text: string): string | null {
  const cleaned = text
    .replaceAll('\u0000', '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
  return cleaned.length > 0 ? cleaned : null;
}

@Injectable()
export class TextExtractionService {
  private readonly logger = new Logger(TextExtractionService.name);

  /**
   * Returns the text layer of PDF/DOCX/XLSX files; null for everything else
   * and for files without text (e.g. scanned PDFs). Throws on broken files.
   */
  async extract(buffer: Buffer, mimeType: string): Promise<string | null> {
    if (!isTextExtractable(mimeType)) return null;

    const raw = await withTimeout(
      this.extractRaw(buffer, mimeType),
      `text extraction (${mimeType})`,
    );
    return sanitizeExtractedText(raw);
  }

  /** Never throws: extraction problems must not break uploads. */
  async extractSafely(
    buffer: Buffer,
    mimeType: string,
    context: string,
  ): Promise<string | null> {
    try {
      return await this.extract(buffer, mimeType);
    } catch (error) {
      this.logger.warn(
        `Text extraction failed for ${context}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async extractRaw(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(buffer), {
        verbosity: 0,
      });
      try {
        const { text } = await extractText(pdf, { mergePages: true });
        return text;
      } finally {
        await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
      }
    }

    if (mimeType === DOCX_MIME) {
      const { value } = await extractRawText({ buffer });
      return value;
    }

    return extractXlsxText(buffer);
  }
}
