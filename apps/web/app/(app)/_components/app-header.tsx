import Image from "next/image";
import { FaBell, FaSearch } from "react-icons/fa";

export function AppHeader() {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-[rgba(252,252,251,0.96)] px-8 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] backdrop-blur">
      <div className="flex min-w-0 items-center gap-6">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
            Bissinger OS
          </p>
          <h1 className="mt-2 truncate text-[1.7rem] font-semibold tracking-[-0.05em] text-zinc-950">
            Dashboard
          </h1>
        </div>

        <div className="hidden h-12 w-px bg-zinc-200 xl:block" />

        <form
          role="search"
          onSubmit={(event) => event.preventDefault()}
          className="hidden h-12 min-w-[380px] max-w-[460px] flex-1 items-center rounded-full border border-zinc-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] xl:flex"
        >
          <label htmlFor="dashboard-search" className="sr-only">
            Dashboard durchsuchen
          </label>

          <div className="flex items-center pl-4 text-sm text-zinc-400">
            <FaSearch />
          </div>

          <input
            id="dashboard-search"
            name="search"
            type="search"
            placeholder="Suche nach Projekten, Kunden oder Aufgaben"
            className="h-full min-w-0 flex-1 rounded-full border-none bg-transparent px-3 text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
          />

          <div className="mr-2 flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.18em] text-zinc-400">
            Global
          </div>
        </form>
      </div>

      <div className="ml-6 flex shrink-0 items-center gap-3">
        <button
          type="button"
          className="hidden h-11 items-center justify-center rounded-full border border-transparent bg-zinc-950 px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-zinc-800 lg:inline-flex"
        >
          Neu
        </button>

        <button
          type="button"
          className="hidden h-11 items-center justify-center rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-600 transition-colors duration-150 hover:bg-zinc-50 lg:inline-flex"
        >
          Heute, 16. Juli
        </button>

        <button
          type="button"
          aria-label="3 neue Benachrichtigungen"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-900 transition-colors duration-150 hover:bg-zinc-50"
        >
          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[0.62rem] font-semibold text-white">
            3
          </span>
          <FaBell className="text-base" />
        </button>

        <button
          type="button"
          className="flex items-center gap-3 rounded-full border border-zinc-200 bg-white p-1.5 pl-1.5 pr-4 transition-colors duration-150 hover:bg-zinc-50"
        >
          <Image
            src="https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_640.png"
            alt="Profilbild"
            width={44}
            height={44}
            className="h-10 w-10 rounded-full border border-zinc-200 object-cover"
          />
          <span className="hidden text-left xl:block">
            <span className="block text-sm font-semibold text-zinc-900">
              Max Mustermann
            </span>
            <span className="block text-[0.72rem] text-zinc-400">
              Projektleitung
            </span>
          </span>
        </button>
      </div>
    </header>
  );
}
