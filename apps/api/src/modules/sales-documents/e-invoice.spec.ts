import {
  countryCode,
  missingEInvoiceData,
  renderXRechnung,
  type EInvoiceInput,
} from './e-invoice';

const input: EInvoiceInput = {
  type: 'INVOICE',
  number: 'RE-2026-0001',
  issueDate: new Date('2026-10-17T00:00:00Z'),
  dueDate: new Date('2026-10-31T00:00:00Z'),
  customerNumber: 'K-100',
  items: [
    {
      description: 'Moving Head <Miete> & Technik',
      quantity: 4,
      unit: 'Stk',
      unitPriceCents: 8900,
      vatRateBp: 1900,
    },
    {
      description: 'Techniker',
      quantity: 8,
      unit: 'Std',
      unitPriceCents: 5500,
      vatRateBp: 1900,
    },
  ],
  seller: {
    name: 'Bissinger Lights',
    street: 'Lichtstr. 1',
    postalCode: '80331',
    city: 'München',
    vatId: 'DE123456789',
    email: 'info@bissinger-lights.de',
    iban: 'DE02 1203 0000 0000 2020 51',
  },
  buyer: {
    name: 'Kunde GmbH',
    street: 'Hauptstr. 5',
    postalCode: '10115',
    city: 'Berlin',
    country: 'Deutschland',
  },
};

describe('renderXRechnung', () => {
  const xml = renderXRechnung(input);

  it('carries the XRechnung profile, number and invoice type code', () => {
    expect(xml).toContain('xrechnung_3.0');
    expect(xml).toContain('<ram:ID>RE-2026-0001</ram:ID>');
    expect(xml).toContain('<ram:TypeCode>380</ram:TypeCode>');
  });

  it('uses type code 381 for credit notes', () => {
    expect(renderXRechnung({ ...input, type: 'CREDIT_NOTE' })).toContain(
      '<ram:TypeCode>381</ram:TypeCode>',
    );
  });

  it('totals match the integer-cent calculation', () => {
    expect(xml).toContain('<ram:LineTotalAmount>796.00</ram:LineTotalAmount>');
    expect(xml).toContain('currencyID="EUR">151.24</ram:TaxTotalAmount>');
    expect(xml).toContain(
      '<ram:GrandTotalAmount>947.24</ram:GrandTotalAmount>',
    );
  });

  it('escapes XML special characters from user data', () => {
    expect(xml).toContain('Moving Head &lt;Miete&gt; &amp; Technik');
    expect(xml).not.toContain('<Miete>');
  });

  it('maps units and strips spaces from the IBAN', () => {
    expect(xml).toContain('unitCode="C62"');
    expect(xml).toContain('unitCode="HUR"');
    expect(xml).toContain('DE02120300000000202051');
  });
});

describe('missingEInvoiceData', () => {
  it('is empty for complete data', () => {
    expect(missingEInvoiceData(input)).toEqual([]);
  });

  it('lists what has to be completed', () => {
    const missing = missingEInvoiceData({
      ...input,
      seller: { name: 'X' },
      buyer: { name: 'Y' },
    });
    expect(missing).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Firmenadresse'),
        expect.stringContaining('USt-IdNr.'),
        expect.stringContaining('IBAN'),
        expect.stringContaining('Adresse des Kunden'),
      ]),
    );
  });
});

describe('countryCode', () => {
  it('maps names and passes ISO codes through', () => {
    expect(countryCode('Deutschland')).toBe('DE');
    expect(countryCode('at')).toBe('AT');
    expect(countryCode(undefined)).toBe('DE');
  });
});
