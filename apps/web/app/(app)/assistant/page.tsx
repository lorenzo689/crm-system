"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiFetchRaw } from "@/lib/auth-api";
import { invalidateApi } from "@/lib/use-api";

type Proposal = {
  id: string;
  source: "CHAT" | "AGENT";
  kind: string;
  title: string;
  summary: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "FAILED";
  result: { href?: string } | null;
  error: string | null;
  createdAt: string;
};

type AiStatus = { configured: boolean; model: string; pendingProposals: number };
type ChatMessage = { role: "user" | "assistant"; content: string };
type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "done"; reply: string; proposals: Proposal[] }
  | { type: "error"; message: string };

const toolLabels: Record<string, string> = {
  list_customers: "Sucht Kunden",
  get_customer: "Liest Kundendaten",
  list_projects: "Sucht Projekte",
  list_tasks: "Liest Aufgaben",
  list_articles: "Prüft Artikel",
  list_sales_documents: "Prüft Belege",
  get_sales_document: "Liest Beleg",
  get_finance_summary: "Liest Kennzahlen",
  list_suppliers: "Sucht Lieferanten",
  search_documents: "Durchsucht Dokumente",
  read_document_text: "Liest Dokument",
  read_inbox: "Liest Posteingang",
  propose_task: "Bereitet Aufgabe vor",
  propose_quote: "Bereitet Angebot vor",
  propose_purchase_order: "Bereitet Bestellung vor",
  propose_dunning: "Bereitet Mahnung vor",
  propose_send_document: "Bereitet Versand vor",
  check_availability: "Prüft Verfügbarkeit",
  list_reservations: "Liest Reservierungen",
  list_supplier_invoices: "Prüft Eingangsrechnungen",
  list_bank_transactions: "Prüft Kontobuchungen",
  list_unbilled_time: "Prüft Arbeitszeiten",
  get_project_profitability: "Rechnet Projektmargen",
  propose_reservation: "Bereitet Reservierung vor",
  propose_credit_note: "Bereitet Gutschrift vor",
  propose_time_invoice: "Bereitet Zeitabrechnung vor",
};

const kindLabels: Record<string, string> = {
  CREATE_TASK: "Aufgabe",
  CREATE_QUOTE: "Angebot",
  CREATE_PURCHASE_ORDER: "Bestellung",
  SEND_DOCUMENT: "Versand",
  CREATE_RESERVATION: "Reservierung",
  CREATE_CREDIT_NOTE: "Gutschrift",
  INVOICE_TIME: "Zeitabrechnung",
  ESCALATE_DUNNING: "Mahnung",
};

const suggestions = [
  "Was ist heute wichtig?",
  "Welche Rechnungen sind überfällig?",
  "Welche Artikel müssen nachbestellt werden?",
  "Fasse die offenen Angebote zusammen.",
];

export default function AssistantPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-zinc-400">Lädt...</p>}>
      <Assistant />
    </Suspense>
  );
}

