"use client";

// /admin: the Harbor Office. Three things can be on this screen depending
// on who is looking. Nobody signed in gets the ordinary sign in form.
// A player gets the form for presenting the admin key (and is told plainly
// when the server has none configured). A moderator or the admin gets the
// console itself. The server decides which of those applies on every
// request; this page only asks and renders the answer.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Anchor, Loader2 } from "lucide-react";
import { api, type SelfUser } from "@/lib/api";
import { isStaff, type Role } from "@/lib/admin/rules";
import { AuthScreen } from "@/components/portmasters/AuthScreen";
import { AdminConsole } from "@/components/portmasters/admin/AdminConsole";
import { ClaimSeatCard } from "@/components/portmasters/admin/ClaimSeatCard";

type View =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "claim"; me: SelfUser; configured: boolean; seatTaken: boolean }
  | { kind: "console"; me: SelfUser };

export default function AdminPage() {
  const [view, setView] = useState<View>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const { user } = await api.me();
      if (!user) {
        setView({ kind: "signedOut" });
        return;
      }
      const status = await api.admin.status();
      const me: SelfUser = { ...user, role: status.role };
      setView(
        isStaff(me.role)
          ? { kind: "console", me }
          : {
              kind: "claim",
              me,
              configured: status.configured,
              seatTaken: status.seatTaken,
            },
      );
    } catch {
      setView({ kind: "signedOut" });
    }
  }, []);

  useEffect(() => {
    // Kicked off on a timer so the state updates inside load() never run
    // synchronously within the effect body itself.
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // A role can only ever move in two directions from here: a player who
  // just claimed the empty seat becomes the admin, and a moderator who was
  // dismissed while the console was open becomes a player again. In the
  // second case the seat is necessarily still taken, so the claim view is
  // a closed door rather than a form.
  const onRoleChanged = useCallback((role: Role) => {
    setView((v) =>
      v.kind === "claim" || v.kind === "console"
        ? isStaff(role)
          ? { kind: "console", me: { ...v.me, role } }
          : {
              kind: "claim",
              me: { ...v.me, role },
              configured: true,
              seatTaken: true,
            }
        : v,
    );
  }, []);

  async function signOut() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    setView({ kind: "signedOut" });
  }

  if (view.kind === "loading") {
    return (
      <div className="pm-canvas min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="pm-grad-primary h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg">
            <Anchor className="h-6 w-6 text-white" />
          </div>
          <span className="text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Unlocking the office…
          </span>
        </div>
      </div>
    );
  }

  if (view.kind === "signedOut") {
    return <AuthScreen onAuthed={() => void load()} />;
  }

  if (view.kind === "claim") {
    return (
      <div className="pm-canvas min-h-screen w-full flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <ClaimSeatCard
            me={view.me}
            configured={view.configured}
            seatTaken={view.seatTaken}
            onClaimed={() => onRoleChanged("admin")}
          />
          <p className="text-center text-xs text-muted-foreground">
            <Link href="/" className="underline underline-offset-4">
              Back to the harbor
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <AdminConsole
      me={view.me}
      onSignOut={signOut}
      onRoleChanged={onRoleChanged}
    />
  );
}
