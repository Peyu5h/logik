"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircle,
  Send,
  Loader2,
  Clock,
  Package,
  AlertTriangle,
  MapPin,
  Phone,
  Bot,
  RotateCcw,
  ChevronRight,
  Plus,
  Search,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import useUser from "~/hooks/useUser";
import { useMyShipments } from "~/hooks/useShipments";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const WEBHOOK_URL =
  process.env.NEXT_PUBLIC_WEBHOOK_URL ||
  "https://abstruse.app.n8n.cloud/webhook/agent";

interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isHuman?: boolean;
  cards?: Array<{
    id: string;
    label: string;
    style?: string;
    action_payload?: Record<string, unknown>;
  }>;
  toolsUsed?: string[];
  isThinking?: boolean;
}

interface SupportTicket {
  id: string;
  sessionId: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
  shipmentId?: string;
  trackingId?: string;
}

const QUICK_ISSUES = [
  {
    id: "delay",
    label: "Shipment delayed",
    icon: Clock,
    message: "My shipment is delayed. Can you help me check the status?",
  },
  {
    id: "not_delivered",
    label: "Shows delivered but not received",
    icon: Package,
    message:
      "My shipment shows as delivered but I haven't received it. Please help.",
  },
  {
    id: "wrong_item",
    label: "Received wrong item",
    icon: AlertTriangle,
    message: "I received the wrong item in my delivery. What should I do?",
  },
  {
    id: "tracking_issue",
    label: "Tracking not updating",
    icon: MapPin,
    message:
      "My shipment tracking hasn't updated in a while. Can you check what's happening?",
  },
  {
    id: "eta_wrong",
    label: "ETA seems inaccurate",
    icon: Clock,
    message:
      "The estimated delivery time seems wrong for my shipment. Can you verify the ETA?",
  },
  {
    id: "contact_carrier",
    label: "Need to contact carrier",
    icon: Phone,
    message:
      "I need to get in touch with the carrier for my shipment. Can you help me with that?",
  },
];

function generateId() {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}

