"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Send,
  Loader2,
  Search,
  ChevronRight,
  UserCircle,
  Bot,
  AlertTriangle,
  Package,
  Clock,
  CheckCircle2,
  ArrowRight,
  Headphones,
  RefreshCw,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import useUser from "~/hooks/useUser";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  is_human?: boolean;
  cards?: Array<{
    id: string;
    label: string;
    style?: string;
    action_payload?: Record<string, unknown>;
  }>;
  tools_used?: string[];
  actions_taken?: string[];
}

interface IncidentTicket {
  _id: string;
  incident_id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  is_escalated: boolean;
  escalated_at: string | null;
  risk_score: number;
  created_at: string;
  updated_at: string;
  shipment: {
    _id: string;
    tracking_id: string;
    status: string;
    priority: string;
    origin: { city?: string; lat?: number; lng?: number };
    destination: { city?: string; lat?: number; lng?: number };
    current_location: { city?: string } | null;
    risk_score: number;
    sla_breached: boolean;
    sla_deadline: string | null;
    carrier: { id: string; name: string; code: string; reliabilityScore?: number } | null;
    warehouse: { id: string; name: string; code: string; status?: string } | null;
    consumer: { id: string; name: string; email: string } | null;
  } | null;
  assigned_agent: { id: string; name: string; email: string } | null;
  chat_history: ChatMessage[];
}

