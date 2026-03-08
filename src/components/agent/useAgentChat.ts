"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import type { ChatMessage, ActionCard, AgentResponse, ActionType, AgentReasoning } from "./types";
import { getUser } from "~/hooks/useUser";
import { config } from "~/lib/config";
import { escalateTicket, fetchChatHistory, type TicketHistoryItem } from "~/lib/api/tickets";

// helper to safely cast reasoning to AgentReasoning type
function toAgentReasoning(reasoning: unknown): AgentReasoning | undefined {
  if (!reasoning || typeof reasoning !== "object") return undefined;
  const r = reasoning as Record<string, unknown>;
  return {
    issue_type: (r.issue_type as AgentReasoning["issue_type"]) || undefined,
    root_cause: (r.root_cause as string) || undefined,
    assumptions: (r.assumptions as string[]) || undefined,
    uncertainties: (r.uncertainties as string[]) || undefined,
  };
}

// detect action type from card - delivery platform specific
function detectActionType(card: ActionCard): ActionType {
  const actionType = card.action_payload?.action_type;
  if (actionType) return actionType;

  const label = (card.label || "").toLowerCase();

  if (label.includes("human") || label.includes("escalate") || label.includes("talk to") || label.includes("support agent")) {
    return "escalate";
  }
  if (label.includes("reroute") || label.includes("redirect")) {
    return "reroute";
  }
  if (label.includes("notify") || label.includes("email") || label.includes("sms")) {
    return "notify_consumer";
  }
  if (label.includes("priority") || label.includes("urgent")) {
    return "reprioritize";
  }

  return "generic";
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello! I'm here to help with your delivery and shipment questions. Describe your issue or select a quick option below.",
  timestamp: Date.now(),
};

// checks if an action card is an escalation action
function isEscalationAction(card: ActionCard): boolean {
  const label = (card.label || "").toLowerCase();
  const webhookPath = (card.action_payload?.webhook_to_call || "").toLowerCase();
  const cardId = (card.id || "").toLowerCase();

  const escalationPatterns = [
    "talk to human",
    "contact support",
    "human agent",
    "speak to agent",
    "escalate",
    "human support",
    "live agent",
    "real person",
    "talk_to_human",
    "contact_support",
    "escalate_to_human",
    "human",
  ];

  for (const pattern of escalationPatterns) {
    if (label.includes(pattern) || pattern.includes(label)) {
      return true;
    }
  }

  if (
    webhookPath.includes("escalate") ||
    webhookPath.includes("human") ||
    webhookPath.includes("/support")
  ) {
    return true;
  }

  for (const pattern of escalationPatterns) {
    if (cardId.includes(pattern.replace(/\s/g, "_")) || cardId.includes(pattern.replace(/\s/g, ""))) {
      return true;
    }
  }

  return false;
}

