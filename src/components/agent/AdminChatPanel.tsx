"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Send,
  Loader2,
  CheckCircle2,
  UserCircle,
  RotateCcw,
  Clock,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { MarkdownContent } from "./MarkdownContent";
import { toast } from "sonner";
import {
  fetchTicketMessagesAdmin,
  sendAdminMessage,
  resolveTicketAdmin,
} from "~/lib/api/tickets";
import type { Ticket, TicketHistoryItem } from "~/lib/api/tickets";

const GEMINI_API_KEY = "AIzaSyCsg9Kzzic1w62Ojq7mKUqduXYbq0NGRY8";

// format time for message
function formatTime(timestamp: string | number): string {
  const time =
    typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;
  return new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// chat message component
function ChatBubble({ message }: { message: TicketHistoryItem }) {
  const isUser = message.role === "user";
  const isHuman = message.is_human;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group flex w-full gap-3",
        isUser ? "justify-start" : "justify-end"
      )}
    >
      <div
        className={cn(
          "flex max-w-[85%] min-w-0 flex-col",
          isUser ? "items-start" : "items-end"
        )}
      >
        {/* sender badge */}
        {!isUser && (
          <div className="mb-1 flex items-center gap-1">
            <UserCircle className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">
              {isHuman ? "you" : "ai"}
            </span>
          </div>
        )}

        <div
          className={cn(
            "relative max-w-full rounded-2xl px-4 py-2.5",
            isUser
              ? "bg-muted text-foreground rounded-bl-md"
              : isHuman
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-emerald-500/10 text-foreground rounded-br-md border border-emerald-500/20"
          )}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          ) : (
            <MarkdownContent content={message.content} />
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-muted-foreground/50 text-[10px]">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// generate suggestions using gemini
async function generateSuggestions(
  messages: TicketHistoryItem[]
): Promise<string[]> {
  if (messages.length === 0) return [];

  const chatContext = messages
    .slice(-10)
    .map((m) => `${m.role === "user" ? "Customer" : "Support"}: ${m.content}`)
    .join("\n");

  const prompt = `You are a customer support assistant helping a human agent respond to customers. Based on the conversation below, suggest 3 SHORT follow-up questions or responses the agent could use.

Rules:
- Keep each suggestion under 40 characters
- Make them actionable and helpful
- Focus on understanding the issue or providing solutions
- No greetings or pleasantries

Conversation:
${chatContext}

Return ONLY a JSON array of 3 strings. Example: ["Can you share the error?", "When did this start?", "Let me check that for you"]`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 200,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Gemini API error");
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // extract json array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]);
      if (Array.isArray(suggestions)) {
        return suggestions.slice(0, 3).map((s: string) => s.slice(0, 50));
      }
    }

    return [];
  } catch (error) {
    console.error("Failed to generate suggestions:", error);
    return [];
  }
}

interface AdminChatPanelProps {
  selectedTicket?: Ticket | null;
  onTicketUpdated?: () => void;
}

