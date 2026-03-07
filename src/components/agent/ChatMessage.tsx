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
import { UserCircle, ChevronDown, Brain, AlertTriangle, CheckCircle2, HelpCircle, GitBranch, FileText, Zap } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageType;
  onAction: (card: ActionCard) => void;
}

// issue type badge colors (dimmed for dark background)
const issueTypeConfig = {
  migration_issue: { label: "Migration Issue", className: "bg-blue-500/5 text-blue-400/80" },
  platform_bug: { label: "Platform Bug", className: "bg-red-500/5 text-red-400/70" },
  documentation_gap: { label: "Docs Gap", className: "bg-amber-500/5 text-amber-400/70" },
  merchant_config: { label: "Config Error", className: "bg-purple-500/5 text-purple-400/70" },
  unknown: { label: "Unknown", className: "bg-muted/50 text-muted-foreground/70" },
};



// actions taken config (dimmed colors)
// only show auto-executed actions (github_issue), not user-triggered ones (update_docs)
const autoExecutedActions = ["github_issue", "create_github_issue"];

const actionsTakenConfig: Record<string, { icon: typeof GitBranch; label: string; className: string }> = {
  github_issue: { icon: GitBranch, label: "GitHub Issue Created", className: "bg-purple-500/5 text-purple-400/70" },
  create_github_issue: { icon: GitBranch, label: "GitHub Issue Created", className: "bg-purple-500/5 text-purple-400/70" },
};

// actions taken display - only shows auto-executed actions
function ActionsTaken({ actions }: { actions: string[] }) {
  // filter to only show auto-executed actions
  const visibleActions = actions?.filter((a) => autoExecutedActions.includes(a)) || [];
  if (visibleActions.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {visibleActions.map((action, i) => {
        const config = actionsTakenConfig[action] || { icon: Zap, label: action, className: "bg-muted/50 text-muted-foreground/70" };
        const Icon = config.icon;
        return (
          <span
            key={i}
            className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium", config.className)}
          >
            <Icon className="h-3 w-3" />
            {config.label}
          </span>
        );
      })}
    </div>
  );
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
                      {/* issue type */}
                      {message.agentReasoning.issue_type && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Type:</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium",
                            issueTypeConfig[message.agentReasoning.issue_type]?.className || issueTypeConfig.unknown.className
                          )}>
                            {issueTypeConfig[message.agentReasoning.issue_type]?.label || "Unknown"}
                          </span>
                        </div>
                      )}

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

          {/* actions taken (only auto-executed like github_issue) */}
          {!isUser && !isHuman && message.actionsTaken && message.actionsTaken.length > 0 && (
            <div className="mt-2">
              <ActionsTaken actions={message.actionsTaken} />
            </div>
          )}

          {/* tools row */}
          {!isUser && !isHuman && message.toolsUsed && message.toolsUsed.length > 0 && (
            <div className="mt-2">
              <ToolsUsed tools={message.toolsUsed} />
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

          {!isUser && <MessageActions content={message.content} confidenceScore={message.confidenceScore} />}
        </div>
      </div>
    </motion.div>
  );
});
