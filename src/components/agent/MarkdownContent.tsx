"use client";

import { memo, useMemo } from "react";
import { cn } from "~/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

// parses and renders simple markdown
export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
}: MarkdownContentProps) {
  const rendered = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className={cn("text-sm leading-relaxed", className)}>
      {rendered}
    </div>
  );
});

// parses markdown content into react elements
function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: { type: "ul" | "ol"; items: React.ReactNode[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === "ul") {
        elements.push(
          <ul key={key++} className="my-2 ml-4 list-disc space-y-1">
            {currentList.items.map((item, i) => (
              <li key={i} className="text-sm">{item}</li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={key++} className="my-2 ml-4 list-decimal space-y-1">
            {currentList.items.map((item, i) => (
              <li key={i} className="text-sm">{item}</li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // numbered list (1. item)
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      if (currentList?.type !== "ol") {
        flushList();
        currentList = { type: "ol", items: [] };
      }
      currentList.items.push(parseInline(numberedMatch[1]));
      continue;
    }

    // bullet list (- item or * item)
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      if (currentList?.type !== "ul") {
        flushList();
        currentList = { type: "ul", items: [] };
      }
      currentList.items.push(parseInline(bulletMatch[1]));
      continue;
    }

    // not a list item, flush any pending list
    flushList();

    // empty line
    if (line.trim() === "") {
      elements.push(<div key={key++} className="h-2" />);
      continue;
    }

    // heading (### text)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = parseInline(headingMatch[2]);
      if (level === 1) {
        elements.push(
          <h3 key={key++} className="text-base font-semibold mt-3 mb-1">
            {headingText}
          </h3>
        );
      } else if (level === 2) {
        elements.push(
          <h4 key={key++} className="text-sm font-semibold mt-2 mb-1">
            {headingText}
          </h4>
        );
      } else {
        elements.push(
          <h5 key={key++} className="text-sm font-medium mt-2 mb-1">
            {headingText}
          </h5>
        );
      }
      continue;
    }

    // regular paragraph
    elements.push(
      <p key={key++} className="my-1">
        {parseInline(line)}
      </p>
    );
  }

  // flush any remaining list
  flushList();

  return elements;
}

// parses inline markdown (bold, italic, code, links)
function parseInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // bold with ** or __
    let match = remaining.match(/^([\s\S]*?)\*\*(.+?)\*\*([\s\S]*)/);
    if (!match) {
      match = remaining.match(/^([\s\S]*?)__(.+?)__([\s\S]*)/);
    }
    if (match) {
      if (match[1]) {
        parts.push(<span key={key++}>{match[1]}</span>);
      }
      parts.push(
        <strong key={key++} className="font-semibold">
          {match[2]}
        </strong>
      );
      remaining = match[3];
      continue;
    }

    // inline code with `
    match = remaining.match(/^([\s\S]*?)`(.+?)`([\s\S]*)/);
    if (match) {
      if (match[1]) {
        parts.push(<span key={key++}>{match[1]}</span>);
      }
      parts.push(
        <code
          key={key++}
          className="bg-muted px-1 py-0.5 rounded text-xs font-mono"
        >
          {match[2]}
        </code>
      );
      remaining = match[3];
      continue;
    }

    // link [text](url)
    match = remaining.match(/^([\s\S]*?)\[(.+?)\]\((.+?)\)([\s\S]*)/);
    if (match) {
      if (match[1]) {
        parts.push(<span key={key++}>{match[1]}</span>);
      }
      parts.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {match[2]}
        </a>
      );
      remaining = match[4];
      continue;
    }

    // no more matches, add remaining text
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
