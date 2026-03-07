"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

interface ToolsUsedProps {
  tools: string[];
}

// formats tool name with underscores
function formatToolName(tool: string): string {
  return tool.toLowerCase().replace(/[\s-]/g, "_");
}

export const ToolsUsed = memo(function ToolsUsed({ tools }: ToolsUsedProps) {
  if (!tools || tools.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1"
    >
      <span className="text-[10px] text-muted-foreground/60">tools_called</span>
      {tools.map((tool, index) => (
        <motion.span
          key={`${tool}-${index}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: index * 0.05, duration: 0.15 }}
          className="inline-flex items-center gap-0.5"
        >
          <Check className="h-2.5 w-2.5 text-emerald-500/70" />
          <span className="text-[10px] text-muted-foreground/70">
            {formatToolName(tool)}
          </span>
        </motion.span>
      ))}
    </motion.div>
  );
});
