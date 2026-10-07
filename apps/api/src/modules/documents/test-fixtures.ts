import { strToU8, zipSync } from 'fflate';

/** Minimal valid files for tests; no binary fixtures in the repo. */
export function makePdf(text: string | null): Buffer {
  const stream = text ? `BT /F1 24 Tf 40 100 Td (${text}) Tj ET` : '';
  return Buffer.from(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 800 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${stream.length}>>stream
${stream}
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R/Size 6>>
%%EOF`);
}

const CONTENT_TYPES = (main: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="${main}" ContentType="application/vnd.openxmlformats-officedocument.main+xml"/></Types>`;

export function makeDocx(text: string): Buffer {
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      ),
      '_rels/.rels': strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      ),
      'word/document.xml': strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      ),
    }),
  );
}

export function makeXlsx(sharedStrings: string[], number: number): Buffer {
  void CONTENT_TYPES;
  const strings = sharedStrings
    .map((value) => `<si><t>${value}</t></si>`)
    .join('');
  const cells = sharedStrings
    .map((_, index) => `<c r="A${index + 1}" t="s"><v>${index}</v></c>`)
    .join('');
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(CONTENT_TYPES('/xl/workbook.xml')),
      'xl/workbook.xml': strToU8(
        `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Tabelle1" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>`,
      ),
      'xl/sharedStrings.xml': strToU8(
        `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings}</sst>`,
      ),
      'xl/worksheets/sheet1.xml': strToU8(
        `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cells}<c r="B1"><v>${number}</v></c></row></sheetData></worksheet>`,
      ),
    }),
  );
}

export const PNG_HEADER = Buffer.from('89504e470d0a1a0a0000000d', 'hex');
export const JPEG_HEADER = Buffer.from('ffd8ffe000104a464946', 'hex');
export const OLE_HEADER = Buffer.from('d0cf11e0a1b11ae100000000', 'hex');
export const DWG_HEADER = Buffer.from(
  'AC1032\u0000\u0000\u0000\u0000',
  'latin1',
);
export const EXE_HEADER = Buffer.from('MZ\u0090\u0000\u0003\u0000', 'latin1');
