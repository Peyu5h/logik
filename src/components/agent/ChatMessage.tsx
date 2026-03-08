"use client";

import { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "~/lib/utils";
import { ToolsUsed } from "./ToolsUsed";
import { ActionCards } from "./ActionCards";
import { MessageActions } from "./MessageActions";
import { MarkdownContent } from "./MarkdownContent";
import { formatTime } from "./utils";
import type { ChatMessage as ChatMessageType, ActionCard } from "./types";
import { UserCircle, ChevronDown, Brain } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageType;
  onAction: (card: ActionCard) => void;
}

// delivery platform specific tools to show
const relevantTools = [
  "check_shipment_status",
  "track_shipment",
  "get_delivery_eta",
  "contact_carrier",
  "check_warehouse_status",
  "reroute_shipment",
  "escalate_to_human",
  "notify_consumer",
  "check_sla",
  "get_shipment_history",
];

// filters tools to only show delivery-platform relevant ones
function filterRelevantTools(tools: string[]): string[] {
  if (!tools || tools.length === 0) return [];
  return tools.filter((t) => {
    const lower = t.toLowerCase();
    // exclude coding agent tools
    if (lower.includes("github") || lower.includes("migration") || lower.includes("codebase") || lower.includes("repository") || lower.includes("pull_request") || lower.includes("code_review")) {
      return false;
    }
    return true;
  });
}

export const ChatMessage = memo(function ChatMessage({
  message,
  onAction,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const isHuman = message.isHuman;
  const [showReasoning, setShowReasoning] = useState(false);

  const hasReasoning = message.agentReasoning && (
    message.agentReasoning.root_cause ||
    message.agentReasoning.assumptions?.length ||
    message.agentReasoning.uncertainties?.length
  );

  const filteredTools = filterRelevantTools(message.toolsUsed || []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group flex w-full gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "flex max-w-[85%] min-w-0 flex-col",
          isUser ? "items-end" : "items-start",
        )}
      >
        {/* human agent badge */}
        {!isUser && isHuman && (
          <div className="mb-1 flex items-center gap-1">
            <UserCircle className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">human agent</span>
          </div>
        )}

        <div
          className={cn(
            "relative max-w-full",
            isUser
              ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5"
              : isHuman
                ? "bg-primary/10 border border-primary/20 rounded-2xl rounded-bl-md px-4 py-2.5"
                : "text-foreground",
          )}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          ) : (
            <MarkdownContent content={message.content} />
          )}

          {/* reasoning panel */}
          {!isUser && !isHuman && hasReasoning && (
            <div className="mt-3 border-t border-border/40 pt-2">
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Brain className="h-3 w-3" />
                <span>Agent Reasoning</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", showReasoning && "rotate-180")} />
              </button>

              <AnimatePresence>
                {showReasoning && message.agentReasoning && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 rounded-lg bg-muted/50 p-3 text-xs space-y-2">
                      {/* root cause */}
                      {message.agentReasoning.root_cause && (
                        <div>
                          <span className="text-muted-foreground">Root Cause:</span>
                          <p className="mt-0.5 text-foreground">{message.agentReasoning.root_cause}</p>
                        </div>
                      )}

                      {/* assumptions */}
                      {message.agentReasoning.assumptions && message.agentReasoning.assumptions.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">Assumptions:</span>
                          <ul className="mt-0.5 list-disc list-inside text-foreground/80">
                            {message.agentReasoning.assumptions.map((a, i) => (
                              <li key={i}>{a}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* uncertainties */}
                      {message.agentReasoning.uncertainties && message.agentReasoning.uncertainties.length > 0 && (
                        <div>
                          <span className="text-amber-600">Uncertainties:</span>
                          <ul className="mt-0.5 list-disc list-inside text-amber-600/80">
                            {message.agentReasoning.uncertainties.map((u, i) => (
                              <li key={i}>{u}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* tools row - only delivery platform relevant tools */}
          {!isUser && !isHuman && filteredTools.length > 0 && (
            <div className="mt-2">
              <ToolsUsed tools={filteredTools} />
            </div>
          )}

          {!isUser && message.cards && message.cards.length > 0 && (
            <ActionCards cards={message.cards} onAction={onAction} />
          )}
        </div>

        <div
          className={cn(
            "mt-1.5 flex items-center gap-2",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          <span className="text-muted-foreground/50 text-[10px]">
            {formatTime(message.timestamp)}
          </span>

          {/* confidence score hidden - only show copy/feedback actions */}
          {!isUser && <MessageActions content={message.content} />}
        </div>
      </div>
    </motion.div>
  );
});
