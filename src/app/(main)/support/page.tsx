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
  ChevronRight,
  UserCircle,
  Bot,
  RotateCcw,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
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
  const [isEscalated, setIsEscalated] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);
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
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "24px";
      const sh = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(sh, 120)}px`;
    }
  }, [input]);

  // auto-select first shipment if available
  useEffect(() => {
    if (shipments.length > 0 && !selectedShipment) {
      setSelectedShipment(shipments[0]._id);
    }
  }, [shipments, selectedShipment]);

  const sendToAgent = async (content: string) => {
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
      // build context about the selected shipment
      const selected = shipments.find((s) => s._id === selectedShipment);
      const shipmentContext = selected
        ? {
            case_id: selected.case_id,
            tracking_id: selected.tracking_id,
            status: selected.status,
            delay: selected.delay,
            carrier: selected.carrier?.code || "unassigned",
            origin: selected.origin?.city,
            destination: selected.destination?.city,
            sla_breached: selected.sla_breached,
            risk_score: selected.risk_score,
            estimated_delivery: selected.estimated_delivery,
            value: selected.value,
          }
        : null;

      const payload = {
        type: "customer_support",
        consumer_id: user?.id || "anonymous",
        consumer_name: user?.name || "Customer",
        consumer_email: user?.email || "",
        shipment_id: selectedShipment,
        shipment_context: shipmentContext,
        message: { content },
        is_escalated: isEscalated,
      };

      // try the shipments/agent endpoint first
      let agentMessage =
        "I understand your concern. Let me look into this for you.";
      let cards: ChatMsg["cards"] = [];

      try {
        const res = await fetch(`${API_BASE_URL}/api/shipments/agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipment_id: selectedShipment,
            consumer_id: user?.id || "anonymous",
            message: { content },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const d = data.data || data;
          if (d.agent_message) agentMessage = d.agent_message;
          if (d.cards) cards = d.cards;
        }
      } catch {
        // fallback: try webhook directly
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
        isHuman: isEscalated,
        cards: cards?.length ? cards : undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
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

  const handleQuickIssue = (issue: (typeof QUICK_ISSUES)[number]) => {
    sendToAgent(issue.message);
  };

  const handleEscalate = () => {
    setIsEscalated(true);
    const systemMsg: ChatMsg = {
      id: generateId(),
      role: "system",
      content:
        "You've been connected to a human agent. They will respond shortly.",
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, systemMsg]);
    toast.success("Connected to human agent");

    // fire webhook to notify
    fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "escalate_to_human",
        consumer_id: user?.id,
        consumer_name: user?.name,
        consumer_email: user?.email,
        shipment_id: selectedShipment,
        message_history: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    }).catch(() => {});
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
    setIsEscalated(false);
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

  return (
    <div className="flex h-full overflow-hidden">
      {/* shipment selector sidebar */}
      <div className="hidden w-72 flex-col border-r lg:flex">
        <div className="shrink-0 border-b px-4 py-4">
          <h2 className="text-sm font-semibold">Your Shipments</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Select a shipment to get help with
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {shipments.length === 0 && (
              <p className="text-muted-foreground px-3 py-6 text-center text-xs">
                No shipments found
              </p>
            )}
            {shipments.map((s) => {
              const isActive = s._id === selectedShipment;
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
                <button
                  key={s._id}
                  onClick={() => setSelectedShipment(s._id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    isActive
                      ? "bg-primary/10 border-primary/20 border"
                      : "hover:bg-muted border border-transparent"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium truncate">
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
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-muted-foreground text-[10px] capitalize">
                        {s.status.replace(/_/g, " ")}
                      </span>
                      {s.delay > 0 && (
                        <span className="text-[10px] text-red-500">
                          +{Math.round(s.delay / 60)}h delay
                        </span>
                      )}
                    </div>
                    {s.value > 0 && (
                      <span className="text-muted-foreground text-[10px]">
                        INR {s.value.toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 mt-1",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground/50"
                    )}
                  />
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* header */}
        <div className="border-border/40 flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-lg">
              {isEscalated ? (
                <UserCircle className="text-primary h-4 w-4" />
              ) : (
                <Bot className="text-foreground h-4 w-4" />
              )}
            </div>
            <div>
              <h1 className="text-foreground text-sm font-medium">
                {isEscalated ? "Human Agent" : "Support Assistant"}
              </h1>
              <p className="text-muted-foreground text-xs">
                {isEscalated
                  ? "Connected to agent"
                  : selectedShipment
                    ? shipments.find((s) => s._id === selectedShipment)
                        ?.tracking_id || "Select a shipment"
                    : "General support"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEscalated && messages.length > 2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEscalate}
                className="gap-1.5 text-xs"
              >
                <UserCircle className="h-3.5 w-3.5" />
                Talk to human
              </Button>
            )}
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
        </div>

        {/* escalation banner */}
        {isEscalated && (
          <div className="bg-primary/10 border-primary/20 border-b px-4 py-2">
            <p className="text-primary text-xs">
              You're now chatting with a human agent. They'll respond shortly.
            </p>
          </div>
        )}

        {/* mobile shipment selector */}
        <div className="border-b px-4 py-2 lg:hidden">
          <select
            value={selectedShipment || ""}
            onChange={(e) => setSelectedShipment(e.target.value || null)}
            className="bg-muted text-foreground w-full rounded-md border px-3 py-1.5 text-xs"
          >
            <option value="">No shipment selected</option>
            {shipments.map((s) => (
              <option key={s._id} value={s._id}>
                {s.tracking_id} — {s.origin?.city} → {s.destination?.city} (
                {s.status.replace(/_/g, " ")})
              </option>
            ))}
          </select>
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
                    {!isUser && msg.isHuman && (
                      <div className="mb-1 flex items-center gap-1">
                        <UserCircle className="text-primary h-3 w-3" />
                        <span className="text-primary text-[10px] font-medium">
                          human agent
                        </span>
                      </div>
                    )}

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

                    {/* action cards from agent */}
                    {!isUser && msg.cards && msg.cards.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.cards.map((card) => (
                          <button
                            key={card.id}
                            onClick={() => {
                              if (card.action_payload) {
                                sendToAgent(
                                  `Execute action: ${card.label}`
                                );
                              }
                            }}
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

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="bg-muted-foreground/40 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:0ms]" />
                    <span className="bg-muted-foreground/40 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
                    <span className="bg-muted-foreground/40 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

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
                placeholder={
                  isEscalated
                    ? "Message human agent..."
                    : "Type your message..."
                }
                disabled={isLoading}
                rows={1}
                className="w-full resize-none border-none text-sm leading-relaxed shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ minHeight: "24px", maxHeight: "120px" }}
              />
            </div>
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-1 pl-1">
                {!isEscalated && messages.length > 2 && (
                  <button
                    onClick={handleEscalate}
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors"
                  >
                    <UserCircle className="h-3 w-3" />
                    Escalate
                  </button>
                )}
              </div>
              {isLoading ? (
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled>
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
    </div>
  );
}
