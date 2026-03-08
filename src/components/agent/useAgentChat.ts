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

// detect action type from card
function detectActionType(card: ActionCard): ActionType {
  const actionType = card.action_payload?.action_type;
  if (actionType) return actionType;

  const label = (card.label || "").toLowerCase();
  const webhookPath = (card.action_payload?.webhook_to_call || "").toLowerCase();


  if (label.includes("human") || label.includes("escalate") || label.includes("talk to")) {
    return "escalate";
  }
  if (label.includes("webhook") || label.includes("resend")) {
    return "resend_webhook";
  }


  return "generic";
}

// generates unique id
function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello! I'm here to help with your support requests. Describe your issue or question, and I'll assist you.",
  timestamp: Date.now(),
};

// checks if an action card is an escalation action
function isEscalationAction(card: ActionCard): boolean {
  const label = (card.label || "").toLowerCase();
  const webhookPath = (card.action_payload?.webhook_to_call || "").toLowerCase();
  const cardId = (card.id || "").toLowerCase();

  // check various patterns that indicate escalation
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
    "talkto human",
    "human",
  ];

  // check label
  for (const pattern of escalationPatterns) {
    if (label.includes(pattern) || pattern.includes(label)) {
      console.log("[Agent] Escalation detected via label:", label);
      return true;
    }
  }

  // check webhook path
  if (
    webhookPath.includes("escalate") ||
    webhookPath.includes("human") ||
    webhookPath.includes("/support")
  ) {
    console.log("[Agent] Escalation detected via webhook:", webhookPath);
    return true;
  }

  // check card id
  for (const pattern of escalationPatterns) {
    if (cardId.includes(pattern.replace(/\s/g, "_")) || cardId.includes(pattern.replace(/\s/g, ""))) {
      console.log("[Agent] Escalation detected via card id:", cardId);
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
      console.log("[Agent] Starting polling for escalated ticket:", currentTicketId);

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

      // poll every 2 seconds
      pollingRef.current = setInterval(poll, 2000);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
        }
      };
    }
  }, [isEscalated, currentTicketId]);

  // send message to agent via express backend
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
      // build payload matching backend's sendAgentMessage expectations
      const payload = {
        _id: currentTicketId,
        shipment_id: null,
        consumer_id: user.id,
        merchant_id: user.id,
        message: {
          content: userMessage.content,
        },
      };

      console.log("[Agent] Sending message:", payload);

      // send to express backend
      const response = await fetch(config.api.shipments.agent, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();
      console.log("[Agent] Response:", responseData);

      // extract data from api response wrapper
      const data: AgentResponse & {
        success?: boolean;
        error?: string;
        tools_used?: string[];
        is_escalated?: boolean;
      } = responseData.data || responseData;

      // store ticket id for subsequent messages
      if (data.ticket_id && !currentTicketId) {
        console.log("[Agent] Setting ticket id:", data.ticket_id);
        setCurrentTicketId(data.ticket_id);
      }

      // check if ticket is escalated (no ai response)
      if (data.is_escalated) {
        console.log("[Agent] Ticket is escalated, enabling polling");
        setIsEscalated(true);
        // no assistant message to add when escalated
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
      console.log("[Agent] Action clicked:", card);

      // handle link type
      if (card.type === "link" && card.url) {
        window.open(card.url, "_blank");
        return;
      }

      // check if this is an escalation action
      if (isEscalationAction(card)) {
        console.log("[Agent] Escalation action detected, currentTicketId:", currentTicketId);

        if (!currentTicketId) {
          toast.error("No active conversation to escalate");
          return;
        }

        setIsLoading(true);

        try {
          console.log("[Agent] Calling escalateTicket API for:", currentTicketId);
          const result = await escalateTicket(currentTicketId);
          console.log("[Agent] Escalation result:", result);

          // add system message
          const systemMessage: ChatMessage = {
            id: generateId("msg"),
            role: "assistant",
            content: result.system_message || "You've been connected to a human agent. They will respond to you shortly.",
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

          // add error message
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

      // handle other action payloads (non-escalation)
      if (card.action_payload) {
        const actionType = detectActionType(card);
        console.log("[Agent] Action type detected:", actionType, "payload:", card.action_payload);

        setIsLoading(true);

        try {
            toast.info(`Action "${card.label}" triggered`, {
              description: "Processing your request...",
            });

            const actionMessage: ChatMessage = {
              id: generateId("msg"),
              role: "assistant",
              content: `I've processed your request for "${card.label}". Is there anything else I can help you with?`,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, actionMessage]);

        } catch (error) {console.log("[Agent] Action error:", error);
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
    console.log("[Agent] Starting new conversation");

    // stop polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    setMessages([WELCOME_MESSAGE]);
    setInputValue("");
    setCurrentTicketId(null);
    setIsEscalated(false);
  }, []);

  // load existing ticket conversation
  const loadTicketConversation = useCallback(
    (
      ticketId: string,
      chatHistory: TicketHistoryItem[],
      ticketIsEscalated?: boolean
    ) => {
      console.log("[Agent] Loading ticket conversation:", ticketId, "escalated:", ticketIsEscalated);

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
    sendMessage,
    handleActionClick,
    startNewConversation,
    loadTicketConversation,
  };
}
