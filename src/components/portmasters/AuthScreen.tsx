"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, type PublicUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Anchor, Ship, Waves } from "lucide-react";
import { APP_NAME } from "@/lib/game/constants";

export function AuthScreen({
  onAuthed,
}: {
  onAuthed: (u: PublicUser, token: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // shared
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // register-only
  const [displayName, setDisplayName] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user, token } =
        mode === "login"
          ? await api.login({ username: username.trim(), password })
          : await api.register({
              username: username.trim(),
              password,
              displayName: displayName.trim() || undefined,
            });
      onAuthed(user, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pm-canvas min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative floating orbs */}
      <motion.div
        className="pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, oklch(0.7 0.14 190 / 0.45), transparent 70%)",
        }}
        animate={{ y: [0, 18, 0], x: [0, 10, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, oklch(0.78 0.14 85 / 0.4), transparent 70%)",
        }}
        animate={{ y: [0, -20, 0], x: [0, -12, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="pm-glass-strong rounded-3xl p-7 sm:p-9"
        >
          {/* Brand */}
          <div className="flex flex-col items-center text-center mb-7">
            <div className="relative mb-4">
              <div className="pm-grad-primary absolute inset-0 rounded-2xl blur-md opacity-60" />
              <div className="relative pm-grad-primary h-16 w-16 rounded-2xl flex items-center justify-center shadow-lg">
                <Anchor className="h-8 w-8 text-white" strokeWidth={2.2} />
              </div>
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              <span className="pm-text-sea">{APP_NAME}</span>
            </h1>
            <p className="text-xs mt-1.5 text-muted-foreground flex items-center gap-1.5">
              <Waves className="h-3.5 w-3.5" /> Lords of the Silk Road · Online
            </p>
          </div>

          <Tabs
            value={mode}
            onValueChange={(v) => {
              setMode(v as "login" | "register");
              setError(null);
            }}
          >
            <TabsList className="grid w-full grid-cols-2 mb-5">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <form onSubmit={submit} className="space-y-4">
              <TabsContent value="login" className="space-y-4 mt-0">
                <Field label="Captain Name">
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="your captain name"
                    autoFocus
                    autoComplete="username"
                    className="h-11"
                  />
                </Field>
                <Field label="Password">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    autoComplete="current-password"
                    className="h-11"
                  />
                </Field>
              </TabsContent>

              <TabsContent value="register" className="space-y-4 mt-0">
                <Field
                  label="Captain Name"
                  hint="3 to 20 chars, letters / numbers / _"
                >
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="choose a captain name"
                    autoFocus
                    autoComplete="username"
                    className="h-11"
                  />
                </Field>
                <Field label="Display Name" hint="shown to other sailors">
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Captain Mei"
                    maxLength={24}
                    className="h-11"
                  />
                </Field>
                <Field label="Password" hint="at least 6 characters">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    autoComplete="new-password"
                    className="h-11"
                  />
                </Field>
              </TabsContent>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-sm px-3.5 py-2.5"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                type="submit"
                disabled={loading || !username || !password}
                className="w-full h-11 pm-grad-primary hover:opacity-95 text-white font-semibold rounded-xl shadow-lg shadow-teal-500/20"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === "login" ? (
                  <>
                    <Ship className="h-4 w-4 mr-2" /> Set Sail
                  </>
                ) : (
                  <>
                    <Anchor className="h-4 w-4 mr-2" /> Hoist the Colours
                  </>
                )}
              </Button>
            </form>
          </Tabs>

          <p className="text-center text-[11px] text-muted-foreground/80 mt-6 leading-relaxed">
            Open this page in another browser to register a second captain and
            see them appear online in real time.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && (
          <span className="text-[10px] text-muted-foreground">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}
