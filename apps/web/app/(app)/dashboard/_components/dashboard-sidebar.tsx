import Image from "next/image";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
} from "react-icons/tb";

import { menuItems, type MenuItem } from "./dashboard-data";
import {
  cn,
  SIDEBAR_CLOSED_WIDTH,
  SIDEBAR_OPEN_WIDTH,
} from "./dashboard-utils";

type DashboardSidebarProps = {
  isOpen: boolean;
  onToggleSidebar: () => void;
};

export function DashboardSidebar({
  isOpen,
  onToggleSidebar,
}: DashboardSidebarProps) {
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
        aria-label="Dashboard-Navigation"
        className={cn("min-h-0 flex-1", isOpen ? "mt-6" : "mt-8")}
      >
        <ul className="space-y-0.5">
          {menuItems.map((item, index) => (
            <SidebarMenuItem
              key={item.title}
              item={item}
              index={index}
              isSidebarOpen={isOpen}
            />
          ))}
        </ul>
      </nav>

      <div
        className={cn(
          "mt-auto flex shrink-0 items-center pt-6",
          !isOpen && "justify-center",
        )}
      >
        <Image
          src="https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_640.png"
          alt="Anonymes Profilbild"
          width={40}
          height={40}
          className="h-10 w-10 rounded-full border border-zinc-700 bg-zinc-950 object-cover"
        />

        <div
          className={cn(
            "ml-3 overflow-hidden transition-all duration-200 ease-in-out",
            isOpen ? "max-w-[140px] opacity-100" : "max-w-0 opacity-0",
          )}
        >
          <p className="whitespace-nowrap text-sm font-medium text-zinc-100">
            Max Mustermann
          </p>
          <p className="whitespace-nowrap text-xs text-zinc-400">
            Internal access
          </p>
        </div>
      </div>
    </aside>
  );
}

type SidebarMenuItemProps = {
  item: MenuItem;
  index: number;
  isSidebarOpen: boolean;
};

function SidebarMenuItem({
  item,
  index,
  isSidebarOpen,
}: SidebarMenuItemProps) {
  return (
    <li
      className={cn(
        "group rounded-xl px-4 py-3 text-zinc-50 transition-colors duration-300 ease-in-out hover:cursor-pointer hover:bg-white hover:text-[#1d1d1f]",
        item.gap ? "mt-9" : "mt-2",
        index === 0 && "bg-white/5",
      )}
    >
      <button
        type="button"
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
      </button>
    </li>
  );
}
