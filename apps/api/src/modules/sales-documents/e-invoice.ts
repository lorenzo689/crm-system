import { calculateTotals } from './sales-totals';

type Party = {
  name: string;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
};

export type EInvoiceInput = {
  type: 'INVOICE' | 'CREDIT_NOTE';
  number: string;
  issueDate: Date;
  dueDate: Date | null;
  customerNumber: string;
  creditedInvoiceNumber?: string | null;
  items: {
    description: string;
    quantity: unknown;
    unit: string;
    unitPriceCents: number;
    vatRateBp: number;
  }[];
  seller: Party & {
    vatId?: string | null;
    taxNumber?: string | null;
    email?: string | null;
    phone?: string | null;
    iban?: string | null;
    bic?: string | null;
  };
  buyer: Party;
};

const UNIT_CODES: Record<string, string> = {
  stk: 'C62',
  stück: 'C62',
  std: 'HUR',
  h: 'HUR',
  tag: 'DAY',
  tage: 'DAY',
  pausch: 'LS',
  pauschal: 'LS',
  m: 'MTR',
  kg: 'KGM',
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const amount = (cents: number) => (cents / 100).toFixed(2);
const compactDate = (date: Date) =>
  date.toISOString().slice(0, 10).replace(/-/g, '');

export function countryCode(country?: string | null) {
  const value = (country ?? '').trim();
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  const known: Record<string, string> = {
    deutschland: 'DE',
    germany: 'DE',
    österreich: 'AT',
    austria: 'AT',
    schweiz: 'CH',
    switzerland: 'CH',
  };
  return known[value.toLowerCase()] ?? 'DE';
}

/** Missing mandatory XRechnung data, so the UI can say what to complete. */
export function missingEInvoiceData(input: EInvoiceInput) {
  const missing: string[] = [];
  const { seller, buyer } = input;
  if (!seller.street || !seller.postalCode || !seller.city) {
    missing.push('Firmenadresse (Einstellungen → Firmendaten)');
  }
  if (!seller.vatId && !seller.taxNumber)
    missing.push('USt-IdNr. oder Steuernummer');
  if (!seller.email && !seller.phone)
    missing.push('E-Mail oder Telefon der Firma');
  if (!seller.iban && input.type === 'INVOICE') missing.push('IBAN der Firma');
  if (!buyer.street || !buyer.postalCode || !buyer.city) {
    missing.push('Adresse des Kunden');
  }
  return missing;
}

/**
 * XRechnung 3.0 as UN/CEFACT Cross Industry Invoice (CII). Built from the
 * public EN 16931 mapping; validate against the KoSIT validator before
 * relying on it for legally required e-invoicing.
 */
export function renderXRechnung(input: EInvoiceInput): string {
  const e = escapeXml;
  const lines = input.items.map((item) => ({
    ...item,
    quantity: Number(item.quantity),
  }));
  const totals = calculateTotals(lines);
  const sign = input.type === 'CREDIT_NOTE' ? '381' : '380';

  const netByRate = new Map<number, number>();
  lines.forEach((line, index) => {
    netByRate.set(
      line.vatRateBp,
      (netByRate.get(line.vatRateBp) ?? 0) + totals.lineNetCents[index],
    );
  });

  const taxBreakdown = [...netByRate.entries()]
    .map(([rateBp, basis]) => {
      const category = rateBp === 0 ? 'Z' : 'S';
      return `      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${amount(Math.round((basis * rateBp) / 10000))}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${amount(basis)}</ram:BasisAmount>
        <ram:CategoryCode>${category}</ram:CategoryCode>
        <ram:RateApplicablePercent>${(rateBp / 100).toFixed(2)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`;
    })
    .join('\n');

  const itemXml = lines
    .map((line, index) => {
      const category = line.vatRateBp === 0 ? 'Z' : 'S';
      const unit = UNIT_CODES[line.unit.trim().toLowerCase()] ?? 'C62';
      return `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${index + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${e(line.description.slice(0, 200))}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${amount(line.unitPriceCents)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${unit}">${line.quantity}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${category}</ram:CategoryCode>
          <ram:RateApplicablePercent>${(line.vatRateBp / 100).toFixed(2)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${amount(totals.lineNetCents[index])}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join('\n');

  const address = (party: Party) => `<ram:PostalTradeAddress>
          <ram:PostcodeCode>${e(party.postalCode ?? '')}</ram:PostcodeCode>
          <ram:LineOne>${e(party.street ?? '')}</ram:LineOne>
          <ram:CityName>${e(party.city ?? '')}</ram:CityName>
          <ram:CountryID>${countryCode(party.country)}</ram:CountryID>
        </ram:PostalTradeAddress>`;

  const { seller, buyer } = input;
  const taxRegistrations = [
    seller.vatId &&
      `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${e(seller.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>`,
    seller.taxNumber &&
      `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${e(seller.taxNumber)}</ram:ID></ram:SpecifiedTaxRegistration>`,
  ]
    .filter(Boolean)
    .join('\n        ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${e(input.number)}</ram:ID>
    <ram:TypeCode>${sign}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${compactDate(input.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${itemXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${e(input.customerNumber)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${e(seller.name)}</ram:Name>
        <ram:DefinedTradeContact>
          <ram:PersonName>${e(seller.name)}</ram:PersonName>
          ${seller.phone ? `<ram:TelephoneUniversalCommunication><ram:CompleteNumber>${e(seller.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : ''}
          ${seller.email ? `<ram:EmailURIUniversalCommunication><ram:URIID>${e(seller.email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : ''}
        </ram:DefinedTradeContact>
        ${address(seller)}
        ${seller.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${e(seller.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}
        ${taxRegistrations}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${e(buyer.name)}</ram:Name>
        ${address(buyer)}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${
        seller.iban
          ? `<ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${e(seller.iban.replace(/\s+/g, ''))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>`
          : ''
      }
${taxBreakdown}
      ${
        input.dueDate
          ? `<ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime><udt:DateTimeString format="102">${compactDate(input.dueDate)}</udt:DateTimeString></ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>`
          : ''
      }
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amount(totals.netCents)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${amount(totals.netCents)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${amount(totals.vatCents)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amount(totals.grossCents)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${amount(totals.grossCents)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>${
        input.creditedInvoiceNumber
          ? `
      <ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${e(input.creditedInvoiceNumber)}</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>`
          : ''
      }
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