export function AdminChatPanel({
  selectedTicket,
  onTicketUpdated,
}: AdminChatPanelProps) {
  const [messages, setMessages] = useState<TicketHistoryItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastTicketIdRef = useRef<string | null>(null);

  // load messages and generate suggestions when ticket changes
  useEffect(() => {
    if (selectedTicket) {
      setMessages(selectedTicket.chat_history || []);

      // generate suggestions when ticket changes
      if (
        selectedTicket._id !== lastTicketIdRef.current &&
        selectedTicket.is_escalated &&
        selectedTicket.status !== "resolved" &&
        selectedTicket.chat_history &&
        selectedTicket.chat_history.length > 0
      ) {
        lastTicketIdRef.current = selectedTicket._id;
        setSuggestions([]);
        setIsLoadingSuggestions(true);

        generateSuggestions(selectedTicket.chat_history)
          .then((newSuggestions) => {
            setSuggestions(newSuggestions);
          })
          .catch(() => {
            setSuggestions([]);
          })
          .finally(() => {
            setIsLoadingSuggestions(false);
          });
      }
    } else {
      setMessages([]);
      setSuggestions([]);
      lastTicketIdRef.current = null;
    }
  }, [selectedTicket]);

  // regenerate suggestions when new user message arrives via polling
  useEffect(() => {
    if (
      messages.length > 0 &&
      selectedTicket?.is_escalated &&
      selectedTicket?.status !== "resolved"
    ) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === "user" && !isLoadingSuggestions) {
        setIsLoadingSuggestions(true);
        generateSuggestions(messages)
          .then((newSuggestions) => {
            setSuggestions(newSuggestions);
          })
          .catch(() => {
            setSuggestions([]);
          })
          .finally(() => {
            setIsLoadingSuggestions(false);
          });
      }
    }
  }, [messages.length, selectedTicket?.is_escalated, selectedTicket?.status]);

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
  }, [messages]);

  // polling for new messages
  useEffect(() => {
    if (selectedTicket && selectedTicket.is_escalated && selectedTicket.status !== "resolved") {
      const poll = async () => {
        try {
          const newMessages = await fetchTicketMessagesAdmin(selectedTicket._id);
          setMessages(newMessages);
        } catch (error) {
          console.error("Polling error:", error);
        }
      };

      pollingRef.current = setInterval(poll, 2000);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
        }
      };
    }
  }, [selectedTicket]);

  const handleSendMessage = useCallback(
    async (content?: string) => {
      const messageContent = content || inputValue.trim();
      if (!messageContent || !selectedTicket || isSending) return;

      setIsSending(true);
      setInputValue("");
      setSuggestions([]);

      // optimistic update
      const optimisticMessage: TicketHistoryItem = {
        role: "assistant",
        content: messageContent,
        timestamp: new Date().toISOString(),
        is_human: true,
      };
      setMessages((prev) => [...prev, optimisticMessage]);

      try {
        await sendAdminMessage(selectedTicket._id, messageContent);
        onTicketUpdated?.();
      } catch (error) {
        console.error("Failed to send message:", error);
        toast.error("Failed to send message");
        setMessages((prev) => prev.slice(0, -1));
        setInputValue(messageContent);
      } finally {
        setIsSending(false);
      }
    },
    [inputValue, selectedTicket, isSending, onTicketUpdated]
  );

  const handleResolve = useCallback(async () => {
    if (!selectedTicket || isResolving) return;

    setIsResolving(true);

    // optimistic update
    const resolutionMessage: TicketHistoryItem = {
      role: "assistant",
      content: "This ticket has been marked as resolved. Feel free to start a new conversation if you need help.",
      timestamp: new Date().toISOString(),
      is_human: true,
    };
    setMessages((prev) => [...prev, resolutionMessage]);

    try {
      // resolve ticket in backend (webhook is sent from backend)
      await resolveTicketAdmin(selectedTicket._id);

      toast.success("Ticket resolved");
      onTicketUpdated?.();
    } catch (error) {
      console.error("Failed to resolve ticket:", error);
      toast.error("Failed to resolve ticket");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsResolving(false);
    }
  }, [selectedTicket, isResolving, onTicketUpdated]);

  const handleReopen = useCallback(async () => {
    if (!selectedTicket || isReopening) return;

    setIsReopening(true);

    const reopenMessage = "I'm reopening this ticket. How can I help you?";

    const optimisticMessage: TicketHistoryItem = {
      role: "assistant",
      content: reopenMessage,
      timestamp: new Date().toISOString(),
      is_human: true,
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      await sendAdminMessage(selectedTicket._id, reopenMessage);
      toast.success("Ticket reopened");
      onTicketUpdated?.();
    } catch (error) {
      console.error("Failed to reopen ticket:", error);
      toast.error("Failed to reopen ticket");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsReopening(false);
    }
  }, [selectedTicket, isReopening, onTicketUpdated]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestionClick = (text: string) => {
    handleSendMessage(text);
  };

  const isResolved = selectedTicket?.status === "resolved";

  if (!selectedTicket) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Select a ticket to view the conversation</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* header */}
      <div className="border-border/40 flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-sm font-medium">
              Ticket #{selectedTicket.ticket_id?.slice(-6) || selectedTicket._id?.slice(-6)}
            </h3>
            <p className="text-muted-foreground text-xs">
              {isResolved ? "Resolved" : "Active conversation"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isResolved ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleReopen}
              disabled={isReopening}
              className="text-xs text-primary/70 hover:text-primary hover:bg-primary/10"
            >
              {isReopening ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-3 w-3" />
              )}
              Reopen
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleResolve}
              disabled={isResolving}
              className="text-xs text-emerald-600/70 hover:text-emerald-600 hover:bg-emerald-600/10"
            >
              {isResolving ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3 w-3" />
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
            This ticket has been resolved. Send a new message to reopen the ticket.
          </p>
        </div>
      )}

      {/* messages */}
      <ScrollArea ref={scrollRef} className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-muted-foreground text-sm">No messages yet</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {messages.map((message, index) => (
                <ChatBubble
                  key={`${message.timestamp}-${index}`}
                  message={message}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>

      {/* suggestions */}
      {!isResolved && selectedTicket.is_escalated && (
        <div className="border-border/40 border-t px-3 py-2">
          {isLoadingSuggestions ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Generating suggestions...</span>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((suggestion, index) => (
                <motion.button
                  key={index}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="text-xs px-2.5 py-1.5 rounded-full bg-primary/5 text-primary/80 hover:bg-primary/10 hover:text-primary transition-colors border border-primary/10"
                >
                  {suggestion}
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleSendMessage("Let me review your case and get back to you shortly.")}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Clock className="h-3 w-3" />
                Need time to review
              </button>
            </div>
          )}
        </div>
      )}

      {/* input */}
      {!isResolved && (
        <div className="border-border/40 bg-background border-t p-3">
          <div
            className={cn(
              "bg-input/20 flex flex-col rounded-xl",
              "ring-1 ring-transparent transition-all duration-200"
            )}
          >
            <div className="px-3 py-3">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your response..."
                disabled={isSending}
                rows={1}
                className={cn(
                  "w-full resize-none border-none text-sm leading-relaxed shadow-none focus-visible:ring-0",
                  "placeholder:text-muted-foreground/60",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
                style={{ minHeight: "24px", maxHeight: "120px" }}
              />
            </div>

            <div className="flex items-center justify-end px-2 pb-2">
              {isSending ? (
                <Button size="icon" variant="ghost" className="h-8 w-8" disabled>
                  <Loader2 className="h-4 w-4 animate-spin" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8 transition-colors",
                    inputValue.trim()
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground/50"
                  )}
                  onClick={() => handleSendMessage()}
                  disabled={!inputValue.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
