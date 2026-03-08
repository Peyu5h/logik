"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Eye,
  Crosshair,
  TrendingUp,
  Zap,
  BookOpen,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Clock,
  Activity,
  Search,
  CheckCircle2,
  AlertTriangle,
  Package,
  Timer,
  Hash,
  Filter,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentExecutionLog } from "~/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface OODAStep {
  key: "observe" | "reason" | "decide" | "act" | "learn";
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

const OODA_STEPS: OODAStep[] = [
  {
    key: "observe",
    label: "Observe",
    icon: <Eye className="h-3 w-3" />,
    color: "text-sky-400",
    bgColor: "bg-sky-500/8",
    borderColor: "border-sky-500/15",
  },
  {
    key: "reason",
    label: "Reason",
    icon: <TrendingUp className="h-3 w-3" />,
    color: "text-amber-400",
    bgColor: "bg-amber-500/8",
    borderColor: "border-amber-500/15",
  },
  {
    key: "decide",
    label: "Decide",
    icon: <Crosshair className="h-3 w-3" />,
    color: "text-violet-400",
    bgColor: "bg-violet-500/8",
    borderColor: "border-violet-500/15",
  },
  {
    key: "act",
    label: "Act",
    icon: <Zap className="h-3 w-3" />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/8",
    borderColor: "border-emerald-500/15",
  },
  {
    key: "learn",
    label: "Learn",
    icon: <BookOpen className="h-3 w-3" />,
    color: "text-rose-400",
    bgColor: "bg-rose-500/8",
    borderColor: "border-rose-500/15",
  },
];

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatRelativeTime(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function getStatusColor(status: string) {
  if (status === "completed") return "text-emerald-400";
  if (status === "failed") return "text-red-400";
  return "text-amber-400";
}

function getStatusDot(status: string) {
  if (status === "completed") return "bg-emerald-500";
  if (status === "failed") return "bg-red-500";
  return "bg-amber-500";
}

const TRIGGER_MAP: Record<string, { label: string; color: string; bg: string; border: string }> = {
  delay: { label: "Delay", color: "text-orange-300", bg: "bg-orange-500/8", border: "border-orange-500/20" },
  congestion: { label: "Congestion", color: "text-amber-300", bg: "bg-amber-500/8", border: "border-amber-500/20" },
  sla_breach: { label: "SLA Breach", color: "text-red-300", bg: "bg-red-500/8", border: "border-red-500/20" },
  set_in_transit: { label: "In Transit", color: "text-sky-300", bg: "bg-sky-500/8", border: "border-sky-500/20" },
  arrived_warehouse: { label: "Arrived WH", color: "text-violet-300", bg: "bg-violet-500/8", border: "border-violet-500/20" },
  monitoring: { label: "Monitoring", color: "text-emerald-300", bg: "bg-emerald-500/8", border: "border-emerald-500/20" },
  reroute: { label: "Reroute", color: "text-cyan-300", bg: "bg-cyan-500/8", border: "border-cyan-500/20" },
};

function getTriggerInfo(triggerType: string | null) {
  if (!triggerType) return { label: "General", color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border/30" };
  return TRIGGER_MAP[triggerType] || {
    label: triggerType.replace(/_/g, " "),
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    border: "border-border/30",
  };
}

// horizontal ooda step cards
function OODAStepPill({
  step,
  content,
}: {
  step: OODAStep;
  content: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!content) return null;

  const preview = content.length > 120 ? content.substring(0, 120) + "..." : content;

  return (
    <div className={cn("min-w-[220px] max-w-[320px] shrink-0 rounded-lg border p-3", step.borderColor, step.bgColor)}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className={cn("flex h-5 w-5 items-center justify-center rounded", step.color)}>
          {step.icon}
        </div>
        <span className={cn("text-[10px] font-semibold uppercase tracking-wider", step.color)}>
          {step.label}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        {expanded ? content : preview}
      </p>
      {content.length > 120 && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className={cn("mt-1 text-[10px] font-medium", step.color, "hover:underline")}
        >
          {expanded ? "show less" : "show more"}
        </button>
      )}
    </div>
  );
}

// vertical ooda timeline for expanded view
function OODATimeline({ log }: { log: AgentExecutionLog }) {
  const stepsWithContent = OODA_STEPS.filter((s) => log[s.key]);
  if (stepsWithContent.length === 0) return null;

  return (
    <div className="space-y-0">
      {stepsWithContent.map((step, idx) => {
        const content = log[step.key];
        if (!content) return null;
        const isLast = idx === stepsWithContent.length - 1;
        return <OODATimelineStep key={step.key} step={step} content={content} isLast={isLast} />;
      })}
    </div>
  );
}

function OODATimelineStep({
  step,
  content,
  isLast,
}: {
  step: OODAStep;
  content: string;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 200;
  const displayContent = isLong && !expanded ? content.substring(0, 200) + "..." : content;

  return (
    <div className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
            step.bgColor, step.borderColor, step.color
          )}
        >
          {step.icon}
        </div>
        {!isLast && <div className="w-px flex-1 bg-border/30 min-h-2" />}
      </div>
      <div className={cn("flex-1 pb-2.5", isLast && "pb-0")}>
        <span className={cn("text-[10px] font-semibold uppercase tracking-wider", step.color)}>
          {step.label}
        </span>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/80">
          {displayContent}
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={cn("ml-1 font-medium hover:underline", step.color)}
            >
              {expanded ? "less" : "more"}
            </button>
          )}
        </p>
      </div>
    </div>
  );
}

