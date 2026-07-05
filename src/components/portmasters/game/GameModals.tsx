"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { APP_NAME, GUIDE_TEXT, TIPS_TEXT, TUTORIAL_STEPS, RESOURCES, PRODUCTS, ICONS, COLORS } from "@/lib/game/constants";
import type { GameState } from "@/lib/game/types";
import { phaseLabel } from "@/lib/game/engine";
import type { PlayerDetailData } from "@/lib/use-player-detail";
import type { PublicUser } from "@/lib/api";
import type { CaptainLegacySummary } from "@/lib/game/legacy";
import { cn } from "@/lib/utils";
import { Avatar, Pill } from "../shared";
import { CaptainLegacyCard } from "../CaptainLegacyCard";
import { Sparkles, BookOpen, Lightbulb, ChevronLeft, ChevronRight, Coins, Trophy, Ship, Loader2, Eye, RotateCcw, Bell, BellOff } from "lucide-react";
import type { NotificationItem } from "@/lib/use-notifications";

export function GuideModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-teal-600 dark:text-teal-400" /> ⚓ Navigation Guide</DialogTitle>
          <DialogDescription className="sr-only">{APP_NAME} rules and shortcuts</DialogDescription>
        </DialogHeader>
        <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed bg-muted/40 rounded-lg p-3.5 max-h-[60vh] overflow-y-auto pm-scroll">{GUIDE_TEXT}</pre>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TipsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" /> 💡 Trade Strategy Advice</DialogTitle>
          <DialogDescription className="sr-only">Bankruptcy-avoidance strategies</DialogDescription>
        </DialogHeader>
        <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed bg-muted/40 rounded-lg p-3.5 max-h-[60vh] overflow-y-auto pm-scroll">{TIPS_TEXT}</pre>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The notification button's "expand" target: every ledger digest, harbor
 * chat message, and direct message that's arrived this session, newest
 * first. Only one ever shows as a floating bubble at a time (see
 * NotificationCenter.tsx); this is where the rest still are. A Dialog
 * here instead of a dropdown anchored to the button reuses the same
 * open/close pattern every other modal in this file already has, rather
 * than inventing click-outside/positioning logic from scratch.
 */
