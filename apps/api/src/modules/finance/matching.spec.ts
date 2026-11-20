import { suggestMatch } from './matching';

const invoices = [
  {
    id: 'i1',
    number: 'RE-2026-0001',
    outstandingCents: 107100,
    customerName: 'Muster Veranstaltungs GmbH',
  },
  {
    id: 'i2',
    number: 'RE-2026-0002',
    outstandingCents: 50000,
    customerName: 'Beispiel AG',
  },
];
const supplierInvoices = [
  {
    id: 's1',
    invoiceNumber: 'R-4711',
    grossCents: 25000,
    supplierName: 'Lichtgroßhandel Nord',
  },
];

describe('suggestMatch', () => {
  it('is HIGH when number and amount agree', () => {
    expect(
      suggestMatch(
        {
          amountCents: 107100,
          counterparty: 'x',
          purpose: 'Zahlung RE 2026-0001',
        },
        invoices,
        [],
      ),
    ).toMatchObject({ id: 'i1', confidence: 'HIGH' });
  });

  it('is only MEDIUM when the amount differs (partial payment)', () => {
    expect(
      suggestMatch(
        { amountCents: 50000, counterparty: null, purpose: 'RE-2026-0001' },
        invoices,
        [],
      ),
    ).toMatchObject({ id: 'i1', confidence: 'MEDIUM' });
  });

  it('falls back to exact amount plus customer name', () => {
    expect(
      suggestMatch(
        {
          amountCents: 50000,
          counterparty: 'BEISPIEL AG',
          purpose: 'Überweisung',
        },
        invoices,
        [],
      ),
    ).toMatchObject({ id: 'i2', confidence: 'MEDIUM' });
  });

  it('does not guess on amount alone', () => {
    expect(
      suggestMatch(
        {
          amountCents: 50000,
          counterparty: 'Unbekannt',
          purpose: 'Überweisung',
        },
        invoices,
        [],
      ),
    ).toBeNull();
  });

  it('matches outgoing payments to supplier invoices', () => {
    expect(
      suggestMatch(
        {
          amountCents: -25000,
          counterparty: 'Lichtgroßhandel Nord',
          purpose: 'Rechnung R-4711',
        },
        [],
        supplierInvoices,
      ),
    ).toMatchObject({ kind: 'SUPPLIER_INVOICE', id: 's1', confidence: 'HIGH' });
  });

  it('never matches an incoming payment to a supplier invoice', () => {
    expect(
      suggestMatch(
        {
          amountCents: 25000,
          counterparty: 'Lichtgroßhandel Nord',
          purpose: 'R-4711',
        },
        [],
        supplierInvoices,
      ),
    ).toBeNull();
  });
});