export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentTicketId, setCurrentTicketId] = useState<string | null>(null);
  const [isEscalated, setIsEscalated] = useState(false);
  const [ticketStatus, setTicketStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, isLoading]);

  // polling for escalated tickets
  useEffect(() => {
    if (isEscalated && currentTicketId) {
      const poll = async () => {
        try {
          const history = await fetchChatHistory(currentTicketId);
          const loadedMessages: ChatMessage[] = history.map((item: TicketHistoryItem, index: number) => ({
            id: `polled-${currentTicketId}-${index}`,
            role: item.role,
            content: item.content,
            timestamp: new Date(item.timestamp).getTime(),
            cards: item.cards,
            ticketId: item.role === "assistant" ? currentTicketId : undefined,
            toolsUsed: item.tools_used,
            actionsTaken: item.actions_taken,
            agentReasoning: toAgentReasoning(item.reasoning),
            confidenceScore: item.confidence_score,
            complexityScore: item.complexity_score,
            isHuman: item.is_human,
          }));

          if (loadedMessages.length > 0) {
            setMessages(loadedMessages);
          }
        } catch (error) {
          console.error("[Agent] Polling error:", error);
        }
      };

      pollingRef.current = setInterval(poll, 2000);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
        }
      };
    }
  }, [isEscalated, currentTicketId]);

  // send message to agent
  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const user = getUser();
    if (!user?.id) {
      toast.error("Please sign in to continue");
      return;
    }

    const userMessage: ChatMessage = {
      id: generateId("msg"),
      role: "user",
      content: inputValue.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const payload = {
        _id: currentTicketId,
        shipment_id: null,
        consumer_id: user.id,
        message: {
          content: userMessage.content,
        },
      };

      const response = await fetch(config.api.shipments.agent, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      const data: AgentResponse & {
        success?: boolean;
        error?: string;
        tools_used?: string[];
        is_escalated?: boolean;
      } = responseData.data || responseData;

      if (data.ticket_id && !currentTicketId) {
        setCurrentTicketId(data.ticket_id);
      }

      if (data.is_escalated) {
        setIsEscalated(true);
      } else if (data.agent_message) {
        const assistantMessage: ChatMessage = {
          id: generateId("msg"),
          role: "assistant",
          content: data.agent_message,
          timestamp: Date.now(),
          cards: data.cards || [],
          ticketId: data.ticket_id,
          toolsUsed: data.tools_used || [],
          actionsTaken: data.actions_taken || [],
          agentReasoning: data.reasoning,
          confidenceScore: data.confidence_score,
          complexityScore: data.complexity_score,
          isHuman: false,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error("[Agent] Error sending message:", error);

      const errorMessage: ChatMessage = {
        id: generateId("msg"),
        role: "assistant",
        content:
          "I encountered an error while processing your request. Please try again or contact support if the issue persists.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);

      toast.error("Failed to send message", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, currentTicketId]);

  // handle action button click
  const handleActionClick = useCallback(
    async (card: ActionCard) => {
      // handle link type
      if (card.type === "link" && card.url) {
        window.open(card.url, "_blank");
        return;
      }

      // check if this is an escalation action
      if (isEscalationAction(card)) {
        if (!currentTicketId) {
          toast.error("No active conversation to escalate");
          return;
        }

        setIsLoading(true);

        try {
          const result = await escalateTicket(currentTicketId);

          const systemMessage: ChatMessage = {
            id: generateId("msg"),
            role: "assistant",
            content: (result as any).system_message || "You've been connected to a human agent. They will respond to you shortly.",
            timestamp: Date.now(),
            isHuman: true,
          };

          setMessages((prev) => [...prev, systemMessage]);
          setIsEscalated(true);

          toast.success("Connected to human support", {
            description: "A support agent will respond shortly.",
          });
        } catch (error) {
          console.error("[Agent] Failed to escalate:", error);
          toast.error("Failed to connect to human support");

          const errorMessage: ChatMessage = {
            id: generateId("msg"),
            role: "assistant",
            content:
              "Sorry, I couldn't connect you to a human agent right now. Please try again in a moment.",
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // handle delivery-platform specific actions
      if (card.action_payload) {
        const actionType = detectActionType(card);

        setIsLoading(true);

        try {
          let responseContent = `I've processed your request for "${card.label}".`;

          if (actionType === "reroute") {
            responseContent = `I've initiated a reroute for your shipment. You'll receive an updated ETA shortly.`;
          } else if (actionType === "notify_consumer") {
            responseContent = `Notification has been sent. You should receive an update shortly.`;
          } else if (actionType === "reprioritize") {
            responseContent = `Your shipment has been reprioritized. The team will handle it with higher urgency.`;
          }

          responseContent += " Is there anything else I can help you with?";

          toast.info(`Action "${card.label}" triggered`, {
            description: "Processing your request...",
          });

          const actionMessage: ChatMessage = {
            id: generateId("msg"),
            role: "assistant",
            content: responseContent,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, actionMessage]);
        } catch (error) {
          console.log("[Agent] Action error:", error);
          toast.error(`Failed to execute "${card.label}"`, {
            description: error instanceof Error ? error.message : "An error occurred",
          });

          const errorMessage: ChatMessage = {
            id: generateId("msg"),
            role: "assistant",
            content: `Sorry, I encountered an error while processing "${card.label}". Please try again.`,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        } finally {
          setIsLoading(false);
        }
      }
    },
    [currentTicketId]
  );

  // start new conversation
  const startNewConversation = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    setMessages([WELCOME_MESSAGE]);
    setInputValue("");
    setCurrentTicketId(null);
    setIsEscalated(false);
    setTicketStatus(null);
  }, []);

  // load existing ticket conversation
  const loadTicketConversation = useCallback(
    (
      ticketId: string,
      chatHistory: TicketHistoryItem[],
      ticketIsEscalated?: boolean
    ) => {
      const loadedMessages: ChatMessage[] = chatHistory.map((item: TicketHistoryItem, index: number) => ({
        id: `loaded-${ticketId}-${index}`,
        role: item.role,
        content: item.content,
        timestamp: new Date(item.timestamp).getTime(),
        cards: item.cards,
        ticketId: item.role === "assistant" ? ticketId : undefined,
        toolsUsed: item.tools_used,
        actionsTaken: item.actions_taken,
        agentReasoning: toAgentReasoning(item.reasoning),
        confidenceScore: item.confidence_score,
        complexityScore: item.complexity_score,
        isHuman: item.is_human,
      }));

      setMessages(
        loadedMessages.length > 0 ? loadedMessages : [WELCOME_MESSAGE]
      );
      setCurrentTicketId(ticketId);
      setIsEscalated(ticketIsEscalated || false);
    },
    []
  );

  return {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    scrollRef,
    currentTicketId,
    isEscalated,
    ticketStatus,
    sendMessage,
    handleActionClick,
    startNewConversation,
    loadTicketConversation,
  };
}
