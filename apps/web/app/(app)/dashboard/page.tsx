"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";

import { BiChat } from "react-icons/bi";
import { FaBell, FaSearch } from "react-icons/fa";
import { FaChevronDown, FaChevronRight, FaGears } from "react-icons/fa6";
import { FiTable } from "react-icons/fi";
import { GoGraph } from "react-icons/go";
import { MdOutlineHeadsetMic, MdSpaceDashboard } from "react-icons/md";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
} from "react-icons/tb";
import { TiCalendar } from "react-icons/ti";

type SubMenuKey = "inbox" | "settings";

type MenuItem = {
  title: string;
  icon: ReactNode;
  gap?: boolean;
  submenuKey?: SubMenuKey;
  subMenuItems?: string[];
};

const menuItems: MenuItem[] = [
  {
    title: "Dashboard",
    icon: <MdSpaceDashboard />,
  },
  {
    title: "Inbox",
    icon: <BiChat />,
    gap: true,
    submenuKey: "inbox",
    subMenuItems: ["Requested Messages", "Unread Messages", "All Messages"],
  },
  {
    title: "Calendar",
    icon: <TiCalendar />,
  },
  {
    title: "Tables",
    icon: <FiTable />,
  },
  {
    title: "Analytics",
    icon: <GoGraph />,
  },
  {
    title: "Support",
    icon: <MdOutlineHeadsetMic />,
  },
  {
    title: "Settings",
    icon: <FaGears />,
    submenuKey: "settings",
    subMenuItems: ["General", "Security", "Notifications"],
  },
];

const SIDEBAR_OPEN_WIDTH = "w-72 p-5";
const SIDEBAR_CLOSED_WIDTH = "w-20 p-4";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type SidebarProps = {
  isOpen: boolean;
  subMenus: Record<SubMenuKey, boolean>;
  onToggleSidebar: () => void;
  onToggleSubmenu: (menu: SubMenuKey) => void;
};

function Sidebar({
  isOpen,
  subMenus,
  onToggleSidebar,
  onToggleSubmenu,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "relative h-full shrink-0 overflow-hidden bg-zinc-900 pt-8 transition-all duration-300 ease-in-out",
        isOpen ? SIDEBAR_OPEN_WIDTH : SIDEBAR_CLOSED_WIDTH,
      )}
    >
      <button
        type="button"
        aria-label={isOpen ? "Sidebar schliessen" : "Sidebar oeffnen"}
        onClick={onToggleSidebar}
        className="absolute -right-4 top-9 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-zinc-50 bg-zinc-50 text-xl text-zinc-900 transition-transform duration-300 ease-in-out"
      >
        {isOpen ? (
          <TbLayoutSidebarLeftCollapse />
        ) : (
          <TbLayoutSidebarLeftExpand />
        )}
      </button>

      <div className="flex items-center gap-x-4">
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
          Admin Dashboard
        </h1>
      </div>

      <nav
        aria-label="Dashboard-Navigation"
        className="mt-6 h-[calc(100%-4.5rem)] overflow-hidden"
      >
        <ul className="space-y-0.5">
          {menuItems.map((item, index) => (
            <SidebarMenuItem
              key={item.title}
              item={item}
              index={index}
              isSidebarOpen={isOpen}
              isSubmenuOpen={
                item.submenuKey ? subMenus[item.submenuKey] : false
              }
              onToggleSubmenu={onToggleSubmenu}
            />
          ))}
        </ul>
      </nav>
    </aside>
  );
}

type SidebarMenuItemProps = {
  item: MenuItem;
  index: number;
  isSidebarOpen: boolean;
  isSubmenuOpen: boolean;
  onToggleSubmenu: (menu: SubMenuKey) => void;
};

