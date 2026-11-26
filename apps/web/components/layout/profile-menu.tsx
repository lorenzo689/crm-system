"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/lib/use-current-user";
import { useLogout } from "@/lib/use-logout";
import {
  getUserInitials,
  organizationRoleLabels,
} from "@/lib/user-profile";

export function ProfileMenu() {
  const { user } = useCurrentUser();
  const [isOpen, setIsOpen] = useState(false);
  const { logout, isPending: isLoggingOut, error: logoutError } = useLogout();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label="Profilmenü öffnen"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="flex items-center gap-3 rounded-full border border-zinc-200 bg-white p-1.5 transition-colors duration-150 hover:bg-zinc-50 xl:pr-4"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
          {user ? getUserInitials(user.displayName) : "?"}
        </span>
        <span className="hidden text-left xl:block">
          <span className="block text-sm font-semibold text-zinc-900">
            {user?.displayName ?? "Profil"}
          </span>
          <span className="block text-[0.72rem] text-zinc-400">
            {user
              ? organizationRoleLabels[user.organizationRole ?? "MEMBER"]
              : "Konto wird geladen"}
          </span>
        </span>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-zinc-200 bg-white py-2 shadow-lg"
        >
          <div className="border-b border-zinc-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-zinc-900">
              {user?.displayName ?? "Profil"}
            </p>
            <p className="truncate text-xs text-zinc-400">
              {user?.email ?? "Konto wird geladen"}
            </p>
          </div>

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="block px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Profil
          </Link>
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="block px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Einstellungen
          </Link>

          <div className="my-1 border-t border-zinc-100" />

          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            disabled={isLoggingOut}
            className="block w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {isLoggingOut ? "Wird abgemeldet…" : "Abmelden"}
          </button>
          {logoutError && (
            <p role="alert" className="px-4 pb-2 text-xs text-red-600">
              {logoutError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
