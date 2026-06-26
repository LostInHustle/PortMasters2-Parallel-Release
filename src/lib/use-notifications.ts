"use client";

import { useCallback, useRef, useState } from "react";

export type NotificationItem = {
  id: string;
  icon: string;
  title: string;
  lines: string[];
  at: number;
  onActivate?: () => void;
};

const HISTORY_LIMIT = 50;
const BUBBLE_DURATION_MS = 8000;

/**
 * Replaces sonner for the room's ambient event notifications (ledger
 * digests, harbor chat, direct messages): only ever one bubble visible at
 * a time, a new push replaces whatever's currently showing instead of
 * stacking, and nothing is actually lost since every push also lands in
 * `items`, the full history a notification button can expand to show.
 * Quick direct-feedback toasts (save confirmation, copy-code, errors)
 * stay on sonner; this hook is only for the kind of event someone could
 * otherwise miss entirely.
 */
export function useNotificationCenter() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [current, setCurrent] = useState<NotificationItem | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissCurrent = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setCurrent(null);
  }, []);

  const push = useCallback((item: Omit<NotificationItem, "id" | "at">) => {
    const full: NotificationItem = { ...item, id: `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, at: Date.now() };
    setItems((prev) => [full, ...prev].slice(0, HISTORY_LIMIT));
    setUnreadCount((n) => n + 1);
    setCurrent(full);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setCurrent(null), BUBBLE_DURATION_MS);
  }, []);

  const markAllRead = useCallback(() => setUnreadCount(0), []);

  return { items, current, unreadCount, push, dismissCurrent, markAllRead };
}
