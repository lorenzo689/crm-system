"use client";

import { usePathname } from "next/navigation";
import { FiMenu, FiSearch } from "react-icons/fi";
import { CreateMenu } from "@/components/layout/create-menu";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationMenu } from "@/components/layout/notification-menu";
import { ProfileMenu } from "@/components/layout/profile-menu";

const routeTitles: Record<string, string> = {
  "/dashboard": "Übersicht",
  "/customers": "Kunden",
  "/projects": "Projekte",
  "/tasks": "Aufgaben",
  "/calendar": "Kalender",
  "/time": "Zeiten",
  "/documents": "Dokumente",
  "/articles": "Artikel",
  "/quotes": "Angebote",
  "/invoices": "Rechnungen",
  "/credit-notes": "Gutschriften",
  "/recurring": "Abos",
  "/suppliers": "Lieferanten",
  "/purchase-orders": "Bestellungen",
  "/finance": "Finanzen",
  "/reports": "Auswertungen",
  "/inbox": "Posteingang",
  "/settings": "Einstellungen",
  "/profile": "Profil",
};

function getPageTitle(pathname: string) {
  const matched = Object.keys(routeTitles)
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname === route || pathname.startsWith(`${route}/`));
  return matched ? routeTitles[matched] : "Bissinger OS";
}

export function AppHeader({ onMenuToggle, onSearchOpen }: { onMenuToggle: () => void; onSearchOpen: () => void }) {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="app-header">
      <div className="app-header-context">
        <button
          type="button"
          className="app-mobile-menu"
          aria-label="Navigation öffnen"
          onClick={onMenuToggle}
        >
          <FiMenu aria-hidden="true" />
        </button>
        <div className="app-header-title">
          <span>Bissinger OS</span>
          <strong>{pageTitle}</strong>
        </div>
      </div>
      <div className="app-header-search"><GlobalSearch /></div>
      <div className="app-header-actions">
        <button type="button" className="app-mobile-search" aria-label="Suche öffnen" onClick={onSearchOpen}>
          <FiSearch aria-hidden="true" />
        </button>
        <CreateMenu />
        <NotificationMenu />
        <ProfileMenu />
      </div>
    </header>
  );
}
