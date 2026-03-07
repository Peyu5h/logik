"use client";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { MessageCircle, Plus, UserCircle } from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { useAgentChat } from "./useAgentChat";
import type { TicketHistoryItem } from "~/lib/api/tickets";

interface AgentPanelProps {
  selectedTicketId?: string | null;
  ticketChatHistory?: TicketHistoryItem[];
  ticketIsEscalated?: boolean;
  ticketStatus?: string;
  onTicketCreated?: (ticketId: string) => void;
  onMessageSent?: () => void;
}

export function AgentPanel({
  selectedTicketId,
  ticketChatHistory,
  ticketIsEscalated,
  ticketStatus,
  onTicketCreated,
  onMessageSent,
}: AgentPanelProps) {
  const {
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
  } = useAgentChat();

  const isResolved = ticketStatus === "resolved";

  // load ticket conversation when selected ticket changes
  useEffect(() => {
    if (selectedTicketId && ticketChatHistory) {
      loadTicketConversation(selectedTicketId, ticketChatHistory, ticketIsEscalated);
    }
  }, [selectedTicketId, ticketChatHistory, ticketIsEscalated, loadTicketConversation]);

  // notify parent when new ticket is created
  useEffect(() => {
    if (currentTicketId && onTicketCreated && !selectedTicketId) {
      onTicketCreated(currentTicketId);
    }
  }, [currentTicketId, onTicketCreated, selectedTicketId]);

  // notify parent when message is sent (to refresh ticket list)
  useEffect(() => {
    if (messages.length > 1 && onMessageSent) {
      onMessageSent();
    }
  }, [messages.length, onMessageSent]);

  return (
    <div className="bg-background flex h-full w-full flex-col">
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
                : currentTicketId
                  ? currentTicketId
                  : "New conversation"}
            </p>
          </div>
        </div>

        {currentTicketId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={startNewConversation}
            className="gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        )}
      </div>

      {/* resolved banner */}
      {isResolved && (
        <div className="bg-emerald-500/10 border-emerald-500/20 border-b px-4 py-2">
          <p className="text-emerald-600 text-xs">
            This ticket has been resolved. Send a new message to reopen the ticket.
          </p>
        </div>
      )}

      {/* escalation banner */}
      {isEscalated && !isResolved && (
        <div className="bg-primary/10 border-primary/20 border-b px-4 py-2">
          <p className="text-primary text-xs">
            You're now chatting with a human agent. They'll respond shortly.
          </p>
        </div>
      )}

      {/* chat area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="flex flex-col gap-4 p-4">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onAction={handleActionClick}
            />
          ))}

          <AnimatePresence mode="wait">
            {isLoading && <ThinkingIndicator key="thinking" />}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* input */}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={sendMessage}
        isLoading={isLoading}
        placeholder={isResolved ? "Send message to reopen ticket..." : isEscalated ? "Message human agent..." : undefined}
      />
    </div>
  );
}
