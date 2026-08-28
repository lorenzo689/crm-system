import type { ReactNode } from "react";
import {
  FiCalendar,
  FiFileText,
  FiFolder,
  FiGrid,
  FiList,
  FiSettings,
  FiUsers,
} from "react-icons/fi";

export type MenuItem = {
  title: string;
  href: string;
  icon: ReactNode;
  gap?: boolean;
};

export const menuItems: MenuItem[] = [
  { title: "Übersicht", href: "/dashboard", icon: <FiGrid /> },
  { title: "Kunden", href: "/customers", icon: <FiUsers />, gap: true },
  { title: "Projekte", href: "/projects", icon: <FiFolder /> },
  { title: "Aufgaben", href: "/tasks", icon: <FiList /> },
  { title: "Kalender", href: "/calendar", icon: <FiCalendar /> },
  { title: "Dokumente", href: "/documents", icon: <FiFileText /> },
  { title: "Einstellungen", href: "/settings", icon: <FiSettings /> },
];