function SidebarMenuItem({
  item,
  index,
  isSidebarOpen,
  isSubmenuOpen,
  onToggleSubmenu,
}: SidebarMenuItemProps) {
  const hasSubmenu =
    Boolean(item.subMenuItems?.length) && Boolean(item.submenuKey);

  return (
    <li
      className={cn(
        "rounded-md px-4 py-3 text-zinc-50 transition-colors duration-300 ease-in-out hover:bg-zinc-800/50 hover:text-white",
        item.gap ? "mt-9" : "mt-2",
        index === 0 && "bg-zinc-800/40",
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (item.submenuKey) {
            onToggleSubmenu(item.submenuKey);
          }
        }}
        aria-expanded={hasSubmenu ? isSubmenuOpen : undefined}
        className={cn(
          "flex w-full items-center gap-x-4 text-left",
          hasSubmenu ? "justify-between" : "justify-start",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-lg">{item.icon}</span>

          <span
            className={cn(
              "origin-left whitespace-nowrap transition-all duration-300 ease-in-out",
              isSidebarOpen ? "visible opacity-100" : "invisible w-0 opacity-0",
            )}
          >
            {item.title}
          </span>
        </span>

        {hasSubmenu && isSidebarOpen ? (
          <span className="ml-auto text-sm">
            {isSubmenuOpen ? <FaChevronDown /> : <FaChevronRight />}
          </span>
        ) : null}
      </button>

      {hasSubmenu && isSubmenuOpen && isSidebarOpen ? (
        <ul className="pl-3 pt-4 text-zinc-300">
          {item.subMenuItems?.map((subMenuItem) => (
            <li key={subMenuItem}>
              <button
                type="button"
                className="flex w-full items-center gap-x-2 rounded-lg px-2 py-3 text-left text-sm transition-colors hover:bg-zinc-800"
              >
                <FaChevronRight className="text-xs" />
                <span>{subMenuItem}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function DashboardHeader() {
  return (
    <header className="flex h-20 shrink-0 items-center justify-between bg-zinc-50 px-8 shadow-md">
      <form
        role="search"
        onSubmit={(event) => event.preventDefault()}
        className="flex h-11 w-full max-w-96 items-center rounded-full border border-zinc-300"
      >
        <label htmlFor="dashboard-search" className="sr-only">
          Dashboard durchsuchen
        </label>

        <input
          id="dashboard-search"
          name="search"
          type="search"
          placeholder="Search..."
          className="h-full min-w-0 flex-1 rounded-full border-none bg-zinc-50 px-4 outline-none"
        />

        <button
          type="submit"
          aria-label="Suchen"
          className="flex h-full items-center justify-center border-l border-zinc-300 px-4 text-base text-zinc-600"
        >
          <FaSearch />
        </button>
      </form>

      <div className="ml-6 flex shrink-0 items-center gap-x-8">
        <button
          type="button"
          aria-label="3 neue Benachrichtigungen"
          className="relative"
        >
          <span className="absolute -right-2.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white">
            3
          </span>
          <FaBell className="text-xl" />
        </button>

        <Image
          src="https://cdn.pixabay.com/photo/2016/11/21/11/17/model-1844729_640.jpg"
          alt="Profilbild"
          width={44}
          height={44}
          className="h-11 w-11 cursor-pointer rounded-full object-cover"
        />
      </div>
    </header>
  );
}

function DashboardContent() {
  return (
    <div className="flex-1 overflow-hidden px-8 py-6">
      <h2 className="text-xl font-medium text-zinc-800">
        This is the Dashboard page.
      </h2>
    </div>
  );
}

export default function HomePage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [subMenus, setSubMenus] = useState<Record<SubMenuKey, boolean>>({
    inbox: false,
    settings: false,
  });

  const toggleSubMenu = (menu: SubMenuKey): void => {
    setSubMenus((previousSubMenus) => ({
      ...previousSubMenus,
      [menu]: !previousSubMenus[menu],
    }));
  };

  return (
    <main className="flex h-full w-full overflow-hidden bg-zinc-100">
      <Sidebar
        isOpen={isSidebarOpen}
        subMenus={subMenus}
        onToggleSidebar={() => setIsSidebarOpen((previousOpen) => !previousOpen)}
        onToggleSubmenu={toggleSubMenu}
      />

      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-zinc-100">
        <DashboardHeader />
        <DashboardContent />
      </section>
    </main>
  );
}
