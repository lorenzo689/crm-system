export type SalesDocumentType = "QUOTE" | "INVOICE" | "CREDIT_NOTE";
export type SalesDocumentStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "DECLINED"
  | "PAID"
  | "CANCELLED";

export type Article = {
  id: string;
  articleNumber: string;
  name: string;
  description: string | null;
  unit: string;
  unitPriceCents: number;
  vatRateBp: number;
  trackStock: boolean;
  stockQuantity: number;
  minStock: number;
  isRentable: boolean;
  rentalStock: number;
  rentalPriceCents: number;
  archivedAt: string | null;
};

export type SalesItem = {
  id?: string;
  articleId: string | null;
  description: string;
  quantity: number | string;
  unit: string;
  unitPriceCents: number;
  vatRateBp: number;
  netCents?: number;
};

export type SalesDocument = {
  id: string;
  type: SalesDocumentType;
  number: string;
  status: SalesDocumentStatus;
  issueDate: string;
  dueDate: string | null;
  headerText: string | null;
  footerText: string | null;
  netCents: number;
  vatCents: number;
  grossCents: number;
  paidAt: string | null;
  paidCents: number;
  creditedCents: number;
  dunningLevel: number;
  payments?: { id: string; amountCents: number; paidAt: string; method: string | null; note: string | null }[];
  customer: { id: string; name: string; customerNumber: string };
  project: { id: string; name: string; projectNumber: string } | null;
  items?: SalesItem[];
  sourceQuote?: { id: string; number: string } | null;
  invoices?: { id: string; number: string; status: SalesDocumentStatus }[];
  creditedInvoice?: { id: string; number: string } | null;
  creditNotes?: {
    id: string;
    number: string;
    status: SalesDocumentStatus;
    grossCents: number;
  }[];
};

export const typeLabels: Record<SalesDocumentType, string> = {
  QUOTE: "Angebot",
  INVOICE: "Rechnung",
  CREDIT_NOTE: "Gutschrift",
};

export const statusLabels: Record<SalesDocumentStatus, string> = {
  DRAFT: "Entwurf",
  SENT: "Versendet",
  ACCEPTED: "Angenommen",
  DECLINED: "Abgelehnt",
  PAID: "Bezahlt",
  CANCELLED: "Storniert",
};

export const statusStyles: Record<SalesDocumentStatus, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700",
  SENT: "bg-blue-50 text-blue-700",
  ACCEPTED: "bg-emerald-50 text-emerald-700",
  DECLINED: "bg-red-50 text-red-700",
  PAID: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-zinc-100 text-zinc-500 line-through",
};

/** Status changes the API allows, with the button label for each. */
export const nextActions: Record<
  SalesDocumentType,
  Partial<
    Record<
      SalesDocumentStatus,
      { status: SalesDocumentStatus; label: string; danger?: boolean }[]
    >
  >
> = {
  QUOTE: {
    DRAFT: [
      { status: "SENT", label: "Als versendet markieren" },
      { status: "CANCELLED", label: "Stornieren", danger: true },
    ],
    SENT: [
      { status: "ACCEPTED", label: "Angenommen" },
      { status: "DECLINED", label: "Abgelehnt", danger: true },
      { status: "CANCELLED", label: "Stornieren", danger: true },
    ],
  },
  INVOICE: {
    DRAFT: [
      { status: "SENT", label: "Ausstellen & versenden" },
      { status: "CANCELLED", label: "Stornieren", danger: true },
    ],
    SENT: [
      { status: "PAID", label: "Als bezahlt markieren" },
      { status: "CANCELLED", label: "Stornieren", danger: true },
    ],
  },
  CREDIT_NOTE: {
    DRAFT: [
      { status: "SENT", label: "Ausstellen & versenden" },
      { status: "CANCELLED", label: "Verwerfen", danger: true },
    ],
  },
};

const moneyFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export function formatMoney(cents: number) {
  return moneyFormat.format(cents / 100);
}

export function formatDate(value: string | null) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function formatVat(rateBp: number) {
  return `${(rateBp / 100).toLocaleString("de-DE")} %`;
}

/** "12,50" / "12.5" -> 1250. Returns null for invalid input. */
export function parseEuroToCents(input: string): number | null {
  const normalized = input.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  return Math.round(Number(normalized) * 100);
}

export function centsToEuroInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Mirrors the API's calculation so the form can show live totals. */
export function calculateTotals(
  items: Pick<SalesItem, "quantity" | "unitPriceCents" | "vatRateBp">[],
) {
  const lineNet = items.map((item) =>
    Math.round(Number(item.quantity) * item.unitPriceCents),
  );
  const netByRate = new Map<number, number>();
  items.forEach((item, index) => {
    netByRate.set(
      item.vatRateBp,
      (netByRate.get(item.vatRateBp) ?? 0) + lineNet[index],
    );
  });
  let vat = 0;
  for (const [rate, net] of netByRate) {
    vat += Math.round((net * rate) / 10000);
  }
  const net = lineNet.reduce((sum, value) => sum + value, 0);
  return { lineNet, net, vat, gross: net + vat, netByRate };
}

export type CompanyProfile = {
  legalName: string;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  vatId?: string | null;
  taxNumber?: string | null;
  bankName?: string | null;
  iban?: string | null;
  bic?: string | null;
  defaultPaymentTermDays: number;
  defaultHourlyRateCents?: number;
  invoiceFooter?: string | null;
};

export const dunningLabels = [
  "",
  "Zahlungserinnerung",
  "1. Mahnung",
  "2. Mahnung",
];
