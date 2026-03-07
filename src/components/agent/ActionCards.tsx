"use client";

import { memo } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import type { ActionCard } from "./types";

interface ActionCardsProps {
  cards: ActionCard[];
  onAction: (card: ActionCard) => void;
}

// action cards renderer
export const ActionCards = memo(function ActionCards({
  cards,
  onAction,
}: ActionCardsProps) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {cards.map((card) => {
        if (card.type === "link" && card.url) {
          return (
            <Button
              key={card.id}
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              asChild
            >
              <a href={card.url} target="_blank" rel="noopener noreferrer">
                {card.label}
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          );
        }

        return (
          <Button
            key={card.id}
            variant="outline"
            size="sm"
            className={cn(
              "h-8 text-xs",
              card.style === "primary" &&
                "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary",
              card.style === "destructive" &&
                "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:border-destructive",
              !card.style || card.style === "secondary"
                ? "border-border"
                : ""
            )}
            onClick={() => onAction(card)}
          >
            {card.label}
          </Button>
        );
      })}
    </div>
  );
});
