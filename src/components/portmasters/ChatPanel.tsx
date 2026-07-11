"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ChatMessage, PublicUser } from "@/lib/api";
import type { Socket } from "socket.io-client";
import { Avatar } from "./shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SendHorizontal, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A self-contained chat surface. Two modes:
 *  - room: messages broadcast to a room channel (socket `chat:room`)
 *  - dm: 1-to-1 messages with another user (socket `chat:dm`)
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
}: {
  socket: Socket | null;
  me: PublicUser;
  mode: "room" | "dm";
  roomId?: string;
  other?: PublicUser;
  initialMessages?: ChatMessage[];
  className?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages ?? [],
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(
    new Set((initialMessages ?? []).map((m) => m.id)),
  );

  // Seed with initial messages if they change (e.g. switching DM target).
  useEffect(() => {
    setMessages(initialMessages ?? []);
    seenIds.current = new Set((initialMessages ?? []).map((m) => m.id));
  }, [initialMessages, mode, other?.id, roomId]);

  // Live socket listeners.
  useEffect(() => {
    if (!socket) return;
    const onRoom = (data: { roomId: string; message: ChatMessage }) => {
      if (mode !== "room" || data.roomId !== roomId) return;
      if (seenIds.current.has(data.message.id)) return;
      seenIds.current.add(data.message.id);
      setMessages((prev) => [
        ...prev,
        { ...data.message, mine: data.message.sender.id === me.id },
      ]);
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
      if (seenIds.current.has(message.id)) return;
      seenIds.current.add(message.id);
      setMessages((prev) => [
        ...prev,
        { ...message, mine: message.sender.id === me.id },
      ]);
    };
    socket.on("chat:room", onRoom);
    socket.on("chat:dm", onDm);
    return () => {
      socket.off("chat:room", onRoom);
      socket.off("chat:dm", onDm);
    };
  }, [socket, mode, roomId, other?.id, me.id]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");
    try {
      if (mode === "room" && roomId) {
        // Optimistic echo handled by server broadcast to room (including self).
        socket?.emit("chat:room", { roomId, content });
      } else if (mode === "dm" && other) {
        socket?.emit("chat:dm", { recipientId: other.id, content });
      }
    } finally {
      setSending(false);
    }
  }

  const emptyText =
    mode === "room"
      ? "No messages yet. Break the ice with your fellow captains."
      : "No messages yet between you two.";

  return (
    <div className={cn("flex h-full flex-col min-h-0", className)}>
      <div
        ref={scrollRef}
        className="pm-scroll flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-6">
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              {emptyText}
            </p>
          </div>
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
                    "flex flex-col max-w-[78%]",
                    mine ? "items-end" : "items-start",
                  )}
                >
                  {!mine && (
                    <span className="text-[10px] text-muted-foreground mb-0.5 px-1">
                      {m.sender.displayName}
                    </span>
                  )}
                  <div
                    className={cn(
                      "px-3 py-1.5 rounded-2xl text-[13px] leading-snug break-words",
                      mine
                        ? "pm-grad-primary text-white rounded-br-md"
                        : "bg-black/5 dark:bg-white/10 rounded-bl-md",
                    )}
                  >
                    {m.content}
                  </div>
                  <span className="text-[9px] text-muted-foreground/70 mt-0.5 px-1">
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
      <div className="p-2.5 border-t border-black/5 dark:border-white/10 flex items-center gap-2">
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
            mode === "room"
              ? "Message the harbor…"
              : `Message ${other?.displayName ?? ""}…`
          }
          className="h-9 rounded-full bg-black/5 dark:bg-white/10 border-0 text-sm"
          maxLength={1000}
        />
        <Button
          size="icon"
          onClick={send}
          disabled={!input.trim() || sending}
          className="h-9 w-9 rounded-full pm-grad-primary text-white shrink-0"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizontal className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
