"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { TbLayoutSidebarLeftCollapse, TbLayoutSidebarLeftExpand } from "react-icons/tb";
import { menuItems, prefetchPaths } from "./app-data";
import { prefetchApi } from "@/lib/use-api";
import { useCurrentUser } from "@/lib/use-current-user";

type AppSidebarProps = {
  isOpen: boolean;
  mobileOpen: boolean;
  onToggleSidebar: () => void;
  onCloseMobile: () => void;
};

const sectionLabels: Record<string, string> = {
  "/dashboard": "Arbeitsplatz",
  "/customers": "Beziehungen",
  "/articles": "Vertrieb & Betrieb",
  "/suppliers": "Einkauf & Steuerung",
  "/settings": "System",
};

export function AppSidebar({
  isOpen,
  mobileOpen,
  onToggleSidebar,
  onCloseMobile,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { isAdmin } = useCurrentUser();
  const sidebarRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previousFocus?.focus();
  }, [mobileOpen]);

  function onSidebarKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!mobileOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseMobile();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled])",
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    if (focusable.length === 0) return;
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault();
      focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
      event.preventDefault();
      focusable[0].focus();
    }
  }

  return (
    <aside
      ref={sidebarRef}
      className="app-sidebar"
      data-collapsed={!isOpen}
      data-mobile-open={mobileOpen}
      aria-label="Seitennavigation"
      role={mobileOpen ? "dialog" : undefined}
      aria-modal={mobileOpen ? "true" : undefined}
      onKeyDown={onSidebarKeyDown}
    >
      <div className="app-sidebar-top">
        <Link href="/dashboard" className="app-sidebar-brand" onClick={onCloseMobile}>
          <span className="app-brand-image-wrap">
            <Image src="/images/images.jpg" alt="Bissinger Lights" width={112} height={98} className="app-brand-image" priority />
          </span>
        </Link>
        <button
          type="button"
          className="app-sidebar-toggle"
          aria-label={isOpen ? "Navigation einklappen" : "Navigation ausklappen"}
          title={isOpen ? "Navigation einklappen" : "Navigation ausklappen"}
          onClick={onToggleSidebar}
        >
          {isOpen ? <TbLayoutSidebarLeftCollapse aria-hidden="true" /> : <TbLayoutSidebarLeftExpand aria-hidden="true" />}
        </button>
        <button
          ref={closeRef}
          type="button"
          className="app-sidebar-mobile-close"
          aria-label="Navigation schließen"
          onClick={onCloseMobile}
        >
          Schließen
        </button>
      </div>

      <nav aria-label="Hauptnavigation" className="app-sidebar-nav">
        {menuItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const section = sectionLabels[item.href];
            return (
              <div key={item.href}>
                {section && <p className="app-nav-section">{section}</p>}
                <Link
                  href={item.href}
                  className="app-nav-link"
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  title={isOpen ? undefined : item.title}
                  onClick={onCloseMobile}
                  onMouseEnter={() => {
                    const path = prefetchPaths[item.href];
                    if (path) prefetchApi(path);
                  }}
                >
                  <span className="app-nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="app-nav-label">{item.title}</span>
                </Link>
              </div>
            );
          })}
      </nav>

    </aside>
  );
}