function generateId() {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
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

const severityColors: Record<string, string> = {
  low: "text-emerald-500",
  medium: "text-amber-500",
  high: "text-orange-500",
  critical: "text-red-500",
};

const statusColors: Record<string, { bg: string; text: string }> = {
  open: { bg: "bg-blue-500/10", text: "text-blue-500" },
  investigating: { bg: "bg-amber-500/10", text: "text-amber-500" },
  in_progress: { bg: "bg-sky-500/10", text: "text-sky-500" },
  escalated: { bg: "bg-red-500/10", text: "text-red-500" },
  resolved: { bg: "bg-emerald-500/10", text: "text-emerald-500" },
  closed: { bg: "bg-muted", text: "text-muted-foreground" },
};

export default function AdminSupportPage() {
  const { user } = useUser();

  const [incidents, setIncidents] = useState<IncidentTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingIncidents, setIsLoadingIncidents] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [filter, setFilter] = useState<"all" | "escalated" | "open" | "resolved">("all");
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

  // fetch incidents
  const fetchIncidents = useCallback(async () => {
    try {
      const url =
        filter === "escalated"
          ? `${API_BASE_URL}/api/admin/incidents/escalated`
          : `${API_BASE_URL}/api/admin/incidents`;

      const params = new URLSearchParams();
      if (user?.id) params.set("admin_id", user.id);
      if (filter === "open") params.set("status", "open");
      if (filter === "resolved") params.set("status", "resolved");

      const res = await fetch(`${url}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const list = data.data?.incidents || [];
        setIncidents(list);
      }
    } catch {
      // silent
    } finally {
      setIsLoadingIncidents(false);
    }
  }, [user?.id, filter]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  // poll incidents every 8 seconds
  useEffect(() => {
    const interval = setInterval(fetchIncidents, 8000);
    return () => clearInterval(interval);
  }, [fetchIncidents]);

  // fetch messages for selected incident
  const fetchMessages = useCallback(
    async (incidentId: string) => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/admin/incidents/${incidentId}/messages`
        );
        if (res.ok) {
          const data = await res.json();
          const msgs: ChatMessage[] = data.data?.messages || [];
          setMessages(msgs);
        }
      } catch {
        // silent
      }
    },
    []
  );

  // when selecting a ticket
  const handleSelectIncident = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setIsLoadingMessages(true);
      setMessages([]);
      await fetchMessages(id);
      setIsLoadingMessages(false);
    },
    [fetchMessages]
  );

  // poll messages for selected incident
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
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
      is_human: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/incidents/${selectedId}/message`,
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
        // refetch to get synced state
        await fetchMessages(selectedId);
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setIsSending(false);
    }
  };

  // resolve ticket
  const handleResolve = async () => {
    if (!selectedId || !user?.id) return;
    setIsResolving(true);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/incidents/${selectedId}/resolve`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_id: user.id,
            resolution: "Resolved by admin via support panel.",
          }),
        }
      );

      if (res.ok) {
        toast.success("Ticket resolved");
        fetchIncidents();
        await fetchMessages(selectedId);
      } else {
        toast.error("Failed to resolve");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setIsResolving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selected = incidents.find((i) => i._id === selectedId);
  const isResolved = selected?.status === "resolved" || selected?.status === "closed";

  const filteredIncidents = search
    ? incidents.filter(
        (i) =>
          i.incident_id.toLowerCase().includes(search.toLowerCase()) ||
          i.title.toLowerCase().includes(search.toLowerCase()) ||
          i.shipment?.tracking_id?.toLowerCase().includes(search.toLowerCase()) ||
          i.shipment?.consumer?.name?.toLowerCase().includes(search.toLowerCase()) ||
          i.shipment?.consumer?.email?.toLowerCase().includes(search.toLowerCase())
      )
    : incidents;

  return (
    <div className="flex h-full overflow-hidden">
      {/* left: tickets list */}
      <div className="flex w-80 flex-col border-r overflow-hidden">
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Headphones className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Support Tickets</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchIncidents}
              className="h-7 w-7 p-0"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  isLoadingIncidents && "animate-spin"
                )}
              />
            </Button>
          </div>

          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>

          <div className="flex items-center gap-1">
            {(
              [
                { value: "all", label: "All" },
                { value: "escalated", label: "Escalated" },
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
          {isLoadingIncidents && incidents.length === 0 ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Headphones className="h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">
                No tickets found
              </p>
            </div>
          ) : (
            filteredIncidents.map((incident) => {
              const isActive = incident._id === selectedId;
              const sc = statusColors[incident.status] || statusColors.open;
              const lastMsg =
                incident.chat_history?.[incident.chat_history.length - 1];

              return (
                <div
                  key={incident._id}
                  onClick={() => handleSelectIncident(incident._id)}
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
                      {incident.status.replace(/_/g, " ")}
                    </span>
                    {incident.is_escalated && (
                      <AlertTriangle className="h-3 w-3 text-red-500" />
                    )}
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        severityColors[incident.severity] ||
                          "text-muted-foreground"
                      )}
                    >
                      {incident.severity}
                    </span>
                  </div>

                  <p className="text-xs font-medium line-clamp-1">
                    {incident.title}
                  </p>

                  {incident.shipment && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="font-mono">
                        {incident.shipment.tracking_id}
                      </span>
                      {incident.shipment.consumer && (
                        <>
                          <span>&middot;</span>
                          <span>{incident.shipment.consumer.name}</span>
                        </>
                      )}
                    </div>
                  )}

                  {lastMsg && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1 line-clamp-1">
                      {lastMsg.is_human ? "You: " : ""}
                      {lastMsg.content}
                    </p>
                  )}

                  <p className="text-[9px] text-muted-foreground/40 mt-1">
                    {formatRelativeTime(incident.updated_at)}
                  </p>
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
              <p className="text-sm font-medium">Select a ticket</p>
              <p className="text-xs text-muted-foreground mt-1">
                Choose a support ticket to view and respond
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* chat header */}
            <div className="border-border/40 flex h-12 shrink-0 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                  {selected.is_escalated ? (
                    <AlertTriangle className="text-red-500 h-3.5 w-3.5" />
                  ) : (
                    <MessageCircle className="text-foreground h-3.5 w-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <h1 className="text-foreground text-sm font-medium truncate">
                    {selected.shipment?.consumer?.name || "Unknown Customer"}
                  </h1>
                  <p className="text-muted-foreground text-[10px] truncate">
                    {selected.incident_id} &middot;{" "}
                    {selected.shipment?.tracking_id || "No shipment"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!isResolved && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResolve}
                    disabled={isResolving}
                    className="gap-1.5 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                  >
                    {isResolving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    Resolve
                  </Button>
                )}
              </div>
            </div>

            {/* resolved banner */}
            {isResolved && (
              <div className="bg-emerald-500/10 border-emerald-500/20 border-b px-4 py-2">
                <p className="text-emerald-600 text-xs">
                  This ticket has been resolved.
                </p>
              </div>
            )}

            {/* escalation banner */}
            {selected.is_escalated && !isResolved && (
              <div className="bg-red-500/10 border-red-500/20 border-b px-4 py-1.5">
                <p className="text-red-500 text-xs flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" />
                  Escalated by customer — requires human response
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
                    const isCustomer = msg.role === "user";
                    const isHuman = msg.is_human;

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
                                  {selected.shipment?.consumer?.name || "Customer"}
                                </span>
                              </>
                            ) : isHuman ? (
                              <>
                                <UserCircle className="h-3 w-3 text-primary" />
                                <span className="text-[10px] text-primary font-medium">
                                  {selected.assigned_agent?.name || "Admin"}
                                </span>
                              </>
                            ) : (
                              <>
                                <Bot className="h-3 w-3 text-muted-foreground" />
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
                                : isHuman
                                  ? "bg-primary text-primary-foreground rounded-br-md"
                                  : "bg-muted/60 border border-border/50 rounded-br-md"
                            )}
                          >
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">
                              {msg.content}
                            </p>
                          </div>

                          {/* action cards */}
                          {msg.cards && msg.cards.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {msg.cards.map((card) => (
                                <span
                                  key={card.id}
                                  className="border-border bg-muted/50 rounded-md border px-2 py-0.5 text-[10px] text-muted-foreground"
                                >
                                  {card.label}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* tools used */}
                          {msg.tools_used && msg.tools_used.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {msg.tools_used.map((tool, i) => (
                                <span
                                  key={i}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                                >
                                  {tool}
                                </span>
                              ))}
                            </div>
                          )}

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
                      isResolved
                        ? "Ticket is resolved"
                        : "Type your response..."
                    }
                    disabled={isSending || isResolved}
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
                      disabled={!input.trim() || isResolved}
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

      {/* right: customer context panel */}
      {selected && selected.shipment && (
        <div className="hidden w-72 xl:w-80 flex-col border-l xl:flex overflow-hidden">
          <div className="shrink-0 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Customer Info</span>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* customer details */}
              {selected.shipment.consumer && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Customer
                  </p>
                  <p className="text-sm font-medium">
                    {selected.shipment.consumer.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selected.shipment.consumer.email}
                  </p>
                </div>
              )}

              {/* incident details */}
              <div className="space-y-1.5 rounded-lg border border-border/50 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Incident
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      (statusColors[selected.status] || statusColors.open).bg,
                      (statusColors[selected.status] || statusColors.open).text
                    )}
                  >
                    {selected.status.replace(/_/g, " ")}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-medium",
                      severityColors[selected.severity]
                    )}
                  >
                    {selected.severity}
                  </span>
                </div>
                <p className="text-xs">{selected.title}</p>
                {selected.description && (
                  <p className="text-[11px] text-muted-foreground">
                    {selected.description}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground font-mono">
                  {selected.incident_id}
                </p>
              </div>

              {/* shipment details */}
              <div className="space-y-2 rounded-lg border border-border/50 p-3">
                <div className="flex items-center gap-2">
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Shipment
                  </p>
                </div>

                <p className="text-xs font-mono font-medium">
                  {selected.shipment.tracking_id}
                </p>

                {/* route */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-medium">
                    {selected.shipment.origin?.city || "Origin"}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-medium">
                    {selected.shipment.destination?.city || "Destination"}
                  </span>
                </div>

                {/* status and details grid */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Status</p>
                    <p className="font-medium capitalize">
                      {selected.shipment.status.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">
                      Priority
                    </p>
                    <p className="font-medium capitalize">
                      {selected.shipment.priority}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">
                      Risk Score
                    </p>
                    <p
                      className={cn(
                        "font-medium",
                        selected.shipment.risk_score > 70
                          ? "text-red-500"
                          : selected.shipment.risk_score > 40
                            ? "text-orange-500"
                            : "text-emerald-500"
                      )}
                    >
                      {selected.shipment.risk_score}
                    </p>
                  </div>
                  {selected.shipment.carrier && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">
                        Carrier
                      </p>
                      <p className="font-medium">
                        {selected.shipment.carrier.name}
                      </p>
                    </div>
                  )}
                </div>

                {selected.shipment.sla_breached && (
                  <div className="flex items-center gap-1.5 rounded bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-500">
                    <AlertTriangle className="h-3 w-3" />
                    SLA breached
                  </div>
                )}

                {selected.shipment.current_location?.city && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Currently at {selected.shipment.current_location.city}
                  </p>
                )}

                {selected.shipment.warehouse && (
                  <p className="text-[10px] text-muted-foreground">
                    Warehouse: {selected.shipment.warehouse.name} (
                    {selected.shipment.warehouse.code})
                  </p>
                )}
              </div>

              {/* timeline */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Timeline
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[11px]">
                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                    <span className="text-muted-foreground">Created</span>
                    <span className="text-[10px] text-muted-foreground/60 ml-auto">
                      {formatRelativeTime(selected.created_at)}
                    </span>
                  </div>
                  {selected.escalated_at && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                      <span className="text-red-500">Escalated</span>
                      <span className="text-[10px] text-muted-foreground/60 ml-auto">
                        {formatRelativeTime(selected.escalated_at)}
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

              {/* assigned agent */}
              {selected.assigned_agent && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Assigned Agent
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="bg-primary/10 flex h-7 w-7 items-center justify-center rounded-full">
                      <UserCircle className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-medium">
                        {selected.assigned_agent.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {selected.assigned_agent.email}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
