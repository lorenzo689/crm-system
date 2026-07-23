"use client";

import { useEffect, useRef, useState } from "react";
import { FiMoreVertical } from "react-icons/fi";

type CustomerRowActionsProps = {
  archiveLabel: string;
  disabled?: boolean;
  onArchiveToggle: () => void;
  onDetails: () => void;
  onEdit: () => void;
};

export function CustomerRowActions({
  archiveLabel,
  disabled = false,
  onArchiveToggle,
  onDetails,
  onEdit,
}: CustomerRowActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function runAndClose(action: () => void) {
    setIsOpen(false);
    action();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Aktionen öffnen"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
      >
        <FiMoreVertical className="text-base" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-20 min-w-[11rem] rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
        >
          <MenuButton label="Details" onClick={() => runAndClose(onDetails)} />
          <MenuButton label="Bearbeiten" onClick={() => runAndClose(onEdit)} />
          <MenuButton
            label={archiveLabel}
            disabled={disabled}
            onClick={() => runAndClose(onArchiveToggle)}
          />
        </div>
      )}
    </div>
  );
}

function MenuButton({
  label,
  disabled = false,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
