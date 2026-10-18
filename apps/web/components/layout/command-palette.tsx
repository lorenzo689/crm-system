"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/auth-api";

type Entry = { id: string; group: string; label: string; hint?: string; href: string };

type SearchResponse = Record<
  "customers" | "projects" | "tasks" | "documents",
  { id: string; label: string; href: string }[]
>;

const pages: Entry[] = [
  ["Übersicht", "/dashboard"],
  ["KI-Assistent", "/assistant"],
  ["Posteingang", "/inbox"],
  ["Kunden", "/customers"],
  ["Projekte", "/projects"],
  ["Aufgaben", "/tasks"],
  ["Kalender", "/calendar"],
  ["Dokumente", "/documents"],
  ["Artikel", "/articles"],
  ["Angebote", "/quotes"],
  ["Rechnungen", "/invoices"],
  ["Gutschriften", "/credit-notes"],
  ["Verleih / Reservierungen", "/rental"],
  ["Zeiterfassung", "/time"],
  ["Abos / wiederkehrende Rechnungen", "/recurring"],
  ["Finanzen / Bankabgleich", "/finance"],
  ["Auswertungen", "/reports"],
  ["Lieferanten", "/suppliers"],
  ["Bestellungen", "/purchase-orders"],
  ["Einstellungen", "/settings"],
].map(([label, href]) => ({ id: href, group: "Gehe zu", label, href }));

const groupLabels: Record<keyof SearchResponse, string> = {
  customers: "Kunden",
  projects: "Projekte",
  tasks: "Aufgaben",
  documents: "Dokumente",
};

export function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Entry[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((value) => !value);
      } else if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!isOpen || trimmed.length < 2) return;
    const requestId = ++requestRef.current;
    const timer = setTimeout(() => {
      apiFetch<SearchResponse>(`/search?q=${encodeURIComponent(trimmed)}`)
        .then((response) => {
          if (requestId !== requestRef.current) return;
          setFound(
            (Object.keys(groupLabels) as (keyof SearchResponse)[]).flatMap((key) =>
              response[key].map((item) => ({
                id: `${key}-${item.id}`,
                group: groupLabels[key],
                label: item.label,
                href: item.href,
              })),
            ),
          );
        })
        .catch(() => undefined);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  const entries = useMemo(() => {
    const trimmed = query.trim();
    const lowered = trimmed.toLowerCase();
    const matchingPages = pages.filter(
      (page) => !lowered || page.label.toLowerCase().includes(lowered),
    );
    const visibleFound = trimmed.length >= 2 ? found : [];
    const ask: Entry[] = trimmed
      ? [
          {
            id: "ask-ai",
            group: "KI",
            label: `Die KI fragen: „${trimmed}“`,
            href: `/assistant?q=${encodeURIComponent(trimmed)}`,
          },
        ]
      : [];
    return [...matchingPages, ...visibleFound, ...ask];
  }, [query, found]);

  function close() {
    setIsOpen(false);
    setQuery("");
    setFound([]);
    setActive(0);
  }

  function choose(entry: Entry | undefined) {
    if (!entry) return;
    close();
    router.push(entry.href);
  }

  if (!isOpen) return null;

  let lastGroup = "";
  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-label="Befehlspalette"
        className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((value) => Math.min(value + 1, entries.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((value) => Math.max(value - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              choose(entries[active]);
            }
          }}
          placeholder="Seite, Kunde, Beleg suchen oder die KI fragen…"
          className="w-full border-b border-zinc-100 px-4 py-3.5 text-sm outline-none"
        />
        <ul className="max-h-[50vh] overflow-y-auto py-2">
          {entries.map((entry, index) => {
            const showGroup = entry.group !== lastGroup;
            lastGroup = entry.group;
            return (
              <li key={entry.id}>
                {showGroup && (
                  <p className="px-4 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400">
                    {entry.group}
                  </p>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(entry)}
                  className={`block w-full truncate px-4 py-2 text-left text-sm ${
                    index === active ? "bg-amber-50 text-zinc-900" : "text-zinc-600"
                  }`}
                >
                  {entry.label}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-zinc-100 px-4 py-2 text-[0.7rem] text-zinc-400">
          ↑↓ wählen · Enter öffnen · Esc schließen
        </p>
      </div>
    </div>
  );
}
