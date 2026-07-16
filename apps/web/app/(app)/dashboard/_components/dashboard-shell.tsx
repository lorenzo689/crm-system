"use client";

import { useState } from "react";

import { DashboardContent } from "./dashboard-content";
import { DashboardHeader } from "./dashboard-header";
import { DashboardSidebar } from "./dashboard-sidebar";

export function DashboardShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <main className="flex h-full w-full overflow-hidden bg-zinc-100">
      <DashboardSidebar
        isOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((previousOpen) => !previousOpen)}
      />

      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-zinc-100">
        <DashboardHeader />
        <DashboardContent />
      </section>
    </main>
  );
}