// single log card
function LogCard({
  log,
  isExpanded,
  onToggle,
}: {
  log: AgentExecutionLog;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const trigger = getTriggerInfo(log.trigger_type);
  const stepsWithContent = OODA_STEPS.filter((s) => log[s.key]);
  const stepCount = stepsWithContent.length;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "rounded-xl border transition-colors duration-150",
        isExpanded
          ? "bg-card border-border/60"
          : "bg-card/50 border-border/30 hover:border-border/50 hover:bg-card/70"
      )}
    >
      {/* header */}
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start gap-3 px-4 py-3">
          {/* status dot */}
          <div className="mt-1.5 shrink-0">
            <div className={cn("h-2 w-2 rounded-full", getStatusDot(log.status))} />
          </div>

          {/* main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                trigger.bg, trigger.color, trigger.border
              )}>
                {trigger.label}
              </span>

              {log.shipment_id && (
                <span className="text-[10px] text-muted-foreground/50 font-mono flex items-center gap-0.5">
                  <Package className="h-2.5 w-2.5" />
                  {log.shipment_id.substring(0, 8)}
                </span>
              )}

              <span className={cn("text-[10px] capitalize", getStatusColor(log.status))}>
                {log.status}
              </span>
            </div>

            <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2 leading-relaxed">
              {log.observe?.substring(0, 160) || "Agent execution cycle"}
            </p>

            {/* horizontal step pills preview (collapsed only) */}
            {!isExpanded && stepCount > 0 && (
              <div className="flex items-center gap-1 mt-2">
                {OODA_STEPS.map((step) => (
                  <div
                    key={step.key}
                    className={cn(
                      "h-1 rounded-full transition-colors",
                      log[step.key] ? "w-5" : "w-2",
                      log[step.key]
                        ? step.color.replace("text-", "bg-").replace("400", "500/50")
                        : "bg-muted-foreground/10"
                    )}
                  />
                ))}
                <span className="text-[9px] text-muted-foreground/40 ml-1">
                  {stepCount}/{OODA_STEPS.length} steps
                </span>
              </div>
            )}
          </div>

          {/* right side meta */}
          <div className="shrink-0 flex flex-col items-end gap-1">
            <span className="text-[10px] text-muted-foreground/40">
              {formatRelativeTime(log.created_at)}
            </span>
            {log.duration != null && (
              <span className="text-[10px] text-muted-foreground/30 flex items-center gap-0.5">
                <Timer className="h-2.5 w-2.5" />
                {log.duration}ms
              </span>
            )}
            <div className="text-muted-foreground/40">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </div>
          </div>
        </div>
      </button>

      {/* expanded detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border/30">
              {/* meta chips */}
              <div className="flex items-center gap-3 flex-wrap py-3">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                  <Clock className="h-3 w-3" />
                  {formatTimestamp(log.created_at)}
                </div>
                {log.duration != null && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                    <Timer className="h-3 w-3" />
                    {log.duration}ms
                  </div>
                )}
                {log.status && (
                  <div className="flex items-center gap-1 text-[10px]">
                    {log.status === "completed" ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500/60" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-amber-500/60" />
                    )}
                    <span className={cn("capitalize", getStatusColor(log.status))}>{log.status}</span>
                  </div>
                )}
                {log.session_id && (
                  <span className="text-[10px] text-muted-foreground/30 font-mono flex items-center gap-0.5">
                    <Hash className="h-2.5 w-2.5" />
                    {log.session_id.substring(0, 12)}
                  </span>
                )}
              </div>

              {/* horizontal ooda step cards */}
              {stepsWithContent.length > 0 && (
                <div className="overflow-x-auto pb-2 -mx-1">
                  <div className="flex gap-2 px-1">
                    {stepsWithContent.map((step) => (
                      <OODAStepPill key={step.key} step={step} content={log[step.key]} />
                    ))}
                  </div>
                </div>
              )}

              {/* metadata */}
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <div className="mt-3 rounded-lg border border-border/20 bg-muted/10 px-3 py-2">
                  <p className="text-[9px] font-medium text-muted-foreground/40 uppercase tracking-wider mb-1">
                    Metadata
                  </p>
                  <pre className="text-[10px] text-muted-foreground/50 whitespace-pre-wrap font-mono leading-relaxed">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AgentExecutionsPage() {
  const [logs, setLogs] = useState<AgentExecutionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [triggerFilter, setTriggerFilter] = useState("all");
  const loaderRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async (pageNum: number, append = false) => {
    if (append) {
      setIsFetchingMore(true);
    } else {
      setIsLoading(true);
    }
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        limit: "30",
      });
      if (triggerFilter !== "all") params.set("trigger_type", triggerFilter);

      const res = await fetch(`${API_BASE_URL}/api/admin/agent-logs?${params}`);
      const data = await res.json();

      if (res.ok && data.data) {
        const fetched = data.data.logs || [];
        setLogs((prev) => (append ? [...prev, ...fetched] : fetched));
        setTotal(data.data.total || 0);
        setHasMore(data.data.hasMore || false);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
      setIsFetchingMore(false);
    }
  }, [triggerFilter]);

  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [fetchLogs]);

  // polling
  useEffect(() => {
    const interval = setInterval(() => fetchLogs(1), 10000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  // infinite scroll
  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingMore && !isLoading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchLogs(nextPage, true);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, isLoading, page, fetchLogs]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredLogs = useMemo(() => {
    if (!search) return logs;
    const q = search.toLowerCase();
    return logs.filter((log) =>
      log.observe?.toLowerCase().includes(q) ||
      log.reason?.toLowerCase().includes(q) ||
      log.decide?.toLowerCase().includes(q) ||
      log.act?.toLowerCase().includes(q) ||
      log.learn?.toLowerCase().includes(q) ||
      log.trigger_type?.toLowerCase().includes(q) ||
      log.shipment_id?.toLowerCase().includes(q)
    );
  }, [logs, search]);

  const expandAll = () => setExpandedIds(new Set(filteredLogs.map((l) => l._id)));
  const collapseAll = () => setExpandedIds(new Set());

  const triggerTypes = [
    { value: "all", label: "All" },
    { value: "delay", label: "Delay" },
    { value: "congestion", label: "Congestion" },
    { value: "sla_breach", label: "SLA" },
    { value: "monitoring", label: "Monitoring" },
    { value: "reroute", label: "Reroute" },
  ];

  const completedCount = useMemo(() => logs.filter((l) => l.status === "completed").length, [logs]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* header */}
      <div className="shrink-0 flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">Agent Executions</h1>
            <p className="text-muted-foreground/50 text-[11px]">
              {total} total · {completedCount} completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={expandAll}
            className="text-[11px] h-7 text-muted-foreground/60 hover:text-foreground"
          >
            Expand All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={collapseAll}
            className="text-[11px] h-7 text-muted-foreground/60 hover:text-foreground"
          >
            Collapse All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setPage(1); fetchLogs(1); }}
            className="gap-1.5 h-7 text-[11px] border-border/40"
          >
            <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* search + filters */}
      <div className="shrink-0 flex items-center gap-3 border-b border-border/30 px-5 py-2.5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/30" />
          <Input
            placeholder="Search executions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-8 text-xs bg-transparent border-border/30 focus:border-border/60"
          />
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-muted/20 p-0.5">
          {triggerTypes.map((t) => (
            <button
              key={t.value}
              onClick={() => setTriggerFilter(t.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150",
                triggerFilter === t.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground/50 hover:text-muted-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* log list */}
      <ScrollArea className="flex-1">
        {isLoading && logs.length === 0 ? (
          <div className="flex flex-col gap-2 p-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="h-12 w-12 rounded-xl bg-muted/30 flex items-center justify-center">
              <Activity className="h-5 w-5 text-muted-foreground/20" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground/50">No execution logs</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/30">
              Logs appear when the agent processes triggers
            </p>
          </div>
        ) : (
          <div className="space-y-2 p-4">
            {filteredLogs.map((log) => (
              <LogCard
                key={log._id}
                log={log}
                isExpanded={expandedIds.has(log._id)}
                onToggle={() => toggleExpand(log._id)}
              />
            ))}

            {/* infinite scroll sentinel */}
            <div ref={loaderRef} className="h-8 flex items-center justify-center">
              {isFetchingMore && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/30" />
              )}
            </div>
          </div>
        )}
      </ScrollArea>

      {/* footer */}
      <div className="shrink-0 flex items-center justify-between border-t border-border/30 px-5 py-2 bg-muted/5">
        <span className="text-[10px] text-muted-foreground/30">
          {filteredLogs.length} of {total} executions
        </span>
        <span className="text-[10px] text-muted-foreground/30 flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400/40" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500/60" />
          </span>
          Auto-refresh · 10s
        </span>
      </div>
    </div>
  );
}
