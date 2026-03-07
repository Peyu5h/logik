"use client";

import { memo, useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput = memo(function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  disabled,
  placeholder = "Type your message...",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // auto resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "24px";
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading && !disabled) {
        onSubmit();
      }
    }
  };

  const canSubmit = value.trim().length > 0 && !isLoading && !disabled;

  return (
    <div className="border-border/40 bg-background border-t p-3">
      <div
        className={cn(
          "bg-input/20 flex flex-col rounded-xl",
          "ring-1 ring-transparent transition-all duration-200",
          isFocused && "ring-border/50",
        )}
      >
        <div className="px-3 py-3">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            rows={1}
            className={cn(
              "w-full resize-none border-none  text-sm leading-relaxed shadow-none focus-visible:ring-0",
              "placeholder:text-muted-foreground/60",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            style={{ minHeight: "24px", maxHeight: "120px" }}
          />
        </div>

        <div className="flex items-center justify-end px-2 pb-2">
          {isLoading ? (
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled>
              <Loader2 className="h-4 w-4 animate-spin" />
            </Button>
          ) : (
            <motion.div
              initial={false}
              animate={{ scale: canSubmit ? 1 : 0.95 }}
              transition={{ duration: 0.1 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "h-8 w-8 transition-colors",
                  canSubmit
                    ? "text-foreground hover:bg-muted"
                    : "text-muted-foreground/50",
                )}
                onClick={onSubmit}
                disabled={!canSubmit}
              >
                <Send className="h-4 w-4" />
              </Button>
            </motion.div>
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
  );
});
