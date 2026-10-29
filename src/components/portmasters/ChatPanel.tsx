"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ChatMessage, PublicUser } from "@/lib/api";
import type { Socket } from "socket.io-client";
import { Avatar, EmptyState } from "./shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SendHorizontal, Loader2, ArrowDown } from "lucide-react";
import { clockTime, cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * A self contained chat surface. Three modes: room, messages broadcast to a
 * room channel (socket `chat:room`); lobby, messages broadcast to every
 * captain in the main lobby (socket `chat:lobby`); dm, one to one messages
 * with another user (socket `chat:dm`).
 *
 * The socket is passed in (shared singleton). Initial history is fetched
 * via REST; live messages arrive over the socket.
 */
export function ChatPanel({
  socket,
  me,
  mode,
  roomId,
  other,
  initialMessages,
  className,
  disabled,
}: {
  socket: Socket | null;
  me: PublicUser;
  mode: "room" | "lobby" | "dm";
  roomId?: string;
  other?: PublicUser;
  initialMessages?: ChatMessage[];
  className?: string;
  // [MANIFEST 14: Harbor Watch] Set only for the room mode instance, only
  // while the host has muted this captain. A muted captain keeps reading
  // room chat live same as anyone; they just can't post to it until the
  // voyage ends, which is enforced again server side regardless of this
  // prop, so a stale client can never actually post past the block.
  disabled?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages ?? [],
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the reader is parked at the live edge. Only then does a new
  // message pull the view down. Someone reading back through the log stays
  // exactly where they were, and gets a quiet "New messages" control once
  // there is something below to return to.
  const stickRef = useRef(true);

  // Seed with initial messages if they change (e.g. switching DM target, or
  // the parent's history fetch resolving after this already mounted). Done as
  // a render time adjustment rather than in an effect: React throws away the
  // in progress render and immediately rerenders with the new state, instead
  // of committing one pass and then cascading a second one, which is what an
  // effect calling setState synchronously does (react-hooks/set-state-in-effect).
  const seedKey = `${mode}:${roomId ?? ""}:${other?.id ?? ""}`;
  const [seed, setSeed] = useState<{
    key: string;
    source: ChatMessage[] | undefined;
  }>({ key: seedKey, source: initialMessages });
  if (seed.key !== seedKey || seed.source !== initialMessages) {
    setSeed({ key: seedKey, source: initialMessages });
    setMessages(initialMessages ?? []);
    setShowJump(false);
  }

  // A fresh channel (a new DM target, or history arriving after mount)
  // starts at its live edge. Declared before the autoscroll effect below so
  // the stick flag is already true when that one runs in the same pass.
  useLayoutEffect(() => {
    stickRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [seedKey]);

  // Live socket listeners.
  useEffect(() => {
    if (!socket) return;
    // Dedupe against the list itself rather than a separate ref of seen ids.
    // Returning `prev` untouched for a message already present means React
    // bails out on the identical reference, so a duplicate costs no rerender.
    const onRoom = (data: { roomId: string; message: ChatMessage }) => {
      if (mode !== "room" || data.roomId !== roomId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === data.message.id)
          ? prev
          : [
              ...prev,
              { ...data.message, mine: data.message.sender.id === me.id },
            ],
      );
    };
    const onLobby = (data: { message: ChatMessage }) => {
      if (mode !== "lobby") return;
      setMessages((prev) =>
        prev.some((m) => m.id === data.message.id)
          ? prev
          : [
              ...prev,
              { ...data.message, mine: data.message.sender.id === me.id },
            ],
      );
    };
    const onDm = (message: ChatMessage) => {
      if (mode !== "dm") return;
      const involvesMe =
        message.sender.id === me.id || message.recipient?.id === me.id;
      if (!involvesMe) return;
      // Only show if this DM is between me and `other`.
      const otherId = other?.id;
      const peerId =
        message.sender.id === me.id ? message.recipient?.id : message.sender.id;
      if (otherId && peerId !== otherId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === message.id)
          ? prev
          : [...prev, { ...message, mine: message.sender.id === me.id }],
      );
    };
    // [MANIFEST 14: Harbor Watch] Defensive: the disabled prop already hides
    // the input the moment a mute takes effect, so this should be
    // unreachable in ordinary use. It only ever fires for a stale client.
    const onMuted = (data: { roomId: string }) => {
      if (mode !== "room" || data.roomId !== roomId) return;
      toast.error("You're muted", {
        description: "The host has muted you in room chat this voyage.",
      });
    };
    socket.on("chat:room", onRoom);
    socket.on("chat:lobby", onLobby);
    socket.on("chat:dm", onDm);
    socket.on("chat:muted", onMuted);
    return () => {
      socket.off("chat:room", onRoom);
      socket.off("chat:lobby", onLobby);
      socket.off("chat:dm", onDm);
      socket.off("chat:muted", onMuted);
    };
  }, [socket, mode, roomId, other?.id, me.id]);

  // Follow the live edge only when the reader is already there. A layout
  // effect rather than a passive one so the new bubble is placed before the
  // browser paints, which avoids a visible one frame scroll.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function scrollToLatest(behavior: ScrollBehavior = "smooth") {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setShowJump(false);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : behavior });
  }

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 28;
    stickRef.current = atBottom;
    setShowJump(!atBottom);
  }

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    stickRef.current = true;
    setShowJump(false);
    try {
      if (mode === "room" && roomId) {
        // Echo handled by the server broadcast to the room, including self.
        socket?.emit("chat:room", { roomId, content });
      } else if (mode === "lobby") {
        socket?.emit("chat:lobby", { content });
      } else if (mode === "dm" && other) {
        socket?.emit("chat:dm", { recipientId: other.id, content });
      }
    } finally {
      setSending(false);
    }
  }

  const emptyTitle =
    mode === "dm" ? "A private channel" : "The harbor is quiet";
  const emptyHint =
    mode === "dm"
      ? "No messages yet between you two."
      : "Say hello, or share a rumor from the docks.";

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", className)}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-label={mode === "dm" ? "Direct messages" : "Harbor chat"}
        className="pm-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 ? (
          <EmptyState title={emptyTitle} hint={emptyHint} className="h-full" />
        ) : (
          messages.map((m) => {
            const mine = m.mine ?? m.sender.id === me.id;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "flex gap-2",
                  mine ? "flex-row-reverse" : "flex-row",
                )}
              >
                <Avatar
                  hue={m.sender.avatarHue}
                  name={m.sender.displayName}
                  size={26}
                />
                <div
                  className={cn(
                    "flex max-w-[78%] flex-col",
                    mine ? "items-end" : "items-start",
                  )}
                >
                  {!mine && (
                    <span className="mb-0.5 px-1 text-[10px] text-muted-foreground">
                      {m.sender.displayName}
                    </span>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-1.5 text-[13px] leading-snug break-words",
                      mine
                        ? "pm-grad-primary rounded-br-md text-white"
                        : "rounded-bl-md bg-black/5 dark:bg-white/10",
                    )}
                  >
                    {m.content}
                  </div>
                  <span className="mt-0.5 px-1 text-[9px] text-muted-foreground/70">
                    {clockTime(m.createdAt)}
                  </span>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {showJump && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 z-10 flex justify-center",
            disabled ? "bottom-16" : "bottom-[3.75rem]",
          )}
        >
          <button
            type="button"
            onClick={() => scrollToLatest("smooth")}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground shadow-md"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            New messages
          </button>
        </div>
      )}

      {disabled ? (
        <div className="border-t border-black/5 p-2.5 text-center text-xs text-muted-foreground dark:border-white/10">
          The host has muted you in room chat for the rest of this voyage.
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-black/5 p-2.5 dark:border-white/10">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              mode === "dm"
                ? `Message ${other?.displayName ?? ""}…`
                : "Message the harbor…"
            }
            className="h-9 rounded-full border-0 bg-black/5 text-sm dark:bg-white/10"
            maxLength={1000}
            aria-label={mode === "dm" ? "Message" : "Message the harbor"}
          />
          <Button
            size="icon"
            onClick={send}
            disabled={!input.trim() || sending}
            aria-label="Send message"
            className="pm-grad-primary h-9 w-9 shrink-0 rounded-full text-white"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
