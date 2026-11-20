export type OpenInvoice = {
  id: string;
  number: string;
  outstandingCents: number;
  customerName: string;
};

export type OpenSupplierInvoice = {
  id: string;
  invoiceNumber: string;
  grossCents: number;
  supplierName: string;
};

export type Match =
  | {
      kind: 'INVOICE';
      id: string;
      label: string;
      confidence: 'HIGH' | 'MEDIUM';
    }
  | {
      kind: 'SUPPLIER_INVOICE';
      id: string;
      label: string;
      confidence: 'HIGH' | 'MEDIUM';
    };

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '');

/** True when every significant word of `name` occurs in `text`. */
function mentions(text: string, name: string) {
  const words = name
    .toLowerCase()
    .split(/[^a-zäöüß0-9]+/)
    .filter(
      (word) =>
        word.length >= 3 &&
        !['gmbh', 'und', 'the', 'kg', 'ag', 'mbh'].includes(word),
    );
  const haystack = text.toLowerCase();
  return words.length > 0 && words.every((word) => haystack.includes(word));
}

/**
 * Suggests which open document a bank transaction pays. HIGH needs the
 * document number in the purpose and the exact amount; everything weaker is
 * only a suggestion for a human to confirm.
 */
export function suggestMatch(
  tx: {
    amountCents: number;
    counterparty: string | null;
    purpose: string | null;
  },
  invoices: OpenInvoice[],
  supplierInvoices: OpenSupplierInvoice[],
): Match | null {
  const purpose = normalize(tx.purpose ?? '');
  const party = tx.counterparty ?? '';

  if (tx.amountCents > 0) {
    const byNumber = invoices.find((invoice) =>
      purpose.includes(normalize(invoice.number)),
    );
    if (byNumber) {
      return {
        kind: 'INVOICE',
        id: byNumber.id,
        label: byNumber.number,
        confidence:
          byNumber.outstandingCents === tx.amountCents ? 'HIGH' : 'MEDIUM',
      };
    }
    const byAmount = invoices.filter(
      (invoice) =>
        invoice.outstandingCents === tx.amountCents &&
        mentions(party, invoice.customerName),
    );
    if (byAmount.length === 1) {
      return {
        kind: 'INVOICE',
        id: byAmount[0].id,
        label: byAmount[0].number,
        confidence: 'MEDIUM',
      };
    }
    return null;
  }

  if (tx.amountCents < 0) {
    const paid = -tx.amountCents;
    const byNumber = supplierInvoices.find(
      (invoice) =>
        normalize(invoice.invoiceNumber).length >= 3 &&
        purpose.includes(normalize(invoice.invoiceNumber)),
    );
    if (byNumber) {
      return {
        kind: 'SUPPLIER_INVOICE',
        id: byNumber.id,
        label: `${byNumber.supplierName} ${byNumber.invoiceNumber}`,
        confidence: byNumber.grossCents === paid ? 'HIGH' : 'MEDIUM',
      };
    }
    const byAmount = supplierInvoices.filter(
      (invoice) =>
        invoice.grossCents === paid && mentions(party, invoice.supplierName),
    );
    if (byAmount.length === 1) {
      return {
        kind: 'SUPPLIER_INVOICE',
        id: byAmount[0].id,
        label: `${byAmount[0].supplierName} ${byAmount[0].invoiceNumber}`,
        confidence: 'MEDIUM',
      };
    }
  }
  return null;
}
