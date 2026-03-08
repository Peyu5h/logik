"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  MessageCircle,
  Clock,
  Package,
  AlertTriangle,
  MapPin,
  Phone,
  Headphones,
  Plus,
  Search,
  ChevronRight,
  UserCircle,
  ExternalLink,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import useUser from "~/hooks/useUser";
import { useMyShipments } from "~/hooks/useShipments";
import { ChatInput } from "~/components/agent/ChatInput";
import { ChatMessage } from "~/components/agent/ChatMessage";
import { ThinkingIndicator } from "~/components/agent/ThinkingIndicator";
import { AnimatePresence } from "framer-motion";
import type { ChatMessage as ChatMessageType, ActionCard } from "~/components/agent/types";
import type { AgentReasoning } from "~/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface SupportTicket {
  id: string;
  ticketId: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
  shipmentId?: string;
  status?: string;
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
    message: "My shipment shows as delivered but I haven't received it. Please help.",
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
    message: "My shipment tracking hasn't updated in a while. Can you check what's happening?",
  },
  {
    id: "eta_wrong",
    label: "ETA seems inaccurate",
    icon: Clock,
    message: "The estimated delivery time seems wrong for my shipment. Can you verify the ETA?",
  },
  {
    id: "contact_carrier",
    label: "Need to contact carrier",
    icon: Phone,
    message: "I need to get in touch with the carrier for my shipment. Can you help me with that?",
  },
];

function genId(prefix = "msg") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}

function formatRelativeTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "now";
}

// converts raw reasoning object to AgentReasoning type
function toAgentReasoning(raw: any): AgentReasoning | undefined {
  if (!raw) return undefined;
  return {
    issue_type: raw.issue_type,
    root_cause: raw.root_cause,
    assumptions: raw.assumptions,
    uncertainties: raw.uncertainties,
  };
}

const WELCOME_MESSAGE: ChatMessageType = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I'm your logistics support assistant. How can I help you today? You can select a common issue below or type your question.",
  timestamp: Date.now(),
};

