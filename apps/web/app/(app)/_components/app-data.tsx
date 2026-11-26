import type { ReactNode } from "react";
import {
  FiBarChart2,
  FiCalendar,
  FiClipboard,
  FiClock,
  FiCreditCard,
  FiDollarSign,
  FiFileMinus,
  FiFileText,
  FiFolder,
  FiGrid,
  FiInbox,
  FiList,
  FiPackage,
  FiRepeat,
  FiSettings,
  FiShoppingCart,
  FiTruck,
  FiUsers,
} from "react-icons/fi";

export type MenuItem = {
  title: string;
  href: string;
  icon: ReactNode;
  gap?: boolean;
  /** Hidden for plain members; the API enforces this independently. */
  adminOnly?: boolean;
};

export const menuItems: MenuItem[] = [
  { title: "Übersicht", href: "/dashboard", icon: <FiGrid /> },
  { title: "Posteingang", href: "/inbox", icon: <FiInbox />, adminOnly: true },
  { title: "Kunden", href: "/customers", icon: <FiUsers />, gap: true },
  { title: "Projekte", href: "/projects", icon: <FiFolder /> },
  { title: "Aufgaben", href: "/tasks", icon: <FiList /> },
  { title: "Kalender", href: "/calendar", icon: <FiCalendar /> },
  { title: "Zeiten", href: "/time", icon: <FiClock /> },
  { title: "Dokumente", href: "/documents", icon: <FiFileText /> },
  { title: "Artikel", href: "/articles", icon: <FiPackage />, gap: true },
  { title: "Angebote", href: "/quotes", icon: <FiClipboard /> },
  { title: "Rechnungen", href: "/invoices", icon: <FiCreditCard /> },
  { title: "Gutschriften", href: "/credit-notes", icon: <FiFileMinus /> },
  { title: "Abos", href: "/recurring", icon: <FiRepeat />, adminOnly: true },
  { title: "Lieferanten", href: "/suppliers", icon: <FiTruck />, gap: true },
  { title: "Bestellungen", href: "/purchase-orders", icon: <FiShoppingCart /> },
  { title: "Finanzen", href: "/finance", icon: <FiDollarSign />, adminOnly: true },
  { title: "Auswertungen", href: "/reports", icon: <FiBarChart2 />, adminOnly: true },
  { title: "Einstellungen", href: "/settings", icon: <FiSettings />, gap: true },
];

/** API reads to warm when the user hovers a menu entry. */
export const prefetchPaths: Record<string, string> = {
  "/articles": "/articles",
  "/quotes": "/sales-documents?type=QUOTE",
  "/invoices": "/sales-documents?type=INVOICE",
  "/credit-notes": "/sales-documents?type=CREDIT_NOTE",
  "/suppliers": "/suppliers",
  "/purchase-orders": "/purchase-orders",
  "/inbox": "/inbox?status=NEW",
  "/time": "/time-entries",
  "/recurring": "/recurring-invoices",
  "/finance": "/finance/bank/transactions?status=UNMATCHED",
};
