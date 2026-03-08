"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Send,
  Loader2,
  Search,
  ChevronRight,
  UserCircle,
  AlertTriangle,
  Package,
  Clock,
  CheckCircle2,
  ArrowRight,
  Headphones,
  RefreshCw,
  Hash,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import useUser from "~/hooks/useUser";
import { MarkdownContent } from "~/components/agent/MarkdownContent";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface ChatMessage {
  role: string;
  content: string;
  timestamp: string;
  is_human?: boolean;
  agent_name?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ChatTicket {
  _id: string;
  session_id: string;
  visitor_id: string | null;
  visitor_name: string | null;
  visitor_email: string | null;
  status: string;
  channel: string;
  metadata: Record<string, unknown> | null;
  messages: ChatMessage[];
  message_count: number;
  last_message: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

const statusColors: Record<string, { bg: string; text: string }> = {
  open: { bg: "bg-blue-500/10", text: "text-blue-500" },
  active: { bg: "bg-sky-500/10", text: "text-sky-500" },
  resolved: { bg: "bg-emerald-500/10", text: "text-emerald-500" },
  closed: { bg: "bg-muted", text: "text-muted-foreground" },
};

export default function AdminSupportPage() {
  const { user } = useUser();

  const [chats, setChats] = useState<ChatTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "escalated" | "resolved">("escalated");
  const [search, setSearch] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        const el = scrollRef.current.querySelector(
          "[data-radix-scroll-area-viewport]"
        );
        if (el) el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "24px";
      const sh = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(sh, 120)}px`;
    }
  }, [input]);

  // fetch chats - only escalated by default
  const fetchChats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter === "escalated") params.set("status", "escalated");
      else if (filter === "open") params.set("status", "open");
      else if (filter === "resolved") params.set("status", "resolved");

      const res = await fetch(
        `${API_BASE_URL}/api/admin/chats?${params.toString()}`
      );
      if (res.ok) {
        const data = await res.json();
        const list: ChatTicket[] = data.data?.chats || [];
        setChats(list);
      }
    } catch {
      // silent
    } finally {
      setIsLoadingChats(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // poll chats every 6 seconds
  useEffect(() => {
    const interval = setInterval(fetchChats, 6000);
    return () => clearInterval(interval);
  }, [fetchChats]);

  // fetch messages for selected chat
  const fetchMessages = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/chats/${chatId}/messages`
      );
      if (res.ok) {
        const data = await res.json();
        const msgs: ChatMessage[] = data.data?.messages || [];
        setMessages(msgs);
      }
    } catch {
      // silent
    }
  }, []);

  // when selecting a chat
  const handleSelectChat = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setIsLoadingMessages(true);
      setMessages([]);
      await fetchMessages(id);
      setIsLoadingMessages(false);
    },
    [fetchMessages]
  );

  // poll messages for selected chat
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (selectedId) {
      pollingRef.current = setInterval(() => {
        fetchMessages(selectedId);
      }, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [selectedId, fetchMessages]);

  // send admin message
  const handleSend = async () => {
    if (!input.trim() || isSending || !selectedId || !user?.id) return;

    const content = input.trim();
    setIsSending(true);
    setInput("");

    // optimistic update
    const optimistic: ChatMessage = {
      role: "admin",
      content,
      timestamp: new Date().toISOString(),
      is_human: true,
      agent_name: user.name || "Admin",
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/chats/${selectedId}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_id: user.id,
            content,
          }),
        }
      );

      if (!res.ok) {
        toast.error("Failed to send message");
      } else {
        await fetchMessages(selectedId);
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selected = chats.find((c) => c._id === selectedId);
  const isClosed = selected?.status === "resolved" || selected?.status === "closed";

  const filteredChats = search
    ? chats.filter(
        (c) =>
          c.session_id.toLowerCase().includes(search.toLowerCase()) ||
          c.visitor_name?.toLowerCase().includes(search.toLowerCase()) ||
          c.visitor_email?.toLowerCase().includes(search.toLowerCase()) ||
          c.last_message.toLowerCase().includes(search.toLowerCase())
      )
    : chats;

  return (
    <div className="flex h-full overflow-hidden">
      {/* left: chats list */}
      <div className="flex w-80 flex-col border-r overflow-hidden">
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Escalated Chats</span>
            <span className="text-[10px] text-muted-foreground">
              ({chats.length})
            </span>
          </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchChats}
              className="h-7 w-7 p-0"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  isLoadingChats && "animate-spin"
                )}
              />
            </Button>
          </div>

          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search chats..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>

          <div className="flex items-center gap-1">
            {(
              [
                { value: "escalated", label: "Escalated" },
                { value: "all", label: "All" },
                { value: "open", label: "Open" },
                { value: "resolved", label: "Resolved" },
              ] as const
            ).map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                  filter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoadingChats && chats.length === 0 ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <MessageCircle className="h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">
                No escalated chats
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60 text-center px-6">
                Escalated conversations from users will appear here
              </p>
            </div>
          ) : (
            filteredChats.map((chat) => {
              const isActive = chat._id === selectedId;
              const sc =
                statusColors[chat.status] || statusColors.open;
              const displayName = chat.visitor_name || chat.visitor_email || chat.session_id.slice(0, 12);

              return (
                <div
                  key={chat._id}
                  onClick={() => handleSelectChat(chat._id)}
                  className={cn(
                    "cursor-pointer border-b border-border/30 px-4 py-3 transition-colors",
                    isActive
                      ? "bg-primary/5 border-l-2 border-l-primary"
                      : "hover:bg-muted/30 border-l-2 border-l-transparent"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        sc.bg,
                        sc.text
                      )}
                    >
                      {chat.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">
                      {chat.channel}
                    </span>
                    <span className="text-[9px] text-muted-foreground/40 ml-auto">
                      {formatRelativeTime(chat.updated_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mb-0.5">
                    <UserCircle className="h-3 w-3 text-muted-foreground shrink-0" />
                    <p className="text-xs font-medium truncate">
                      {displayName}
                    </p>
                  </div>

                  <p className="text-[10px] text-muted-foreground/60 line-clamp-2">
                    {chat.last_message || "No messages"}
                  </p>

                  <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground/40">
                    <span>{chat.message_count} messages</span>
                    <span className="font-mono truncate">
                      {chat.session_id.slice(0, 12)}...
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* center: chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-2xl">
              <Headphones className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Select a chat</p>
              <p className="text-xs text-muted-foreground mt-1">
                Choose a conversation from the n8n agent to view and respond
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* chat header */}
            <div className="border-border/40 flex h-12 shrink-0 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                  <MessageCircle className="text-foreground h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-foreground text-sm font-medium truncate">
                          {selected.visitor_name || selected.visitor_email || selected.session_id.slice(0, 16)}
                        </h1>
                  <p className="text-muted-foreground text-[10px] truncate">
                    {selected.session_id.slice(0, 16)}... &middot;{" "}
                    {selected.channel} &middot; {selected.message_count} msgs
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    (statusColors[selected.status] || statusColors.open).bg,
                    (statusColors[selected.status] || statusColors.open).text
                  )}
                >
                  {selected.status}
                </span>
              </div>
            </div>

            {isClosed && (
              <div className="bg-emerald-500/10 border-emerald-500/20 border-b px-4 py-2">
                <p className="text-emerald-600 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" />
                  This chat has been resolved.
                </p>
              </div>
            )}

            {/* messages */}
            <ScrollArea className="flex-1" ref={scrollRef}>
              <div className="flex flex-col gap-3 p-4">
                {isLoadingMessages ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10">
                    <MessageCircle className="h-6 w-6 text-muted-foreground/30" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      No messages yet
                    </p>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isCustomer =
                      msg.role === "user" || msg.role === "customer";
                    const isAdmin = msg.role === "admin" && msg.is_human;
                    const isAgent =
                      msg.role === "assistant" ||
                      msg.role === "ai" ||
                      (msg.role === "admin" && !msg.is_human);

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "flex w-full gap-3",
                          isCustomer ? "justify-start" : "justify-end"
                        )}
                      >
                        <div
                          className={cn(
                            "flex max-w-[80%] min-w-0 flex-col",
                            isCustomer ? "items-start" : "items-end"
                          )}
                        >
                          {/* sender label */}
                          <div className="mb-0.5 flex items-center gap-1">
                            {isCustomer ? (
                              <>
                                <UserCircle className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  {selected.visitor_name || "Customer"}
                                </span>
                              </>
                            ) : isAdmin ? (
                              <>
                                <UserCircle className="h-3 w-3 text-primary" />
                                <span className="text-[10px] text-primary font-medium">
                                  {msg.agent_name || "Admin"}
                                </span>
                              </>
                            ) : (
                              <>
                                <Headphones className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  AI Agent
                                </span>
                              </>
                            )}
                          </div>

                          <div
                            className={cn(
                              "relative max-w-full rounded-2xl px-4 py-2.5",
                              isCustomer
                                ? "bg-muted rounded-bl-md"
                                : isAdmin
                                  ? "bg-primary text-primary-foreground rounded-br-md"
                                  : "bg-muted/60 border border-border/50 rounded-br-md"
                            )}
                          >
                            {isAgent ? (
                              <div className="text-sm leading-relaxed">
                                <MarkdownContent content={msg.content} />
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                                {msg.content}
                              </p>
                            )}
                          </div>

                          <span className="text-muted-foreground/40 mt-1 text-[10px]">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}

                {isSending && (
                  <div className="flex justify-end">
                    <div className="bg-primary/50 rounded-2xl rounded-br-md px-4 py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* input */}
            <div className="border-border/40 bg-background border-t p-3">
              <div className="bg-input/20 flex flex-col rounded-xl ring-1 ring-transparent transition-all focus-within:ring-border/50">
                <div className="px-3 py-3">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      isClosed
                        ? "Chat is closed"
                        : "Type your response..."
                    }
                    disabled={isSending || isClosed}
                    rows={1}
                    className="w-full resize-none border-none text-sm leading-relaxed shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ minHeight: "24px", maxHeight: "120px" }}
                  />
                </div>
                <div className="flex items-center justify-end px-2 pb-2">
                  {isSending ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "h-8 w-8 transition-colors",
                        input.trim()
                          ? "text-foreground hover:bg-muted"
                          : "text-muted-foreground/50"
                      )}
                      onClick={handleSend}
                      disabled={!input.trim() || isClosed}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="text-muted-foreground/50 mt-1.5 flex items-center justify-center gap-3 text-[10px]">
                <span>
                  <kbd className="text-muted-foreground/70">↵</kbd> send
                </span>
                <span>
                  <kbd className="text-muted-foreground/70">⇧↵</kbd> new line
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* right: chat context panel */}
      {selected && (
        <div className="hidden w-72 xl:w-80 flex-col border-l xl:flex overflow-hidden">
          <div className="shrink-0 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Chat Info</span>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* visitor details */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Visitor
                </p>
                <p className="text-sm font-medium">
                    {selected.visitor_name || selected.visitor_email || selected.session_id.slice(0, 16)}
                  </p>
                {selected.visitor_email && (
                  <p className="text-xs text-muted-foreground">
                    {selected.visitor_email}
                  </p>
                )}
                {selected.visitor_id && (
                  <p className="text-[10px] text-muted-foreground/60 font-mono">
                    ID: {selected.visitor_id}
                  </p>
                )}
              </div>

              {/* session details */}
              <div className="space-y-1.5 rounded-lg border border-border/50 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Session
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      (statusColors[selected.status] || statusColors.open).bg,
                      (statusColors[selected.status] || statusColors.open).text
                    )}
                  >
                    {selected.status}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {selected.channel}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono break-all">
                  {selected.session_id}
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px] mt-1">
                  <div>
                    <p className="text-[10px] text-muted-foreground">
                      Messages
                    </p>
                    <p className="font-medium">{selected.message_count}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Channel</p>
                    <p className="font-medium capitalize">{selected.channel}</p>
                  </div>
                </div>
              </div>

              {/* metadata from n8n */}
              {selected.metadata &&
                Object.keys(selected.metadata).length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-border/50 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Metadata
                    </p>
                    <div className="space-y-1">
                      {Object.entries(selected.metadata).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground font-mono">
                            {key}
                          </span>
                          <span className="font-medium text-right truncate max-w-[60%]">
                            {typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* timeline */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Timeline
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px]">
                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                    <span className="text-muted-foreground">Started</span>
                    <span className="text-[10px] text-muted-foreground/60 ml-auto">
                      {formatRelativeTime(selected.created_at)}
                    </span>
                  </div>
                  {selected.last_message_at && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                      <span className="text-muted-foreground">Last message</span>
                      <span className="text-[10px] text-muted-foreground/60 ml-auto">
                        {formatRelativeTime(selected.last_message_at)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[11px]">
                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                    <span className="text-muted-foreground">Last update</span>
                    <span className="text-[10px] text-muted-foreground/60 ml-auto">
                      {formatRelativeTime(selected.updated_at)}
                    </span>
                  </div>
                </div>
              </div>

              {/* message breakdown */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Participants
                </p>
                {(() => {
                  const roleCounts: Record<string, number> = {};
                  messages.forEach((m) => {
                    const label =
                      m.role === "user" || m.role === "customer"
                        ? "Customer"
                        : m.is_human
                          ? "Admin"
                          : "AI Agent";
                    roleCounts[label] = (roleCounts[label] || 0) + 1;
                  });
                  return (
                    <div className="space-y-1">
                      {Object.entries(roleCounts).map(([role, count]) => (
                        <div
                          key={role}
                          className="flex items-center justify-between text-[11px]"
                        >
                          <span className="text-muted-foreground">{role}</span>
                          <span className="font-medium">{count} msgs</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
