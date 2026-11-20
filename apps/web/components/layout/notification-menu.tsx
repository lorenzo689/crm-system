"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/auth-api";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  reminderId: string | null;
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "gerade eben";
  if (diffMinutes < 60) return `vor ${diffMinutes} Min.`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
  });
}

export function NotificationMenu() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function loadUnreadCount() {
    try {
      const { count } = await apiFetch<{ count: number }>(
        "/notifications/unread-count",
      );
      setUnreadCount(count);
    } catch {
      // Stillschweigend ignorieren - Badge-Zaehler ist nicht kritisch
    }
  }

  async function loadNotifications() {
    setIsLoading(true);
    try {
      const data = await apiFetch<Notification[]>("/notifications");
      setNotifications(data);
    } catch {
      // Fehler beim Laden der Liste - Dropdown bleibt einfach leer
    } finally {
      setIsLoading(false);
    }
  }

  // Polls the badge counter; state is only set from the request callback.
  useEffect(() => {
    let active = true;
    const refresh = () => {
      apiFetch<{ count: number }>("/notifications/unread-count")
        .then(({ count }) => {
          if (active) setUnreadCount(count);
        })
        .catch(() => undefined); // Badge-Zaehler ist nicht kritisch
    };
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

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

  function handleToggle() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      loadNotifications();
    }
  }

  async function handleMarkAsRead(id: string) {
    setNotifications((current) =>
      current.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    setUnreadCount((current) => Math.max(0, current - 1));
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "POST" });
    } catch {
      loadNotifications();
      loadUnreadCount();
    }
  }

  async function handleMarkAllAsRead() {
    setNotifications((current) =>
      current.map((n) => ({ ...n, readAt: new Date().toISOString() })),
    );
    setUnreadCount(0);
    try {
      await apiFetch("/notifications/read-all", { method: "POST" });
    } catch {
      loadNotifications();
      loadUnreadCount();
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={handleToggle}
        className="relative rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700"
        aria-label="Benachrichtigungen"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-zinc-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <p className="text-sm font-medium text-zinc-900">
              Benachrichtigungen
            </p>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs text-amber-600 hover:underline"
              >
                Alle als gelesen markieren
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">
                Lädt…
              </p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">
                Keine Benachrichtigungen.
              </p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() =>
                      !notification.readAt &&
                      handleMarkAsRead(notification.id)
                    }
                    className={`block w-full px-4 py-3 text-left transition hover:bg-zinc-50 ${
                      !notification.readAt ? "bg-amber-50/50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!notification.readAt && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      )}
                      <div className={notification.readAt ? "" : ""}>
                        <p className="text-sm font-medium text-zinc-900">
                          {notification.title}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {notification.message}
                        </p>
                        <p className="mt-1 text-xs text-zinc-400">
                          {formatRelativeTime(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
