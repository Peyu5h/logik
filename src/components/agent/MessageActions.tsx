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
}

export const MessageActions = memo(function MessageActions({
  content,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  }, [content]);

  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
