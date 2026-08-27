"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const createOptions = [
  { label: "Neuer Kunde", path: "/customers" },
  { label: "Neues Projekt", path: "/projects" },
  { label: "Neue Aufgabe", path: "/tasks" },
  { label: "Neuer Termin", path: "/calendar" },
];

export function CreateMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
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

  function handleSelect(path: string) {
    setIsOpen(false);
    router.push(`${path}?create=1`);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex h-10 items-center justify-center rounded-full border border-transparent bg-zinc-950 px-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-zinc-800 sm:h-11 sm:px-5"
      >
        Neu
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
          {createOptions.map((option) => (
            <button
              key={option.path}
              type="button"
              onClick={() => handleSelect(option.path)}
              className="block w-full px-4 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
