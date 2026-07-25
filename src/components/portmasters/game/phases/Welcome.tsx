"use client";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/game/constants";
import { cn } from "@/lib/utils";
import { Ship, BookOpen } from "lucide-react";
import type { PublicUser } from "@/lib/api";
import { Avatar } from "../../shared";
import type { PhaseSync } from "./PhaseShared";

// The pre-voyage lobby roster: just avatars and a headcount, no ready/not
// ready state since there's nothing to ready up for yet. Separate from
// ReadyBar (used everywhere else) on purpose, since reusing its check
// marks here would imply a vote that doesn't exist for this screen.
function HarborRoster({
  members,
  ids,
}: {
  members: PublicUser[];
  ids: string[];
}) {
  if (ids.length === 0) return null;
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        {ids.map((id) => {
          const m = byId.get(id);
          return m ? (
            <Avatar
              key={id}
              hue={m.avatarHue}
              name={m.displayName}
              size={28}
              ring
            />
          ) : null;
        })}
      </div>
      <div className="text-xs text-muted-foreground">
        {ids.length} captain{ids.length !== 1 ? "s" : ""} in the harbor
      </div>
    </div>
  );
}

function InfoCard({
  tone,
  title,
  rows,
}: {
  tone: "emerald" | "amber" | "sea" | "rose";
  title: string;
  rows: string[];
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-500/[0.06] border-emerald-500/20",
    amber: "bg-amber-500/[0.06] border-amber-500/20",
    sea: "bg-teal-500/[0.06] border-teal-500/20",
    rose: "bg-rose-500/[0.06] border-rose-500/20",
  };
  return (
    <div className={cn("rounded-lg border p-3", tones[tone])}>
      <div className="font-semibold text-sm mb-1">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="text-xs">
          {r}
        </div>
      ))}
    </div>
  );
}

export function Welcome({
  phaseSync,
  members,
  isHost,
  onShowTutorial,
}: {
  phaseSync: PhaseSync;
  members: PublicUser[];
  isHost: boolean;
  onShowTutorial: () => void;
}) {
  const harborIds = phaseSync.ready?.requiredUserIds ?? [];
  const canStart = harborIds.length >= 2;
  return (
    <div className="max-w-3xl mx-auto text-center py-4">
      <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-1">
        <span className="pm-text-sea">⚓ {APP_NAME} 🚢</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        🌊 Eight Voyages await, become the Sea Master!
      </p>
      <div className="flex flex-col items-center gap-3 mb-6">
        <HarborRoster members={members} ids={harborIds} />
        {isHost ? (
          <>
            <Button
              size="lg"
              className={cn(
                "rounded-xl h-12 px-8 text-base",
                canStart && "pm-grad-primary text-white",
              )}
              variant={canStart ? "default" : "secondary"}
              disabled={!canStart}
              onClick={() => phaseSync.startGame()}
            >
              <Ship className="h-5 w-5 mr-2" />
              {canStart
                ? "Start the Voyage"
                : `Need at least 2 captains (${harborIds.length}/2)`}
            </Button>
            {phaseSync.startError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {phaseSync.startError}
              </p>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            ⏳ Waiting for the host to start the voyage… ({harborIds.length} in
            harbor)
          </div>
        )}
        <Button variant="ghost" className="rounded-xl" onClick={onShowTutorial}>
          <BookOpen className="h-4 w-4 mr-2" />
          New Player Tutorial
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left max-w-2xl mx-auto">
        <InfoCard
          tone="emerald"
          title="🚀 Starting Resources"
          rows={["📦 Hemp×8, Silk×5, Tea×3", "💰 100 Gold starting funds"]}
        />
        <InfoCard
          tone="amber"
          title="⏱️ Production Delay"
          rows={[
            "Assign task now → item arrives at Phase 3",
            "Workers don't produce instantly!",
          ]}
        />
        <InfoCard
          tone="sea"
          title="💸 Round-End Costs"
          rows={[
            "🔧 Maintenance: 15 Gold (fixed each round)",
            "👥 Wages settled at Phase 3, not on hire",
          ]}
        />
        <InfoCard
          tone="rose"
          title="🧾 Taxes Explained"
          rows={[
            "VAT: 5% of finished-good profit margin",
            "Income Tax: 10% of round net profit",
          ]}
        />
        <InfoCard
          tone="amber"
          title="🏴‍☠️ Pirates & Borrowing"
          rows={[
            "20% chance of losing all Gold each round",
            "Hire an escort, or ask the harbor for a loan",
          ]}
        />
      </div>
      <div className="max-w-2xl mx-auto mt-3 space-y-2">
        <div className="rounded-lg bg-teal-500/[0.06] border border-teal-500/15 px-3.5 py-2.5 text-xs">
          <strong>🔄 4 Phases per Voyage:</strong> 1️⃣ Buy at Ports (+ 🤝 Barter)
          → 2️⃣ Fill Trade Orders → 3️⃣ Pirates, Wages & Maintenance → 4️⃣ Upgrade
          Ship
        </div>
        <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/15 px-3.5 py-2.5 text-xs">
          <strong>💡 New Player Tip:</strong> Rely on raw material orders early.
          Hire artisans only when you can sustain at least 2 rounds of wages.
          Always keep funds &gt; Maintenance + All Wages.
        </div>
      </div>
    </div>
  );
}