function formatTime(ts: number) {
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

// thinking indicator component
function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[85%] flex-col items-start">
        <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="animate-pulse">Thinking...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SupportPage() {
  const { user } = useUser();
  const { data: shipmentsData } = useMyShipments();
  const shipments = shipmentsData?.shipments || [];

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm your logistics support assistant. How can I help you today? You can select a common issue below or type your question.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [ticketSearch, setTicketSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "24px";
      const sh = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(sh, 120)}px`;
    }
  }, [input]);

  // build shipment context for all active shipments
  const buildShipmentContext = useCallback(() => {
    if (shipments.length === 0) return null;
    return shipments.map((s) => ({
      case_id: s.case_id,
      tracking_id: s.tracking_id,
      status: s.status,
      delay: s.delay,
      carrier: s.carrier?.code || "unassigned",
      origin: s.origin?.city,
      destination: s.destination?.city,
      sla_breached: s.sla_breached,
      risk_score: s.risk_score,
      estimated_delivery: s.estimated_delivery,
      value: s.value,
    }));
  }, [shipments]);

  // fetch past tickets
  const fetchTickets = useCallback(async () => {
    if (!user?.id) return;
    try {
      // get chat histories from shipments
      const ticketList: SupportTicket[] = [];
      for (const s of shipments) {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/admin/incidents/${s._id}/messages`
          );
          if (res.ok) {
            const data = await res.json();
            const msgs = data.data?.messages || [];
            if (msgs.length > 0) {
              const lastMsg = msgs[msgs.length - 1];
              ticketList.push({
                id: s._id,
                sessionId: s._id,
                lastMessage:
                  lastMsg.content?.substring(0, 80) + (lastMsg.content?.length > 80 ? "..." : ""),
                timestamp: lastMsg.timestamp,
                messageCount: msgs.length,
                shipmentId: s._id,
                trackingId: s.tracking_id,
              });
            }
          }
        } catch {
          // skip
        }
      }
      setTickets(ticketList);
    } catch {
      // silent
    }
  }, [user?.id, shipments]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const sendToAgent = async (content: string) => {
    if (!content.trim() || isLoading) return;

    setIsLoading(true);

    const userMsg: ChatMsg = {
      id: generateId(),
      role: "user",
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const shipmentContext = buildShipmentContext();

      const payload = {
        type: "customer_support",
        consumer_id: user?.id || "anonymous",
        consumer_name: user?.name || "Customer",
        consumer_email: user?.email || "",
        shipment_context: shipmentContext,
        all_shipments: shipmentContext,
        message: { content },
      };

      let agentMessage =
        "I understand your concern. Let me look into this for you.";
      let cards: ChatMsg["cards"] = [];
      let toolsUsed: string[] = [];

      try {
        const res = await fetch(`${API_BASE_URL}/api/shipments/agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consumer_id: user?.id || "anonymous",
            message: { content },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const d = data.data || data;
          if (d.agent_message) agentMessage = d.agent_message;
          if (d.cards) cards = d.cards;
          if (d.tools_used) toolsUsed = d.tools_used;
        }
      } catch {
        try {
          const webhookRes = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (webhookRes.ok) {
            const webhookData = await webhookRes.json();
            const wd = webhookData.output || webhookData;
            if (wd.agent_message || wd.message)
              agentMessage = wd.agent_message || wd.message;
            if (wd.cards) cards = wd.cards;
            if (wd.tools_used) toolsUsed = wd.tools_used;
          }
        } catch {
          // both failed
        }
      }

      const assistantMsg: ChatMsg = {
        id: generateId(),
        role: "assistant",
        content: agentMessage,
        timestamp: Date.now(),
        cards: cards?.length ? cards : undefined,
        toolsUsed: toolsUsed?.length ? toolsUsed : undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // refresh tickets after sending
      setTimeout(fetchTickets, 1000);
    } catch {
      const errorMsg: ChatMsg = {
        id: generateId(),
        role: "assistant",
        content:
          "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // action buttons fill input instead of auto-sending
  const handleCardClick = (card: NonNullable<ChatMsg["cards"]>[number]) => {
    setInput(card.label);
    textareaRef.current?.focus();
  };

  const handleQuickIssue = (issue: (typeof QUICK_ISSUES)[number]) => {
    setInput(issue.message);
    textareaRef.current?.focus();
  };

  const handleNewConversation = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Hi! I'm your logistics support assistant. How can I help you today?",
        timestamp: Date.now(),
      },
    ]);
    setActiveTicketId(null);
    setInput("");
  };

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    sendToAgent(input.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const showQuickIssues = messages.length <= 2 && !isLoading;

  const filteredTickets = ticketSearch
    ? tickets.filter(
        (t) =>
          t.trackingId?.toLowerCase().includes(ticketSearch.toLowerCase()) ||
          t.lastMessage.toLowerCase().includes(ticketSearch.toLowerCase())
      )
    : tickets;

  return (
    <div className="flex h-full overflow-hidden">
      {/* left: past tickets sidebar */}
      <div className="hidden w-64 flex-col border-r lg:flex">
        <div className="shrink-0 border-b px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Support</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewConversation}
              className="h-7 w-7 p-0"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {tickets.length > 3 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search tickets..."
                value={ticketSearch}
                onChange={(e) => setTicketSearch(e.target.value)}
                className="h-7 pl-7 text-xs"
              />
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          {/* new conversation button */}
          <button
            onClick={handleNewConversation}
            className={cn(
              "flex w-full items-center gap-2 border-b border-border/30 px-3 py-2.5 text-left transition-colors",
              !activeTicketId
                ? "bg-primary/5 border-l-2 border-l-primary"
                : "hover:bg-muted/30 border-l-2 border-l-transparent"
            )}
          >
            <div className="bg-primary/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">New Conversation</p>
              <p className="text-[10px] text-muted-foreground truncate">
                Start fresh with the agent
              </p>
            </div>
          </button>

          {/* past tickets */}
          {filteredTickets.length > 0 && (
            <div className="px-3 pt-2 pb-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Past Tickets
              </p>
            </div>
          )}
          {filteredTickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => setActiveTicketId(ticket.id)}
              className={cn(
                "flex w-full items-start gap-2 border-b border-border/30 px-3 py-2.5 text-left transition-colors",
                activeTicketId === ticket.id
                  ? "bg-primary/5 border-l-2 border-l-primary"
                  : "hover:bg-muted/30 border-l-2 border-l-transparent"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-mono text-muted-foreground truncate">
                    {ticket.trackingId || "General"}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60 shrink-0">
                    {formatRelativeTime(ticket.timestamp)}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                  {ticket.lastMessage}
                </p>
                <span className="text-[9px] text-muted-foreground/50 mt-0.5">
                  {ticket.messageCount} messages
                </span>
              </div>
              <ChevronRight className="h-3 w-3 shrink-0 mt-1 text-muted-foreground/30" />
            </button>
          ))}

          {filteredTickets.length === 0 && tickets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-4">
              <MessageCircle className="h-6 w-6 text-muted-foreground/30" />
              <p className="mt-2 text-[11px] text-muted-foreground/50 text-center">
                No past conversations yet
              </p>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* center: chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* header */}
        <div className="border-border/40 flex h-12 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <div className="bg-muted flex h-7 w-7 items-center justify-center rounded-lg">
              <Bot className="text-foreground h-3.5 w-3.5" />
            </div>
            <div>
              <h1 className="text-foreground text-sm font-medium">
                Support Assistant
              </h1>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewConversation}
            className="gap-1.5 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New
          </Button>
        </div>

        {/* messages */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="flex flex-col gap-4 p-4">
            {messages.map((msg) => {
              if (msg.role === "system") {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-[11px]">
                      {msg.content}
                    </span>
                  </div>
                );
              }

              const isUser = msg.role === "user";

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex w-full gap-3",
                    isUser ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "flex max-w-[85%] min-w-0 flex-col",
                      isUser ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "relative max-w-full rounded-2xl px-4 py-2.5",
                        isUser
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : msg.isHuman
                            ? "bg-primary/10 border-primary/20 border rounded-bl-md"
                            : "bg-muted rounded-bl-md"
                      )}
                    >
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {msg.content}
                      </p>
                    </div>

                    {/* tools used */}
                    {!isUser && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {msg.toolsUsed.map((tool, i) => (
                          <span
                            key={i}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* action cards - fill input instead of sending */}
                    {!isUser && msg.cards && msg.cards.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.cards.map((card) => (
                          <button
                            key={card.id}
                            onClick={() => handleCardClick(card)}
                            className="border-border bg-background hover:bg-muted rounded-md border px-2.5 py-1 text-xs transition-colors"
                          >
                            {card.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <span className="text-muted-foreground/50 mt-1 text-[10px]">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}

            {isLoading && <ThinkingBubble />}

            {/* quick issue suggestions */}
            {showQuickIssues && (
              <div className="mt-2">
                <p className="text-muted-foreground mb-2 text-xs font-medium">
                  Common issues:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_ISSUES.map((issue) => {
                    const Icon = issue.icon;
                    return (
                      <button
                        key={issue.id}
                        onClick={() => handleQuickIssue(issue)}
                        disabled={isLoading}
                        className={cn(
                          "border-border hover:bg-muted flex items-center gap-2 rounded-lg border p-3 text-left transition-colors",
                          "disabled:cursor-not-allowed disabled:opacity-50"
                        )}
                      >
                        <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                        <span className="text-xs">{issue.label}</span>
                      </button>
                    );
                  })}
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
                placeholder="Type your message..."
                disabled={isLoading}
                rows={1}
                className="w-full resize-none border-none text-sm leading-relaxed shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ minHeight: "24px", maxHeight: "120px" }}
              />
            </div>
            <div className="flex items-center justify-end px-2 pb-2">
              {isLoading ? (
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
                  onClick={handleSubmit}
                  disabled={!input.trim()}
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
      </div>

      {/* right: active shipments context panel */}
      <div className="hidden w-72 flex-col border-l xl:flex">
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Your Shipments</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Agent has context about all your shipments
          </p>
        </div>
        <ScrollArea className="flex-1">
          {shipments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <Package className="h-6 w-6 text-muted-foreground/30" />
              <p className="mt-2 text-xs text-muted-foreground/50 text-center">
                No active shipments
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {shipments.map((s) => {
                const statusColors: Record<string, string> = {
                  pending: "bg-yellow-500",
                  picked_up: "bg-blue-500",
                  in_transit: "bg-blue-500",
                  at_warehouse: "bg-purple-500",
                  out_for_delivery: "bg-cyan-500",
                  delivered: "bg-emerald-500",
                  delayed: "bg-red-500",
                  cancelled: "bg-zinc-500",
                };
                return (
                  <div
                    key={s._id}
                    className="border-b border-border/30 px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium font-mono truncate">
                        {s.tracking_id}
                      </span>
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          statusColors[s.status] || "bg-zinc-400"
                        )}
                      />
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-[11px] truncate">
                      {s.origin?.city || "?"} → {s.destination?.city || "?"}
                    </p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground text-[10px] capitalize">
                        {s.status.replace(/_/g, " ")}
                      </span>
                      {s.delay > 0 && (
                        <span className="text-[10px] text-red-500">
                          +{Math.round(s.delay / 60)}h delay
                        </span>
                      )}
                      {s.sla_breached && (
                        <span className="text-[10px] text-red-600 font-medium">
                          SLA
                        </span>
                      )}
                      {s.risk_score > 40 && (
                        <span className="text-[10px] text-orange-500">
                          Risk: {s.risk_score}
                        </span>
                      )}
                    </div>
                    {s.carrier && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        Carrier: {s.carrier.name}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
