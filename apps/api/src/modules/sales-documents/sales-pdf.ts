import PDFDocument from 'pdfkit';

type PdfCompany = {
  legalName: string;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
  vatId?: string | null;
  taxNumber?: string | null;
  bankName?: string | null;
  iban?: string | null;
  bic?: string | null;
  invoiceFooter?: string | null;
};

type PdfDocumentInput = {
  type: 'QUOTE' | 'INVOICE' | 'CREDIT_NOTE';
  number: string;
  issueDate: Date;
  dueDate: Date | null;
  headerText: string | null;
  footerText: string | null;
  netCents: number;
  vatCents: number;
  grossCents: number;
  paidCents: number;
  creditedCents: number;
  dunningLevel: number;
  customer: { name: string; customerNumber: string };
  project: { name: string } | null;
  items: {
    description: string;
    quantity: unknown;
    unit: string;
    unitPriceCents: number;
    vatRateBp: number;
    netCents: number;
  }[];
};

const DUNNING_TITLES = ['', 'Zahlungserinnerung', '1. Mahnung', '2. Mahnung'];

const money = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});
const date = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

export function documentTitle(
  doc: Pick<PdfDocumentInput, 'type' | 'number' | 'dunningLevel'>,
) {
  if (doc.type === 'INVOICE' && doc.dunningLevel > 0) {
    return `${DUNNING_TITLES[doc.dunningLevel]} zu Rechnung ${doc.number}`;
  }
  const label =
    doc.type === 'QUOTE'
      ? 'Angebot'
      : doc.type === 'CREDIT_NOTE'
        ? 'Gutschrift'
        : 'Rechnung';
  return `${label} ${doc.number}`;
}

/** Renders a quote/invoice as an A4 PDF using only the built-in Helvetica font. */
export function renderSalesDocumentPdf(
  doc: PdfDocumentInput,
  company: PdfCompany,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const left = pdf.page.margins.left;
    const width = pdf.page.width - left - pdf.page.margins.right;

    // Sender block
    pdf
      .fontSize(13)
      .font('Helvetica-Bold')
      .text(company.legalName, { align: 'right' });
    pdf.fontSize(8.5).font('Helvetica').fillColor('#555');
    [
      company.street,
      [company.postalCode, company.city].filter(Boolean).join(' '),
      company.email,
      company.phone,
    ]
      .filter(Boolean)
      .forEach((line) => pdf.text(String(line), { align: 'right' }));

    // Recipient + meta
    pdf.moveDown(2).fillColor('#000').fontSize(10);
    const metaTop = pdf.y;
    pdf.font('Helvetica-Bold').text(doc.customer.name, left, metaTop);
    pdf
      .font('Helvetica')
      .fillColor('#555')
      .text(`Kundennr. ${doc.customer.customerNumber}`);
    pdf.fillColor('#000');
    const metaLines = [
      `Datum: ${date.format(doc.issueDate)}`,
      doc.dueDate
        ? `${doc.type === 'INVOICE' ? 'Fällig am' : 'Gültig bis'}: ${date.format(doc.dueDate)}`
        : null,
      doc.project ? `Projekt: ${doc.project.name}` : null,
    ].filter(Boolean) as string[];
    pdf.text(metaLines.join('\n'), left, metaTop, { width, align: 'right' });

    pdf
      .moveDown(3)
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(documentTitle(doc), left);
    pdf.font('Helvetica').fontSize(10).moveDown(0.5);

    const outstanding = doc.grossCents - doc.paidCents - doc.creditedCents;
    if (doc.type === 'INVOICE' && doc.dunningLevel > 0) {
      pdf.text(
        `Zu unserer Rechnung ${doc.number} vom ${date.format(doc.issueDate)} konnten wir bisher keinen (vollständigen) Zahlungseingang feststellen. Bitte überweisen Sie den offenen Betrag von ${money.format(outstanding / 100)} umgehend.`,
        { width },
      );
      pdf.moveDown();
    }
    if (doc.headerText) {
      pdf.text(doc.headerText, { width }).moveDown();
    }

    // Items table
    const cols = [
      { label: 'Pos.', width: 30, align: 'left' as const },
      {
        label: 'Beschreibung',
        width: width - 30 - 70 - 75 - 45 - 80,
        align: 'left' as const,
      },
      { label: 'Menge', width: 70, align: 'right' as const },
      { label: 'Einzel', width: 75, align: 'right' as const },
      { label: 'USt.', width: 45, align: 'right' as const },
      { label: 'Netto', width: 80, align: 'right' as const },
    ];
    const drawRow = (values: string[], bold = false) => {
      const top = pdf.y;
      let x = left;
      let rowHeight = 0;
      pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      values.forEach((value, index) => {
        const height = pdf.heightOfString(value, {
          width: cols[index].width - 4,
        });
        rowHeight = Math.max(rowHeight, height);
        pdf.text(value, x, top, {
          width: cols[index].width - 4,
          align: cols[index].align,
        });
        x += cols[index].width;
      });
      pdf.y = top + rowHeight + 4;
      pdf
        .moveTo(left, pdf.y - 2)
        .lineTo(left + width, pdf.y - 2)
        .strokeColor('#ddd')
        .stroke();
    };

    drawRow(
      cols.map((col) => col.label),
      true,
    );
    doc.items.forEach((item, index) => {
      if (pdf.y > pdf.page.height - 160) pdf.addPage();
      drawRow([
        String(index + 1),
        item.description,
        `${Number(item.quantity).toLocaleString('de-DE')} ${item.unit}`,
        money.format(item.unitPriceCents / 100),
        `${(item.vatRateBp / 100).toLocaleString('de-DE')} %`,
        money.format(item.netCents / 100),
      ]);
    });

    // Totals
    pdf.moveDown();
    const totals: [string, number, boolean][] = [
      ['Netto', doc.netCents, false],
      ['Umsatzsteuer', doc.vatCents, false],
      ['Gesamt', doc.grossCents, true],
    ];
    if (doc.type === 'INVOICE' && doc.creditedCents > 0) {
      totals.push(['Gutschriften', doc.creditedCents, false]);
    }
    if (doc.type === 'INVOICE' && doc.paidCents > 0) {
      totals.push(
        ['Bereits gezahlt', doc.paidCents, false],
        ['Offen', outstanding, true],
      );
    }
    totals.forEach(([label, cents, bold]) => {
      const top = pdf.y;
      pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      pdf.text(label, left + width - 220, top, { width: 120 });
      pdf.text(money.format(cents / 100), left + width - 100, top, {
        width: 100,
        align: 'right',
      });
    });

    if (doc.footerText) {
      pdf
        .moveDown(2)
        .font('Helvetica')
        .fontSize(10)
        .text(doc.footerText, left, pdf.y, { width });
    }

    // Footer with legal/bank data
    const footer = [
      company.invoiceFooter,
      [
        company.bankName,
        company.iban && `IBAN ${company.iban}`,
        company.bic && `BIC ${company.bic}`,
      ]
        .filter(Boolean)
        .join(' · '),
      [
        company.vatId && `USt-IdNr. ${company.vatId}`,
        company.taxNumber && `Steuernr. ${company.taxNumber}`,
      ]
        .filter(Boolean)
        .join(' · '),
    ]
      .filter(Boolean)
      .join('\n');
    if (footer) {
      pdf
        .moveDown(3)
        .fontSize(8)
        .fillColor('#666')
        .text(footer, left, pdf.y, { width });
    }

    pdf.end();
  });
}