function Assistant() {
  const searchParams = useSearchParams();
  const initialQuestion = searchParams.get("q");
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatProposalIds, setChatProposalIds] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isRunningAgents, setIsRunningAgents] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  const loadProposals = useCallback(async () => {
    try {
      setProposals(await apiFetch<Proposal[]>("/ai/proposals"));
    } catch {
      /* the inbox is optional UI; the chat error state covers failures */
    }
  }, []);

  useEffect(() => {
    apiFetch<AiStatus>("/ai/status").then(setStatus).catch(() => undefined);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProposals();
  }, [loadProposals]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const send = useCallback(
    async (text: string, history: ChatMessage[]) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;
      const next: ChatMessage[] = [...history, { role: "user", content: trimmed }];
      setMessages(next);
      setInput("");
      setError(null);
      setIsSending(true);
      try {
        const response = await apiFetchRaw("/ai/chat/stream", {
          method: "POST",
          body: JSON.stringify({ messages: next.slice(-30) }),
        });
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Keine Antwort erhalten");
        const decoder = new TextDecoder();
        let buffer = "";
        let streamed = "";
        setMessages([...next, { role: "assistant", content: "" }]);

        const handle = (event: StreamEvent) => {
          if (event.type === "text") {
            streamed += event.delta;
            setActiveTool(null);
            setMessages([...next, { role: "assistant", content: streamed }]);
          } else if (event.type === "tool") {
            setActiveTool(toolLabels[event.name] ?? event.name);
          } else if (event.type === "done") {
            setMessages([...next, { role: "assistant", content: event.reply }]);
            setChatProposalIds((current) => {
              const merged = new Set(current);
              event.proposals.forEach((proposal) => merged.add(proposal.id));
              return merged;
            });
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        };

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.trim();
            if (line.startsWith("data: ")) {
              handle(JSON.parse(line.slice(6)) as StreamEvent);
            }
          }
        }
        await loadProposals();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error ? caughtError.message : "Anfrage fehlgeschlagen",
        );
      } finally {
        setIsSending(false);
        setActiveTool(null);
      }
    },
    [isSending, loadProposals],
  );

  useEffect(() => {
    if (initialQuestion && status?.configured && !sentInitial.current) {
      sentInitial.current = true;
      void send(initialQuestion, []);
    }
  }, [initialQuestion, status, send]);

  async function decide(proposal: Proposal, action: "approve" | "reject") {
    setBusyId(proposal.id);
    try {
      await apiFetch(`/ai/proposals/${proposal.id}/${action}`, { method: "POST" });
      if (action === "approve") {
        // An approved proposal created or changed data other pages may have cached.
        ["/sales-documents", "/purchase-orders", "/articles"].forEach(invalidateApi);
      }
      await loadProposals();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Aktion fehlgeschlagen");
    } finally {
      setBusyId(null);
    }
  }

  async function runAgents() {
    setIsRunningAgents(true);
    try {
      await apiFetch("/ai/agents/run", { method: "POST" });
      await loadProposals();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Agentenlauf fehlgeschlagen");
    } finally {
      setIsRunningAgents(false);
    }
  }

  const pending = proposals.filter((proposal) => proposal.status === "PENDING");
  const history = proposals.filter((proposal) => proposal.status !== "PENDING");

  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_420px] lg:p-8">
      <section className="flex min-h-[70vh] flex-col rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <p className="text-xs font-medium tracking-[0.28em] text-amber-600">KI-ASSISTENT</p>
          <h1 className="mt-1 text-xl font-semibold text-zinc-900">Frag dein System</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Der Assistent liest deine Daten und macht Vorschläge. Geändert wird erst nach deiner Freigabe.
          </p>
        </div>

        {status && !status.configured ? (
          <div className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">KI ist noch nicht aktiviert.</p>
            <p className="mt-1">
              Trage <code className="rounded bg-white px-1">ANTHROPIC_API_KEY</code> in{" "}
              <code className="rounded bg-white px-1">apps/api/.env</code> ein und starte die API neu.
              Die automatischen Vorschläge rechts funktionieren auch ohne Key.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {messages.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send(suggestion, messages)}
                      className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              {messages.filter((message) => message.content).map((message, index) => (
                <div
                  key={index}
                  className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                      message.role === "user"
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-800"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex justify-start">
                  <div className="animate-pulse rounded-2xl bg-zinc-100 px-4 py-2.5 text-sm text-zinc-500">
                    {activeTool ? `${activeTool}…` : "Denkt nach…"}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {error && <p className="px-5 pb-2 text-sm text-red-600">{error}</p>}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(input, messages);
              }}
              className="flex gap-2 border-t border-zinc-100 p-4"
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="z. B. Erstelle ein Angebot für Kunde X über 20 Par-LEDs…"
                maxLength={8000}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                Senden
              </button>
            </form>
          </>
        )}
      </section>

      <aside className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">
            Vorschläge zur Freigabe{" "}
            <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              {pending.length}
            </span>
          </h2>
          <button
            type="button"
            onClick={() => void runAgents()}
            disabled={isRunningAgents}
            className="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-50"
          >
            {isRunningAgents ? "Prüft…" : "Jetzt prüfen"}
          </button>
        </div>

        {pending.length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-400">
            Keine offenen Vorschläge. Der Agent prüft täglich um 06:00 Uhr überfällige Rechnungen,
            unbeantwortete Angebote und Mindestbestände.
          </p>
        )}

        {pending.map((proposal) => (
          <article
            key={proposal.id}
            className={`rounded-xl border bg-white p-4 ${
              chatProposalIds.has(proposal.id) ? "border-amber-300" : "border-zinc-200"
            }`}
          >
            <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-wide text-zinc-400">
              <span>{kindLabels[proposal.kind] ?? proposal.kind}</span>
              <span>·</span>
              <span>{proposal.source === "AGENT" ? "Agent" : "Chat"}</span>
            </div>
            <h3 className="mt-1 text-sm font-medium text-zinc-900">{proposal.title}</h3>
            {proposal.summary && (
              <p className="mt-1 text-xs text-zinc-500">{proposal.summary}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busyId === proposal.id}
                onClick={() => void decide(proposal, "approve")}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                Freigeben
              </button>
              <button
                type="button"
                disabled={busyId === proposal.id}
                onClick={() => void decide(proposal, "reject")}
                className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50"
              >
                Verwerfen
              </button>
            </div>
          </article>
        ))}

        <button
          type="button"
          onClick={() => setShowHistory((value) => !value)}
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          {showHistory ? "Verlauf ausblenden" : `Verlauf anzeigen (${history.length})`}
        </button>

        {showHistory &&
          history.map((proposal) => (
            <div key={proposal.id} className="rounded-lg border border-zinc-100 p-3 text-xs">
              <div className="flex justify-between gap-2">
                <span className="font-medium text-zinc-700">{proposal.title}</span>
                <span
                  className={
                    proposal.status === "APPROVED"
                      ? "text-emerald-700"
                      : proposal.status === "FAILED"
                        ? "text-red-600"
                        : "text-zinc-400"
                  }
                >
                  {{ APPROVED: "Ausgeführt", REJECTED: "Verworfen", FAILED: "Fehlgeschlagen", PENDING: "" }[proposal.status]}
                </span>
              </div>
              {proposal.error && <p className="mt-1 text-red-600">{proposal.error}</p>}
              {proposal.result?.href && (
                <Link href={proposal.result.href} className="mt-1 inline-block text-amber-700 underline">
                  Öffnen
                </Link>
              )}
            </div>
          ))}
      </aside>
    </div>
  );
}