export default function SupportPage() {
  const { user } = useUser();
  const { data: shipmentsData } = useMyShipments();
  const shipments = shipmentsData?.shipments || [];

  const [messages, setMessages] = useState<ChatMessageType[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [ticketSearch, setTicketSearch] = useState("");
  const [isEscalated, setIsEscalated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
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
  }, [messages, isLoading, scrollToBottom]);

  // fetch past tickets
  const fetchTickets = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/admin/tickets?consumer_id=${user.id}`
      );
      if (res.ok) {
        const data = await res.json();
        const ticketList: SupportTicket[] = (data.data?.tickets || []).map(
          (t: any) => ({
            id: t._id,
            ticketId: t.ticket_id,
            lastMessage: t.agent_message
              ? t.agent_message.substring(0, 80) +
                (t.agent_message.length > 80 ? "..." : "")
              : t.subject || "No response yet",
            timestamp: t.updated_at || t.created_at,
            messageCount: (t.tools_used?.length || 0) + 1,
            shipmentId: t.shipment_id,
            status: t.status,
          })
        );
        setTickets(ticketList);
      }
    } catch {
      // silent
    }
  }, [user?.id]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // polling for escalated tickets - check for admin messages
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (isEscalated && activeTicketId) {
      const poll = async () => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/admin/tickets/${activeTicketId}/messages`
          );
          if (!res.ok) return;
          const data = await res.json();
          const rawMsgs = data.data?.messages || [];
          if (rawMsgs.length === 0) return;

          const loaded: ChatMessageType[] = rawMsgs.map(
            (m: any, idx: number) => ({
              id: `poll-${activeTicketId}-${idx}`,
              role: m.role === "user" ? "user" : "assistant",
              content: m.content,
              timestamp: new Date(m.timestamp).getTime(),
              cards: m.metadata?.cards,
              toolsUsed: m.metadata?.tools_used,
              actionsTaken: m.metadata?.actions_taken,
              agentReasoning: toAgentReasoning(m.metadata?.reasoning),
              confidenceScore: m.metadata?.confidence_score,
              isHuman: m.is_human || m.role === "admin",
            })
          );

          setMessages(loaded);
        } catch {
          // silent
        }
      };

      pollingRef.current = setInterval(poll, 3000);
      return () => {
        if (pollingRef.current) clearInterval(pollingRef.current);
      };
    }
  }, [isEscalated, activeTicketId]);

  // load messages for a ticket
  const loadTicketMessages = useCallback(
    async (ticketId: string) => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/admin/tickets/${ticketId}/messages`
        );
        if (!res.ok) return;
        const data = await res.json();
        const rawMsgs = data.data?.messages || [];

        if (rawMsgs.length === 0) {
          setMessages([WELCOME_MESSAGE]);
          return;
        }

        const loaded: ChatMessageType[] = rawMsgs.map(
          (m: any, idx: number) => ({
            id: `loaded-${ticketId}-${idx}`,
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
            timestamp: new Date(m.timestamp).getTime(),
            cards: m.metadata?.cards,
            toolsUsed: m.metadata?.tools_used,
            actionsTaken: m.metadata?.actions_taken,
            agentReasoning: toAgentReasoning(m.metadata?.reasoning),
            confidenceScore: m.metadata?.confidence_score,
            isHuman: m.is_human || m.role === "admin",
          })
        );

        setMessages(loaded);
      } catch {
        setMessages([WELCOME_MESSAGE]);
      }
    },
    []
  );

  // send a message - creates ticket on first msg, follows up after
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const content = input.trim();
    setIsLoading(true);

    const userMsg: ChatMessageType = {
      id: genId("msg"),
      role: "user",
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const relevantShipment = shipments.length > 0 ? shipments[0] : null;

      let agentMessage = "I understand your concern. Let me look into this.";
      let cards: ActionCard[] = [];
      let toolsUsed: string[] = [];
      let actionsTaken: string[] = [];
      let reasoning: AgentReasoning | undefined;
      let confidenceScore: number | undefined;
      let complexityScore: number | undefined;

      if (activeTicketId) {
        // follow-up on existing ticket
        const res = await fetch(
          `${API_BASE_URL}/api/admin/tickets/${activeTicketId}/message`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              consumer_id: user?.id || null,
              message: { content },
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const agentRes = data.data?.agent_response;
          const ticket = data.data?.ticket;

          if (agentRes) {
            if (agentRes.agent_message) agentMessage = agentRes.agent_message;
            if (agentRes.cards) cards = agentRes.cards;
            if (agentRes.tools_used) toolsUsed = agentRes.tools_used;
            if (agentRes.actions_taken) actionsTaken = agentRes.actions_taken;
            reasoning = toAgentReasoning(agentRes.reasoning);
            confidenceScore = agentRes.confidence_score;
            complexityScore = agentRes.complexity_score;
          } else if (ticket?.agent_message) {
            agentMessage = ticket.agent_message;
            if (ticket.cards) cards = ticket.cards;
            if (ticket.tools_used) toolsUsed = ticket.tools_used;
          }
        }
      } else {
        // create new ticket
        const res = await fetch(`${API_BASE_URL}/api/admin/tickets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipment_id: relevantShipment?._id || null,
            consumer_id: user?.id || null,
            message: { content },
            subject: content.substring(0, 100),
            priority: "medium",
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const ticket = data.data?.ticket;
          const agentRes = data.data?.agent_response;
          const chatId = data.data?.chat_id;

          // store ticket and chat ids for follow-ups
          if (ticket?._id) {
            setActiveTicketId(ticket._id);
          }
          if (chatId) {
            setActiveChatId(chatId);
          }

          if (agentRes) {
            if (agentRes.agent_message) agentMessage = agentRes.agent_message;
            if (agentRes.cards) cards = agentRes.cards;
            if (agentRes.tools_used) toolsUsed = agentRes.tools_used;
            if (agentRes.actions_taken) actionsTaken = agentRes.actions_taken;
            reasoning = toAgentReasoning(agentRes.reasoning);
            confidenceScore = agentRes.confidence_score;
            complexityScore = agentRes.complexity_score;
          } else if (ticket?.agent_message) {
            agentMessage = ticket.agent_message;
            if (ticket.cards) cards = ticket.cards;
            if (ticket.tools_used) toolsUsed = ticket.tools_used;
          }
        } else {
          // fallback to direct agent endpoint
          try {
            const fallbackRes = await fetch(
              `${API_BASE_URL}/api/shipments/agent`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  consumer_id: user?.id || "anonymous",
                  message: { content },
                }),
              }
            );
            if (fallbackRes.ok) {
              const fbData = await fallbackRes.json();
              const d = fbData.data || fbData;
              if (d.agent_message) agentMessage = d.agent_message;
              if (d.cards) cards = d.cards;
              if (d.tools_used) toolsUsed = d.tools_used;
            }
          } catch {
            // silent
          }
        }
      }

      const assistantMsg: ChatMessageType = {
        id: genId("msg"),
        role: "assistant",
        content: agentMessage,
        timestamp: Date.now(),
        cards: cards.length > 0 ? cards : undefined,
        toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
        actionsTaken: actionsTaken.length > 0 ? actionsTaken : undefined,
        agentReasoning: reasoning,
        confidenceScore,
        complexityScore,
        isHuman: false,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setTimeout(fetchTickets, 1000);
    } catch {
      const errorMsg: ChatMessageType = {
        id: genId("msg"),
        role: "assistant",
        content:
          "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, activeTicketId, user?.id, shipments, fetchTickets]);

  // handle action card clicks - execute actions directly
  const handleActionClick = useCallback(
    async (card: ActionCard) => {
      // link type - open in new tab
      if (card.type === "link" && card.url) {
        window.open(card.url, "_blank");
        return;
      }

      // escalation actions
      const isEscalation =
        card.label?.toLowerCase().includes("talk to human") ||
        card.label?.toLowerCase().includes("human agent") ||
        card.label?.toLowerCase().includes("escalate") ||
        card.action_payload?.action_type === "escalate";

      if (isEscalation) {
        if (!activeTicketId) {
          toast.error("No active conversation to escalate");
          return;
        }

        setIsLoading(true);
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/admin/tickets/${activeTicketId}/escalate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reason: (card.action_payload?.params as Record<string, unknown>)?.reason || "User requested human agent",
              }),
            }
          );

          const systemMsg: ChatMessageType = {
            id: genId("msg"),
            role: "assistant",
            content:
              "You've been connected to a human agent. They will respond to you shortly.",
            timestamp: Date.now(),
            isHuman: true,
          };

          setMessages((prev) => [...prev, systemMsg]);
          setIsEscalated(true);

          toast.success("Connected to human support", {
            description: "A support agent will respond shortly.",
          });
        } catch {
          toast.error("Failed to connect to human support");
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // generic action - send as follow-up message with action context
      if (card.action_payload) {
        toast.info(`Action "${card.label}" triggered`, {
          description: "Processing your request...",
        });

        const actionMsg: ChatMessageType = {
          id: genId("msg"),
          role: "assistant",
          content: `I've processed your request for "${card.label}". Is there anything else I can help with?`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, actionMsg]);
        return;
      }

      // fallback - fill the input with the label
      setInput(card.label);
    },
    [activeTicketId]
  );

  const handleNewConversation = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setMessages([WELCOME_MESSAGE]);
    setActiveTicketId(null);
    setActiveChatId(null);
    setIsEscalated(false);
    setInput("");
  }, []);

  const handleSelectTicket = useCallback(
    async (ticket: SupportTicket) => {
      setActiveTicketId(ticket.id);
      setIsEscalated(false);
      await loadTicketMessages(ticket.id);
    },
    [loadTicketMessages]
  );

  const handleQuickIssue = useCallback((issue: (typeof QUICK_ISSUES)[number]) => {
    setInput(issue.message);
  }, []);

  const showQuickIssues = messages.length <= 1 && !isLoading && !activeTicketId;

  const filteredTickets = useMemo(() => {
    if (!ticketSearch) return tickets;
    const q = ticketSearch.toLowerCase();
    return tickets.filter(
      (t) =>
        t.ticketId?.toLowerCase().includes(q) ||
        t.lastMessage.toLowerCase().includes(q)
    );
  }, [tickets, ticketSearch]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* left: past tickets sidebar */}
      <div className="hidden w-64 flex-col border-r lg:flex">
        <div className="shrink-0 border-b px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
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
                ? "border-l-primary bg-primary/5 border-l-2"
                : "border-l-transparent hover:bg-muted/30 border-l-2"
            )}
          >
            <div className="bg-primary/10 flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
              <Headphones className="text-primary h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">New Conversation</p>
              <p className="text-muted-foreground truncate text-[10px]">
                Start a new support thread
              </p>
            </div>
          </button>

          {/* past tickets */}
          {filteredTickets.length > 0 && (
            <div className="px-3 pb-1 pt-2">
              <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
                Recent Tickets
              </p>
            </div>
          )}
          {filteredTickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => handleSelectTicket(ticket)}
              className={cn(
                "flex w-full items-start gap-2 border-b border-border/30 px-3 py-2.5 text-left transition-colors",
                activeTicketId === ticket.id
                  ? "border-l-primary bg-primary/5 border-l-2"
                  : "border-l-transparent hover:bg-muted/30 border-l-2"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-muted-foreground truncate font-mono text-[10px]">
                    {ticket.ticketId || "General"}
                  </span>
                  <span className="text-muted-foreground/60 shrink-0 text-[9px]">
                    {formatRelativeTime(ticket.timestamp)}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px]">
                  {ticket.lastMessage}
                </p>
                {ticket.status && (
                  <span
                    className={cn(
                      "mt-0.5 inline-block rounded px-1 py-0.5 text-[9px] font-medium",
                      ticket.status === "active"
                        ? "bg-sky-500/10 text-sky-400"
                        : ticket.status === "resolved"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {ticket.status}
                  </span>
                )}
              </div>
              <ChevronRight className="text-muted-foreground/30 mt-1 h-3 w-3 shrink-0" />
            </button>
          ))}

          {filteredTickets.length === 0 && tickets.length === 0 && (
            <div className="flex flex-col items-center justify-center px-4 py-10">
              <MessageCircle className="text-muted-foreground/30 h-6 w-6" />
              <p className="text-muted-foreground/50 mt-2 text-center text-[11px]">
                No past conversations yet
              </p>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* center: chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* header */}
        <div className="border-border/40 flex h-14 shrink-0 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-lg">
              {isEscalated ? (
                <UserCircle className="text-primary h-4 w-4" />
              ) : (
                <MessageCircle className="text-foreground h-4 w-4" />
              )}
            </div>
            <div>
              <h1 className="text-foreground text-sm font-medium">
                {isEscalated ? "Human Support" : "Support"}
              </h1>
              <p className="text-muted-foreground text-xs">
                {isEscalated
                  ? "Connected to agent"
                  : activeTicketId
                    ? "Ongoing conversation"
                    : "New conversation"}
              </p>
            </div>
          </div>

          {activeTicketId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewConversation}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          )}
        </div>

        {/* escalation banner */}
        {isEscalated && (
          <div className="border-primary/20 bg-primary/10 border-b px-4 py-2">
            <p className="text-primary text-xs">
              You're now chatting with a human agent. They'll respond shortly.
            </p>
          </div>
        )}

        {/* messages */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="flex flex-col gap-4 p-4">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onAction={handleActionClick}
              />
            ))}

            <AnimatePresence mode="wait">
              {isLoading && <ThinkingIndicator key="thinking" />}
            </AnimatePresence>

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
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={sendMessage}
          isLoading={isLoading}
          placeholder={
            isEscalated
              ? "Message human agent..."
              : "Type your message..."
          }
        />
      </div>

      {/* right: active shipments context panel */}
      <div className="hidden w-72 flex-col border-l xl:flex">
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Package className="text-muted-foreground h-4 w-4" />
            <span className="text-sm font-medium">Your Shipments</span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-[10px]">
            Agent has context about all your shipments
          </p>
        </div>
        <ScrollArea className="flex-1">
          {shipments.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16">
              <Package className="text-muted-foreground/30 h-6 w-6" />
              <p className="text-muted-foreground/50 mt-2 text-center text-xs">
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
                      <span className="truncate font-mono text-xs font-medium">
                        {s.tracking_id}
                      </span>
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          statusColors[s.status] || "bg-zinc-400"
                        )}
                      />
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                      {s.origin?.city || "?"} → {s.destination?.city || "?"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground text-[10px] capitalize">
                        {s.status.replace(/_/g, " ")}
                      </span>
                      {s.delay > 0 && (
                        <span className="text-[10px] text-red-500">
                          +{Math.round(s.delay / 60)}h delay
                        </span>
                      )}
                      {s.sla_breached && (
                        <span className="text-[10px] font-medium text-red-600">
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
                      <p className="text-muted-foreground/60 mt-0.5 text-[10px]">
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
