"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function GameLogPanel({
  logs,
  embedded,
}: {
  logs: string[];
  // Drops the glass card chrome when the ledger is rendered inside another
  // panel (the captain rail's Ledger tab), so it does not read as a card
  // nested in a card.
  embedded?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Follow new entries only while the reader is at the live end. Scrolling
  // back through an old round no longer snaps to the bottom under them.
  const stickRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [logs]);

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 32;
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        !embedded && "pm-glass rounded-2xl px-3 py-2.5",
      )}
    >
      <div className="mb-1.5 flex shrink-0 items-center justify-between px-1">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">
          {embedded ? "📜 LEDGER" : "📜 CAPTAIN'S LEDGER"}
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {logs.length} entries
        </span>
      </div>
      <div
        ref={ref}
        onScroll={onScroll}
        className={cn(
          "pm-scroll overflow-y-auto pr-2 font-mono text-[11px] leading-relaxed",
          // Embedded it always fills the tab; standalone it keeps its fixed
          // height on small screens and only fills on the desktop rail.
          embedded ? "min-h-0 flex-1" : "h-32 lg:h-auto lg:min-h-0 lg:flex-1",
        )}
      >
        {logs.length === 0 ? (
          <div className="px-1 py-2 text-muted-foreground/60 italic">
            The ledger is empty. Set sail to begin recording your voyage.
          </div>
        ) : (
          logs.slice(-100).map((m, i) => (
            <div
              key={i}
              className="border-b border-black/[0.04] px-1 py-0.5 break-words whitespace-pre-wrap dark:border-white/[0.04]"
            >
              {m}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
