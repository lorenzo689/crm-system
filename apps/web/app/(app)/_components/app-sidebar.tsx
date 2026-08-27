"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
} from "react-icons/tb";

import { menuItems, type MenuItem } from "./app-data";
import {
  cn,
  SIDEBAR_CLOSED_WIDTH,
  SIDEBAR_OPEN_WIDTH,
} from "./app-utils";
import { apiFetch } from "@/lib/auth-api";
import {
  getUserInitials,
  organizationRoleLabels,
  type CurrentUser,
} from "@/lib/user-profile";

type AppSidebarProps = {
  isOpen: boolean;
  onToggleSidebar: () => void;
};

export function AppSidebar({
  isOpen,
  onToggleSidebar,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    apiFetch<CurrentUser>("/users/me").then(setUser).catch(() => undefined);
  }, []);

  return (
    <aside
      className={cn(
        "relative flex h-full shrink-0 flex-col overflow-hidden bg-[#1d1d1f] px-4 pt-6 transition-all duration-300 ease-in-out",
        isOpen ? SIDEBAR_OPEN_WIDTH : SIDEBAR_CLOSED_WIDTH,
      )}
    >
      <button
        type="button"
        aria-label={isOpen ? "Sidebar schließen" : "Sidebar öffnen"}
        onClick={onToggleSidebar}
        className={cn(
          "absolute z-20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-zinc-50 bg-zinc-50 text-xl text-zinc-900 transition-all duration-300 ease-in-out",
          isOpen ? "right-4 top-9" : "left-1/2 top-5 -translate-x-1/2",
        )}
      >
        {isOpen ? (
          <TbLayoutSidebarLeftCollapse />
        ) : (
          <TbLayoutSidebarLeftExpand />
        )}
      </button>

      <div
        className={cn(
          "flex min-h-[72px] items-center gap-x-4",
          isOpen ? "pr-12" : "justify-center pt-12",
        )}
      >
        <Image
          src="https://cdn.pixabay.com/photo/2017/02/18/19/20/logo-2078018_640.png"
          alt="Logo"
          width={40}
          height={40}
          className={cn(
            "h-10 w-10 cursor-pointer rounded-full object-cover transition-transform duration-300 ease-in-out",
            isOpen && "rotate-[360deg]",
          )}
        />

        <h1
          className={cn(
            "origin-left whitespace-nowrap text-xl font-semibold text-zinc-50 transition-all duration-200 ease-in-out",
            isOpen ? "scale-100 opacity-100" : "scale-0 opacity-0",
          )}
        >
          Bissinger OS
        </h1>
      </div>

      <nav
        aria-label="Hauptnavigation"
        className={cn("min-h-0 flex-1", isOpen ? "mt-6" : "mt-8")}
      >
        <ul className="space-y-0.5">
          {menuItems.map((item) => (
            <SidebarMenuItem
              key={item.href}
              item={item}
              isActive={
                pathname === item.href || pathname.startsWith(`${item.href}/`)
              }
              isSidebarOpen={isOpen}
            />
          ))}
        </ul>
      </nav>

      <div
        className={cn(
          "mt-auto shrink-0 pt-6",
        )}
      >
        <Link
          href="/profile"
          aria-label="Profil öffnen"
          className={cn(
            "flex items-center rounded-xl p-2 transition-colors hover:bg-white/10",
            !isOpen && "justify-center",
          )}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-600 bg-zinc-100 text-sm font-semibold text-zinc-900">
            {user ? getUserInitials(user.displayName) : "?"}
          </span>

          <span
            className={cn(
              "ml-3 overflow-hidden transition-all duration-200 ease-in-out",
              isOpen ? "max-w-[160px] opacity-100" : "max-w-0 opacity-0",
            )}
          >
            <span className="block truncate whitespace-nowrap text-sm font-medium text-zinc-100">
              {user?.displayName ?? "Profil"}
            </span>
            <span className="block truncate whitespace-nowrap text-xs text-zinc-400">
              {user
                ? organizationRoleLabels[user.organizationRole]
                : "Konto wird geladen"}
            </span>
          </span>
        </Link>
      </div>
    </aside>
  );
}

type SidebarMenuItemProps = {
  item: MenuItem;
  isActive: boolean;
  isSidebarOpen: boolean;
};

function SidebarMenuItem({
  item,
  isActive,
  isSidebarOpen,
}: SidebarMenuItemProps) {
  return (
    <li
      className={cn(
        "group rounded-xl px-4 py-3 text-zinc-50 transition-colors duration-300 ease-in-out hover:cursor-pointer hover:bg-white hover:text-[#1d1d1f]",
        item.gap ? "mt-9" : "mt-2",
        isActive && "bg-white/5",
      )}
    >
      <Link
        href={item.href}
        className={cn(
          "flex w-full cursor-pointer items-center text-left",
          isSidebarOpen ? "justify-start gap-x-4" : "justify-center",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-lg text-zinc-200 transition-colors duration-300 ease-in-out group-hover:text-[#1d1d1f]">
            {item.icon}
          </span>
          <span
            className={cn(
              "origin-left whitespace-nowrap text-[0.98rem] transition-all duration-300 ease-in-out",
              isSidebarOpen ? "visible opacity-100" : "invisible w-0 opacity-0",
            )}
          >
            {item.title}
          </span>
        </span>
      </Link>
    </li>
  );
}