export function NotificationHistoryModal({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: NotificationItem[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-teal-600 dark:text-teal-400" />Notifications</DialogTitle>
          <DialogDescription className="sr-only">Every ledger update, harbor message, and direct message this session</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm py-10">
              <BellOff className="h-6 w-6" /> Nothing yet this voyage.
            </div>
          ) : (
            <div className="space-y-2 pr-2">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { n.onActivate?.(); onOpenChange(false); }}
                  className={cn(
                    "w-full text-left rounded-xl px-3.5 py-2.5 border border-black/5 dark:border-white/10 bg-background/50 transition-colors",
                    n.onActivate && "hover:border-teal-500/40 cursor-pointer",
                  )}
                >
                  <div className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                    <span className="text-base">{n.icon}</span> {n.title}
                    <span className="ml-auto text-[10px] text-muted-foreground font-normal">{new Date(n.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="space-y-0.5">
                    {n.lines.map((line, i) => (
                      <div key={i} className="text-[12.5px] text-foreground/80 leading-snug break-words">{line}</div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RumorBoardModal({
  open,
  onOpenChange,
  game,
  onBuy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  game: GameState;
  onBuy: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" /> 🗣️ Broker's Rumor Board</DialogTitle>
          <DialogDescription>Spend gold to reveal Phase 2 demand rumors!</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center my-2">
          <Button className="pm-grad-gold text-amber-950 rounded-xl" onClick={onBuy}>
            🔮 Buy Rumor ({game.intelCost}💰)
          </Button>
        </div>
        <div className="rounded-lg border border-teal-500/15 bg-teal-500/[0.04] p-3.5 min-h-[110px]">
          {game.revealedIntel.length ? (
            <>
              <div className="font-semibold text-teal-700 dark:text-teal-300 text-sm mb-1.5">📜 Revealed Intel:</div>
              {game.revealedIntel.map((i, idx) => (
                <div key={idx} className="text-[13px] py-0.5">• 🗣️ '{i.port} wants {i.item}'</div>
              ))}
            </>
          ) : (
            <div className="text-muted-foreground text-center py-5 text-sm">✨ No rumors revealed yet... Spend gold to listen to the Broker's whispers.</div>
          )}
        </div>
        <div className="flex justify-end mt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close Board</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Host-only confirmation before a restart goes out over the wire. A
 * restart resets every captain currently in the harbor back to round one,
 * not just whoever clicks the button, and re-opens the room to new joins,
 * so it's worth one extra click to make sure that's actually intended.
 */
export function RestartConfirmModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-rose-600 dark:text-rose-400" /> Restart the voyage?
          </DialogTitle>
          <DialogDescription>
            Every captain currently in this harbor goes back to round one: gold, cargo, workers, and ship upgrades all reset.
            The harbor also reopens, so new captains can join again. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            Restart for Everyone
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TutorialModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [step, setStep] = useState(0);
  const total = TUTORIAL_STEPS.length;
  const s = TUTORIAL_STEPS[step];
  const pct = Math.round(((step + 1) / total) * 100);
  const isLast = step === total - 1;

  function close() {
    setStep(0);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setStep(0);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base leading-tight pr-6">{s.title}</DialogTitle>
          <DialogDescription className="sr-only">Tutorial step {step + 1} of {total}</DialogDescription>
        </DialogHeader>
        <Progress value={pct} className="h-1.5 mb-4" />
        <div className="text-[13.5px] leading-relaxed text-foreground/90 min-h-[160px] [&_p]:mb-2 [&_div]:mb-1" dangerouslySetInnerHTML={{ __html: s.content }} />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mt-3 pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <span className="justify-self-center whitespace-nowrap text-[11px] text-muted-foreground">{step + 1} of {total}</span>
          {isLast ? (
            <Button size="sm" className="justify-self-end pm-grad-primary text-white" onClick={close}>🚢 Set Sail!</Button>
          ) : (
            <Button size="sm" className="justify-self-end pm-grad-primary text-white" onClick={() => setStep((s) => s + 1)}>
              Continue <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="text-center mt-2">
          <button onClick={close} className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground underline underline-offset-2">Skip tutorial</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// One stat, its own tile instead of a pill sharing a row with three
// others. Reused for every number the profile leads with (Gold,
// Reputation, Ship Level), so a future stat is one more tile, not a
// rework of a cramped row.
function ProfileStatTile({
  icon,
  value,
  label,
  toneClassName,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  toneClassName: string;
}) {
  return (
    <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.05] py-2 text-center">
      <div className={cn("text-sm font-semibold flex items-center justify-center gap-1", toneClassName)}>
        {icon} {value}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

/**
 * The "click a collapsed roster bar, see everything" popup. Doubles as a
 * bankrupt captain's spectator window. There's no separate read-only
 * board, watching the rest of the room just means opening their popups.
 *
 * Laid out as a profile: an identity header, a headline stat row, Renown
 * underneath it, then cargo/workers and modules/log side by side. The
 * previous version stacked seven separate boxes in one narrow column
 * inside a wide dialog, tightly packed text top to bottom while using
 * barely half the available width; this uses the width instead.
 */
export function PlayerDetailModal({
  open,
  onOpenChange,
  player,
  isMe,
  detail,
  loading,
  legacy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  player: PublicUser | null;
  isMe: boolean;
  detail: PlayerDetailData | null | undefined;
  loading: boolean;
  legacy: CaptainLegacySummary | null | undefined;
}) {
  const workerGroups = detail
    ? [
        { icon: "👩‍🔧", name: "Weavers", list: detail.weavers },
        { icon: "👩‍🎨", name: "Master Weavers", list: detail.masterWeavers },
        { icon: "🌸", name: "Sachet Makers", list: detail.sachetMakers },
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {player && <Avatar hue={player.avatarHue} name={player.displayName} size={44} />}
              <div>
                <DialogTitle className="flex items-center gap-2 text-base">
                  {player?.displayName ?? "Captain"}
                  {isMe && <span className="text-xs text-muted-foreground font-normal">(you)</span>}
                </DialogTitle>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {detail ? phaseLabel({ phase: detail.phase, currentRound: detail.round }) : loading ? "Loading…" : "Unavailable"}
                </div>
              </div>
            </div>
            {detail?.phase === "bankruptcy" && <Pill tone="rose" className="shrink-0">💥 Bankrupt, spectating</Pill>}
            {detail?.phase === "endgame" && <Pill tone="amber" className="shrink-0">🏁 Voyage complete</Pill>}
          </div>
          <DialogDescription className="sr-only">Detailed voyage status</DialogDescription>
        </DialogHeader>

        {!detail ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm py-10">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Asking the harbor master…</> : "Not available right now, they may have stepped away."}
          </div>
        ) : (
          <div className="space-y-3.5">
            {/* Headline: this voyage's numbers, each in its own tile
                instead of a row of pills competing for space. */}
            <div className="grid grid-cols-3 gap-2">
              <ProfileStatTile icon={<Coins className="h-3.5 w-3.5" />} value={detail.money} label="Gold" toneClassName="text-emerald-600 dark:text-emerald-400" />
              <ProfileStatTile icon={<Trophy className="h-3.5 w-3.5" />} value={detail.score} label="Reputation" toneClassName="text-amber-600 dark:text-amber-400" />
              <ProfileStatTile icon={<Ship className="h-3.5 w-3.5" />} value={detail.shipLevel} label="Ship Level" toneClassName="text-teal-600 dark:text-teal-400" />
            </div>

            {/* Renown is server side, account wide data (see
                src/lib/game/legacy.ts), so it's shown independently of
                the live cargo/workers/log below, which relies on that
                captain's own client relaying it back and can be
                unavailable if they've stepped away. */}
            {legacy && <CaptainLegacyCard legacy={legacy} compact />}

            {/* Body: cargo and workers on the left, modules and the log
                on the right, instead of four boxes stacked one under
                the other in a single narrow column. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              <div className="space-y-3.5">
                <div className="rounded-xl border border-teal-500/15 bg-teal-500/[0.03] p-3.5">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">📦 Cargo</h4>
                  <div className="grid grid-cols-2 gap-x-4">
                    <div>
                      <div className="text-[10px] font-medium text-muted-foreground mb-1">Raw Materials</div>
                      {RESOURCES.map((r) => (
                        <div key={r} className="flex items-center text-[12px] py-0.5">
                          <span className="mr-1.5">{ICONS[r]}</span>
                          <span className="flex-1" style={{ color: COLORS[r] }}>{r}</span>
                          <b style={{ color: COLORS[r] }}>{detail.inventory[r] || 0}</b>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="text-[10px] font-medium text-muted-foreground mb-1">Finished Goods</div>
                      {PRODUCTS.map((r) => (
                        <div key={r} className="flex items-center text-[12px] py-0.5">
                          <span className="mr-1.5">{ICONS[r]}</span>
                          <span className="flex-1" style={{ color: COLORS[r] }}>{r}</span>
                          <b style={{ color: COLORS[r] }}>{detail.inventory[r] || 0}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 dark:border-white/10 p-3.5">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">👥 Workers</h4>
                  {workerGroups.every((g) => g.list.length === 0) ? (
                    <p className="text-xs text-muted-foreground">No artisans hired yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {workerGroups.filter((g) => g.list.length > 0).map((g) => (
                        <div key={g.name}>
                          <div className="text-[11px] font-semibold mb-1">{g.icon} {g.name} ({g.list.length})</div>
                          {g.list.map((w, i) => (
                            <div key={i} className="text-[11px] text-muted-foreground">
                              {w.task ? `Working: ${w.task}${w.isSkilled ? " ⭐" : ""}` : `Idle${w.isSkilled ? " ⭐" : ""}`}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="rounded-xl border border-black/10 dark:border-white/10 p-3.5">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">🔧 Equipped Modules</h4>
                  {detail.equippedModules.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No modules installed.</p>
                  ) : (
                    <div className="space-y-1">
                      {detail.equippedModules.map((m) => (
                        <div key={m.id} className="text-[12px]">{m.icon} <strong>{m.name}</strong>: {m.desc}</div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-black/10 dark:border-white/10 p-3.5">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> Recent Log</h4>
                  <ScrollArea className="h-40 pr-2">
                    {detail.logs.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70 italic">Nothing logged yet.</p>
                    ) : (
                      <div className="space-y-0.5 font-mono text-[11px] leading-relaxed">
                        {detail.logs.map((l, i) => <div key={i} className="whitespace-pre-wrap break-words">{l}</div>)}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
