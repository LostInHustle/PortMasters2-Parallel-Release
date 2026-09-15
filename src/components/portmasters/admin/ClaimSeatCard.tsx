"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, type SelfUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "../shared";

// The form an ordinary player sees at /admin: present the admin key and
// the account becomes the one admin. Moderators never see this, since a
// moderator badge is handed out from the console by the admin, not
// claimed with a key.
export function ClaimSeatCard({
  me,
  configured,
  onClaimed,
}: {
  me: SelfUser;
  configured: boolean;
  onClaimed: () => void;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { previousAdmin } = await api.admin.claim(key.trim());
      toast.success("The admin seat is yours", {
        description: previousAdmin
          ? `${previousAdmin} has stepped down to an ordinary captain.`
          : "You are the first admin of this harbor.",
      });
      setKey("");
      onClaimed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="pm-glass-strong rounded-3xl p-7 sm:p-8"
    >
      <div className="flex flex-col items-center text-center mb-6">
        <div className="pm-grad-primary h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg mb-3">
          <ShieldCheck className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-lg font-bold tracking-tight">Harbor Office</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Moderation for this harbor lives here.
        </p>
      </div>

      <div className="flex items-center gap-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5 mb-5">
        <Avatar hue={me.avatarHue} name={me.displayName} size={30} />
        <div className="min-w-0 leading-tight">
          <div className="text-sm font-medium truncate">{me.displayName}</div>
          <div className="text-[10px] text-muted-foreground">
            @{me.username}
          </div>
        </div>
      </div>

      {configured ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Admin key</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="the key from the server environment"
                autoComplete="off"
                autoFocus
                className="h-11 pl-9"
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Whoever presents the key holds the admin seat. If another account
              holds it today, it moves to this one and they go back to being an
              ordinary captain.
            </p>
          </div>
          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-sm px-3.5 py-2.5">
              {error}
            </div>
          )}
          <Button
            type="submit"
            disabled={busy || !key.trim()}
            className="w-full h-11 pm-grad-primary hover:opacity-95 text-white font-semibold rounded-xl"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 mr-1" /> Take the seat
              </>
            )}
          </Button>
        </form>
      ) : (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-200 text-sm px-3.5 py-3 leading-relaxed">
          This server has no admin key configured, so the office is closed. Set{" "}
          <code className="font-mono text-xs">ADMIN_KEY</code> in the server
          environment and restart it to open the door.
        </div>
      )}
    </motion.div>
  );
}
