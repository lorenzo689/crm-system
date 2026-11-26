"use client";

import { useState } from "react";
import { CommandPalette } from "@/components/layout/command-palette";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <main className="crm-shell">
      <a className="app-skip-link" href="#main-content">Zum Inhalt springen</a>
      {mobileOpen && (
        <button
          type="button"
          className="app-mobile-backdrop"
          aria-label="Navigation schließen"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <AppSidebar
        isOpen={isSidebarOpen}
        mobileOpen={mobileOpen}
        onToggleSidebar={() => setIsSidebarOpen((value) => !value)}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <section className="app-main">
        <AppHeader
          onMenuToggle={() => setMobileOpen((value) => !value)}
          onSearchOpen={() => setSearchOpen(true)}
        />
        <div id="main-content" className="app-content" tabIndex={-1}>{children}</div>
      </section>
      <CommandPalette isOpen={searchOpen} setIsOpen={setSearchOpen} />
    </main>
  );
}
