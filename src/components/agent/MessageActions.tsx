"use client";

import { memo, useState, useCallback } from "react";
import { Copy, ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

interface MessageActionsProps {
  content: string;
  confidenceScore?: number;
}

export const MessageActions = memo(function MessageActions({
  content,
  confidenceScore,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  }, [content]);

  // confidence level helper
  const getConfidenceInfo = (score: number) => {
    if (score >= 8) return { label: "High", color: "text-emerald-500" };
    if (score >= 5) return { label: "Medium", color: "text-amber-500" };
    return { label: "Low", color: "text-red-500" };
  };

  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      {/* confidence score indicator */}
      {confidenceScore && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted/50 cursor-default",
                getConfidenceInfo(confidenceScore).color
              )}>
                {confidenceScore}/10
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              Confidence: {getConfidenceInfo(confidenceScore).label} ({confidenceScore}/10)
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                copied ? "text-primary" : "text-muted-foreground",
              )}
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{copied ? "Copied!" : "Copy"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                feedback === "like"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() =>
                setFeedback((prev) => (prev === "like" ? null : "like"))
              }
            >
              <ThumbsUp
                className={cn("h-3 w-3", feedback === "like" && "fill-current")}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Good response</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7",
                feedback === "dislike"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() =>
                setFeedback((prev) => (prev === "dislike" ? null : "dislike"))
              }
            >
              <ThumbsDown
                className={cn(
                  "h-3 w-3",
                  feedback === "dislike" && "fill-current",
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Bad response</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
});
