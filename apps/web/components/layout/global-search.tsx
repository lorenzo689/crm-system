"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FaSearch } from "react-icons/fa";
import { apiFetch } from "@/lib/auth-api";

type SearchResult = {
  id: string;
  label: string;
  href: string;
};

type SearchResponse = {
  customers: SearchResult[];
  projects: SearchResult[];
  tasks: SearchResult[];
};

const emptyResults: SearchResponse = {
  customers: [],
  projects: [],
  tasks: [],
};

const resultCategories: Array<{
  key: keyof SearchResponse;
  label: string;
}> = [
  { key: "customers", label: "Kunden" },
  { key: "projects", label: "Projekte" },
  { key: "tasks", label: "Aufgaben" },
];

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse>(emptyResults);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const router = useRouter();

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

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      requestIdRef.current += 1;
    };
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    requestIdRef.current += 1;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmedQuery = value.trim();
    if (trimmedQuery.length < 2) {
      setResults(emptyResults);
      setIsLoading(false);
      setIsOpen(false);
      return;
    }

    const requestId = requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      setIsOpen(true);

      try {
        const data = await apiFetch<SearchResponse>(
          `/search?q=${encodeURIComponent(trimmedQuery)}`,
        );
        if (requestId === requestIdRef.current) {
          setResults(data);
        }
      } catch {
        if (requestId === requestIdRef.current) {
          setResults(emptyResults);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 300);
  }

  function handleSelect(href: string) {
    requestIdRef.current += 1;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    setIsOpen(false);
    setIsLoading(false);
    setQuery("");
    setResults(emptyResults);
    router.push(href);
  }

  const hasResults = resultCategories.some(
    (category) => results[category.key].length > 0,
  );

  return (
    <div
      className="relative hidden min-w-[220px] max-w-[460px] flex-1 md:block"
      ref={containerRef}
    >
      <form
        role="search"
        onSubmit={(event) => event.preventDefault()}
        className="flex h-12 items-center rounded-full border border-zinc-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
      >
        <label htmlFor="global-search" className="sr-only">
          Kunden, Projekte und Aufgaben durchsuchen
        </label>

        <div className="flex items-center pl-4 text-sm text-zinc-400">
          <FaSearch />
        </div>

        <input
          id="global-search"
          name="search"
          type="search"
          value={query}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
          placeholder="Suche nach Projekten, Kunden oder Aufgaben"
          autoComplete="off"
          className="h-full min-w-0 flex-1 rounded-full border-none bg-transparent px-3 text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
        />
      </form>

      {isOpen && (
        <div className="absolute left-0 right-0 z-20 mt-2 max-h-96 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-2 shadow-lg">
          {isLoading ? (
            <p className="px-4 py-3 text-sm text-zinc-400">Suche...</p>
          ) : !hasResults ? (
            <p className="px-4 py-3 text-sm text-zinc-400">
              Keine Ergebnisse.
            </p>
          ) : (
            resultCategories.map((category) => {
              const categoryResults = results[category.key];
              if (categoryResults.length === 0) {
                return null;
              }

              return (
                <div className="mb-1 last:mb-0" key={category.key}>
                  <p className="px-4 py-1 text-xs font-medium uppercase tracking-wider text-zinc-400">
                    {category.label}
                  </p>
                  {categoryResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.href)}
                      className="block w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
