"use client";

import { useEffect, useRef } from "react";

export function GameLogPanel({ logs }: { logs: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="pm-glass rounded-2xl px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <span className="text-[11px] font-semibold text-muted-foreground tracking-wide">
          📜 CAPTAIN'S LEDGER
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {logs.length} entries
        </span>
      </div>
      <div
        ref={ref}
        className="pm-scroll h-32 overflow-y-auto pr-2 font-mono text-[11px] leading-relaxed"
      >
        {logs.length === 0 ? (
          <div className="text-muted-foreground/60 italic px-1 py-2">
            The ledger is empty. Set sail to begin recording your voyage.
          </div>
        ) : (
          logs.slice(-100).map((m, i) => (
            <div
              key={i}
              className="px-1 py-0.5 border-b border-black/[0.04] dark:border-white/[0.04] whitespace-pre-wrap break-words"
            >
              {m}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
