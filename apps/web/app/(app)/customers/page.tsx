"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/auth-api";
import { CustomerDetailSheet } from "./_components/customer-detail-sheet";
import { CustomerFormModal } from "./_components/customer-form-modal";
import { CustomerRowActions } from "./_components/customer-row-actions";
import type {
  ArchiveFilter,
  Customer,
  SortKey,
  StatusFilter,
} from "./_components/customer-types";
import { statusLabels, statusStyles } from "./_components/customer-types";

const defaultArchiveFilter: ArchiveFilter = "active";
const defaultSortKey: SortKey = "name";
const defaultSortDirection: SortDirection = "asc";
const defaultStatusFilter: StatusFilter = "all";

const sortableColumns: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "customerNumber", label: "Kundennummer" },
  { key: "status", label: "Status" },
  { key: "updatedAt", label: "Geändert" },
];

const statusOrder: Record<Customer["status"], number> = {
  ACTIVE: 0,
  LEAD: 1,
  INACTIVE: 2,
};

type SortDirection = "asc" | "desc";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export default function CustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveFilter, setArchiveFilter] =
    useState<ArchiveFilter>(defaultArchiveFilter);
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>(defaultStatusFilter);
  const [pagination, setPagination] = useState({ key: "", page: 1 });
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(defaultSortDirection);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [isActionPending, setIsActionPending] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);

  useEffect(() => {
    if (searchParams.get("create") !== "1") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFormMode("create");
      router.replace("/customers", { scroll: false });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [router, searchParams]);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) {
      return;
    }

    apiFetch<Customer>(`/customers/${openId}`)
      .then((customer) => {
        setCustomers((current) => {
          const exists = current.some((item) => item.id === customer.id);
          return exists
            ? current.map((item) => (item.id === customer.id ? customer : item))
            : [...current, customer];
        });
        setSelectedCustomerId(customer.id);
      })
      .catch(() => undefined)
      .finally(() => {
        router.replace("/customers", { scroll: false });
      });
  }, [router, searchParams]);

  /** State is only written in the request callbacks (safe inside effects). */
  const fetchCustomers = useCallback((focusCustomerId?: string) => {
    return apiFetch<Customer[]>("/customers")
      .then((loadedCustomers) => {
        setCustomers(loadedCustomers);
        if (focusCustomerId) {
          setSelectedCustomerId(focusCustomerId);
        }
      })
      .catch((caughtError) => {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Kunden konnten nicht geladen werden.",
        );
      })
      .finally(() => setIsLoading(false));
  }, []);

  function reloadCustomers(focusCustomerId?: string) {
    setIsLoading(true);
    setError(null);
    void fetchCustomers(focusCustomerId);
  }

  // Initial load; isLoading starts as true, so nothing needs resetting here.
  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const selectedCustomer = useMemo(
    () =>
      customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const filteredCustomers = useMemo(() => {
    let result = customers;

    if (archiveFilter === "archived") {
      result = result.filter((customer) => customer.archivedAt);
    } else if (archiveFilter === "active") {
      result = result.filter((customer) => !customer.archivedAt);
    }

    if (statusFilter !== "all") {
      result = result.filter((customer) => customer.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (customer) =>
          customer.name.toLowerCase().includes(query) ||
          customer.customerNumber.toLowerCase().includes(query) ||
          customer.description?.toLowerCase().includes(query),
      );
    }

    return [...result].sort((left, right) => {
      const comparison = (() => {
        switch (sortKey) {
          case "customerNumber":
            return left.customerNumber.localeCompare(
              right.customerNumber,
              "de",
            );
          case "status":
            return statusOrder[left.status] - statusOrder[right.status];
          case "updatedAt":
            return (
              new Date(right.updatedAt).getTime() -
              new Date(left.updatedAt).getTime()
            );
          case "name":
          default:
            return left.name.localeCompare(right.name, "de");
        }
      })();

      return sortDirection === "asc" ? comparison : comparison * -1;
    });
  }, [
    archiveFilter,
    customers,
    searchQuery,
    sortDirection,
    sortKey,
    statusFilter,
  ]);

  const hasActiveFilters =
    archiveFilter !== defaultArchiveFilter ||
    statusFilter !== defaultStatusFilter ||
    sortKey !== defaultSortKey ||
    sortDirection !== defaultSortDirection ||
    searchQuery.trim().length > 0;

  function resetFilters() {
    setArchiveFilter(defaultArchiveFilter);
    setStatusFilter(defaultStatusFilter);
    setSearchQuery("");
    setSortKey(defaultSortKey);
    setSortDirection(defaultSortDirection);
  }

  function openCreateModal() {
    setFormMode("create");
  }

  function openEditModal(customerId: string) {
    setSelectedCustomerId(customerId);
    setFormMode("edit");
  }

  function closeFormModal() {
    setFormMode(null);
  }

  function handleSortChange(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "updatedAt" ? "desc" : "asc");
  }

  function getSortIndicator(columnKey: SortKey) {
    if (sortKey !== columnKey) {
      return "↕";
    }

    return sortDirection === "asc" ? "↑" : "↓";
  }

  async function handleToggleArchive(customer: Customer) {
    setIsActionPending(true);
    setError(null);

    try {
      await apiFetch(
        `/customers/${customer.id}/${customer.archivedAt ? "unarchive" : "archive"}`,
        {
          method: "POST",
        },
      );
      reloadCustomers(customer.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Kundenstatus konnte nicht geändert werden.",
      );
    } finally {
      setIsActionPending(false);
    }
  }

  const paginationKey = `${searchQuery}|${statusFilter}|${archiveFilter}|${sortKey}|${sortDirection}`;
  const pageCount = Math.max(1, Math.ceil(filteredCustomers.length / 7));
  const currentPage = Math.min(
    pagination.key === paginationKey ? pagination.page : 1,
    pageCount,
  );
  const visibleCustomers = filteredCustomers.slice(
    (currentPage - 1) * 7,
    currentPage * 7,
  );
  if (isLoading) {
    return <p className="p-8 text-sm text-zinc-400">Lädt...</p>;
  }

  if (error && customers.length === 0) {
    return <p className="p-8 text-sm text-red-600">{error}</p>;
  }

  return (
    <div
      className={`crm-page customers-page ${selectedCustomer ? "customer-is-open" : ""}`}
    >
      <div className="crm-page-heading flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Kunden</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Alle Kunden, Kontakte und Projektbeziehungen.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            <span className="text-base leading-none">+</span>
            Kunde anlegen
          </button>
        </div>
      </div>

      <nav className="crm-tabs" aria-label="Kundenstatus">
        {(["all", "ACTIVE", "LEAD", "INACTIVE"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={statusFilter === value}
            onClick={() => setStatusFilter(value)}
          >
            {value === "all" ? "Alle" : statusLabels[value]} (
            {
              customers.filter(
                (c) => !c.archivedAt && (value === "all" || c.status === value),
              ).length
            }
            )
          </button>
        ))}
      </nav>
      <div className="crm-customer-filters">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Kunden suchen ..."
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"
            />

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 focus:border-amber-400 focus:outline-none"
            >
              <option value="all">Alle Status</option>
              <option value="ACTIVE">Aktiv</option>
              <option value="LEAD">Lead</option>
              <option value="INACTIVE">Inaktiv</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      <div className="space-y-4 md:hidden">
        {visibleCustomers.map((customer) => (
          <article
            key={customer.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.04)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomerId(customer.id)}
                  className="text-left text-base font-semibold text-zinc-900 transition hover:text-amber-600"
                >
                  {customer.name}
                </button>
                <p className="mt-1 text-sm text-zinc-500">
                  {customer.customerNumber}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[customer.status]}`}
                >
                  {statusLabels[customer.status]}
                </span>
                {customer.archivedAt && (
                  <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                    Archiviert
                  </span>
                )}
              </div>
            </div>

            {customer.description && (
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                {customer.description}
              </p>
            )}

            <div className="mt-4 space-y-2 text-sm text-zinc-500">
              <p>Zuletzt geändert: {formatDate(customer.updatedAt)}</p>
              {customer.website ? (
                <a
                  href={customer.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-amber-600 hover:underline"
                >
                  {customer.website.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                <p>Keine Website hinterlegt</p>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <CustomerRowActions
                archiveLabel={
                  customer.archivedAt ? "Entarchivieren" : "Archivieren"
                }
                disabled={isActionPending}
                onArchiveToggle={() => handleToggleArchive(customer)}
                onDetails={() => setSelectedCustomerId(customer.id)}
                onEdit={() => openEditModal(customer.id)}
              />
            </div>
          </article>
        ))}
      </div>

      <div className="crm-table-container hidden md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-[0.18em] text-zinc-400">
                {sortableColumns.map((column) => (
                  <th key={column.key} className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSortChange(column.key)}
                      className={`inline-flex items-center gap-1.5 transition ${
                        sortKey === column.key
                          ? "text-zinc-700"
                          : "text-zinc-400 hover:text-zinc-600"
                      }`}
                    >
                      <span>{column.label}</span>
                      <span
                        className={`text-[0.8rem] ${
                          sortKey === column.key
                            ? "text-amber-600"
                            : "text-zinc-300"
                        }`}
                        aria-hidden="true"
                      >
                        {getSortIndicator(column.key)}
                      </span>
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">Website</th>
                <th className="px-4 py-3 text-right font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {visibleCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  data-selected={selectedCustomerId === customer.id}
                  className="border-b border-zinc-100 align-top last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => setSelectedCustomerId(customer.id)}
                      className="text-left"
                    >
                      <div className="font-medium text-zinc-900 transition hover:text-amber-600">
                        {customer.name}
                      </div>
                    </button>
                    {customer.description && (
                      <div className="mt-1 text-xs text-zinc-400">
                        {customer.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-zinc-600">
                    {customer.customerNumber}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[customer.status]}`}
                      >
                        {statusLabels[customer.status]}
                      </span>
                      {customer.archivedAt && (
                        <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-400">
                          Archiviert
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-zinc-500">
                    {formatDate(customer.updatedAt)}
                  </td>
                  <td className="px-4 py-4 text-zinc-600">
                    {customer.website ? (
                      <a
                        href={customer.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-600 hover:underline"
                      >
                        {customer.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end">
                      <CustomerRowActions
                        archiveLabel={
                          customer.archivedAt ? "Entarchivieren" : "Archivieren"
                        }
                        disabled={isActionPending}
                        onArchiveToggle={() => handleToggleArchive(customer)}
                        onDetails={() => setSelectedCustomerId(customer.id)}
                        onEdit={() => openEditModal(customer.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredCustomers.length === 0 && (
          <p className="p-8 text-center text-sm text-zinc-400">
            Keine Kunden gefunden.
          </p>
        )}
      </div>

      <footer className="crm-pagination">
        <span>
          {filteredCustomers.length
            ? `${(currentPage - 1) * 7 + 1}–${Math.min(currentPage * 7, filteredCustomers.length)}`
            : "0"}{" "}
          von {filteredCustomers.length}
        </span>
        <div>
          <button
            aria-label="Vorherige Seite"
            disabled={currentPage === 1}
            onClick={() =>
              setPagination({ key: paginationKey, page: currentPage - 1 })
            }
          >
            ‹
          </button>
          <span>
            {currentPage} / {pageCount}
          </span>
          <button
            aria-label="Nächste Seite"
            disabled={currentPage === pageCount}
            onClick={() =>
              setPagination({ key: paginationKey, page: currentPage + 1 })
            }
          >
            ›
          </button>
        </div>
      </footer>

      <CustomerFormModal
        customer={formMode === "edit" ? selectedCustomer : null}
        isOpen={
          formMode === "create" ||
          (formMode === "edit" && selectedCustomer !== null)
        }
        mode={formMode ?? "create"}
        onClose={closeFormModal}
        onSaved={(customerId) => {
          closeFormModal();
          reloadCustomers(customerId);
        }}
      />

      <CustomerDetailSheet
        customer={selectedCustomer}
        isActionPending={isActionPending}
        isOpen={selectedCustomer !== null}
        onClose={() => setSelectedCustomerId(null)}
        onEdit={() => selectedCustomer && openEditModal(selectedCustomer.id)}
        onToggleArchive={() =>
          selectedCustomer && handleToggleArchive(selectedCustomer)
        }
      />
    </div>
  );
}
