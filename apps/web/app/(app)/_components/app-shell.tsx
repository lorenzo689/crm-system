"use client";

import { useState } from "react";

import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <main
      className={`flex h-full w-full overflow-hidden bg-zinc-100 crm-shell`}
    >
      <AppSidebar
        isOpen={isSidebarOpen}
        onToggleSidebar={() =>
          setIsSidebarOpen((previousOpen) => !previousOpen)
        }
      />

      <section className="flex h-full w-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-100">
        <AppHeader />
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </main>
  );
}
