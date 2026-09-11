"use client";

import { usePathname } from "next/navigation";
import { CreateMenu } from "@/components/layout/create-menu";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationMenu } from "@/components/layout/notification-menu";
import { ProfileMenu } from "@/components/layout/profile-menu";

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/customers": "Kunden",
  "/projects": "Projekte",
  "/tasks": "Aufgaben",
  "/calendar": "Kalender",
  "/documents": "Dokumente",
  "/settings": "Einstellungen",
  "/profile": "Profil",
};

function getPageTitle(pathname: string) {
  if (routeTitles[pathname]) {
    return routeTitles[pathname];
  }

  const matchedPrefix = Object.keys(routeTitles).find((route) =>
    pathname.startsWith(`${route}/`),
  );

  return matchedPrefix ? routeTitles[matchedPrefix] : "Bissinger OS";
}

export function AppHeader() {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);
  const today = new Date().toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
  });

  return (
    <header className="relative z-30 flex shrink-0 items-center justify-between border-b border-zinc-200 bg-[rgba(252,252,251,0.96)] px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] backdrop-blur md:px-8 md:py-5">
      <div className="flex min-w-0 items-center gap-3 xl:gap-6">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
            Bissinger OS
          </p>
          <h1 className="mt-2 truncate text-[1.35rem] font-semibold tracking-[-0.05em] text-zinc-950 sm:text-[1.7rem]">
            {pageTitle}
          </h1>
        </div>

        <GlobalSearch />
      </div>

      <div className="ml-3 flex shrink-0 items-center gap-2 xl:ml-6 xl:gap-3">
        <CreateMenu />

        <button
          type="button"
          className="hidden h-11 items-center justify-center rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-600 transition-colors duration-150 hover:bg-zinc-50 xl:inline-flex"
        >
          Heute, {today}
        </button>

        <NotificationMenu />
        <ProfileMenu />
      </div>
    </header>
  );
}
