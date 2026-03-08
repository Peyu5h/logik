"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  ArrowUpRight,
  BarChart3,
  Timer,
  Hash,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
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
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/20",
  },
  {
    key: "reason",
    label: "Reason",
    icon: <TrendingUp className="h-3 w-3" />,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  {
    key: "decide",
    label: "Decide",
    icon: <Crosshair className="h-3 w-3" />,
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20",
  },
  {
    key: "act",
    label: "Act",
    icon: <Zap className="h-3 w-3" />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
  {
    key: "learn",
    label: "Learn",
    icon: <BookOpen className="h-3 w-3" />,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20",
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

function getConfidenceColor(confidence: number | null) {
  if (!confidence) return "text-muted-foreground";
  if (confidence >= 90) return "text-emerald-400";
  if (confidence >= 70) return "text-amber-400";
  return "text-red-400";
}

function getConfidenceBg(confidence: number | null) {
  if (!confidence) return "bg-muted";
  if (confidence >= 90) return "bg-emerald-500";
  if (confidence >= 70) return "bg-amber-500";
  return "bg-red-500";
}

const TRIGGER_MAP: Record<string, { label: string; color: string; bg: string }> = {
  delay: { label: "Delay", color: "text-orange-400", bg: "bg-orange-500/10" },
  congestion: { label: "Congestion", color: "text-amber-400", bg: "bg-amber-500/10" },
  sla_breach: { label: "SLA Breach", color: "text-red-400", bg: "bg-red-500/10" },
  set_in_transit: { label: "In Transit", color: "text-sky-400", bg: "bg-sky-500/10" },
  arrived_warehouse: { label: "Arrived WH", color: "text-violet-400", bg: "bg-violet-500/10" },
  monitoring: { label: "Monitoring", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  reroute: { label: "Reroute", color: "text-cyan-400", bg: "bg-cyan-500/10" },
};

function getTriggerBadge(triggerType: string | null) {
  if (!triggerType) return { label: "General", color: "text-muted-foreground", bg: "bg-muted/50" };
  return TRIGGER_MAP[triggerType] || {
    label: triggerType.replace(/_/g, " "),
    color: "text-muted-foreground",
    bg: "bg-muted/50",
  };
}

// single ooda step in the timeline
function OODAStepCard({
  step,
  content,
  isLast,
}: {
  step: OODAStep;
  content: string | null;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!content) return null;

  const isLong = content.length > 180;
  const displayContent = isLong && !expanded ? content.substring(0, 180) + "..." : content;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
            step.bgColor,
            step.borderColor,
            step.color
          )}
        >
          {step.icon}
        </div>
        {!isLast && <div className="w-px flex-1 bg-border/40 min-h-[12px]" />}
      </div>

      <div className={cn("flex-1 pb-3", isLast && "pb-0")}>
        <span className={cn("text-[10px] font-semibold uppercase tracking-wider", step.color)}>
          {step.label}
        </span>
        <div className={cn(
          "mt-1 rounded-md border px-3 py-2 text-xs leading-relaxed text-muted-foreground/90",
          step.borderColor,
          "bg-muted/20"
        )}>
          {displayContent}
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={cn("ml-1 font-medium hover:underline", step.color)}
            >
              {expanded ? "less" : "more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// single agent execution log entry
function AgentLogEntry({
  log,
  isExpanded,
  onToggle,
}: {
  log: AgentExecutionLog;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const triggerBadge = getTriggerBadge(log.trigger_type);
  const stepsWithContent = OODA_STEPS.filter((s) => log[s.key]);

  return (
    <div
      className={cn(
        "border rounded-lg transition-all duration-150",
        isExpanded ? "bg-card shadow-sm" : "bg-card/40 hover:bg-card/70"
      )}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="shrink-0 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded-md",
              triggerBadge.bg,
              triggerBadge.color
            )}>
              {triggerBadge.label}
            </span>
            {log.shipment_id && (
              <span className="text-[10px] text-muted-foreground/60 font-mono flex items-center gap-1">
                <Package className="h-2.5 w-2.5" />
                {log.shipment_id.substring(0, 8)}
              </span>
            )}
            {log.confidence !== null && log.confidence !== undefined && (
              <span className={cn("text-[10px] font-medium", getConfidenceColor(log.confidence))}>
                {log.confidence}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
            {log.observe?.substring(0, 120) || "Agent execution cycle"}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-3">
          {/* step completion dots */}
          <div className="hidden sm:flex items-center gap-0.5">
            {OODA_STEPS.map((step) => (
              <div
                key={step.key}
                className={cn(
                  "h-1 w-1 rounded-full transition-colors",
                  log[step.key]
                    ? step.color.replace("text-", "bg-")
                    : "bg-muted-foreground/15"
                )}
                title={step.label}
              />
            ))}
          </div>

          <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">
            {formatRelativeTime(log.created_at)}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border/40">
          {/* meta row */}
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
              <Clock className="h-3 w-3" />
              {formatTimestamp(log.created_at)}
            </div>
            {log.duration != null && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                <Timer className="h-3 w-3" />
                {log.duration}ms
              </div>
            )}
            {log.confidence !== null && log.confidence !== undefined && (
              <div className="flex items-center gap-1.5 text-[10px]">
                <div
                  className={cn("h-1.5 rounded-full", getConfidenceBg(log.confidence))}
                  style={{ width: `${Math.max(log.confidence * 0.4, 8)}px` }}
                />
                <span className={getConfidenceColor(log.confidence)}>
                  {log.confidence}%
                </span>
              </div>
            )}
            {log.status && (
              <div className="flex items-center gap-1 text-[10px]">
                {log.status === "completed" ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500/70" />
                ) : (
                  <AlertTriangle className="h-3 w-3 text-amber-500/70" />
                )}
                <span className="capitalize text-muted-foreground/60">{log.status}</span>
              </div>
            )}
            {log.session_id && (
              <span className="text-[10px] text-muted-foreground/40 font-mono flex items-center gap-1">
                <Hash className="h-2.5 w-2.5" />
                {log.session_id.substring(0, 12)}
              </span>
            )}
          </div>

          {/* ooda timeline */}
          <div className="space-y-0">
            {stepsWithContent.map((step, idx) => (
              <OODAStepCard
                key={step.key}
                step={step}
                content={log[step.key]}
                isLast={idx === stepsWithContent.length - 1}
              />
            ))}
          </div>

          {/* metadata */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="mt-3 rounded-md border border-border/30 bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-1">
                Metadata
              </p>
              <pre className="text-[10px] text-muted-foreground/60 whitespace-pre-wrap font-mono leading-relaxed">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentExecutionsPage() {
  const [logs, setLogs] = useState<AgentExecutionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [triggerFilter, setTriggerFilter] = useState("all");

  const fetchLogs = useCallback(async (pageNum: number, append = false) => {
    setIsLoading(true);
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
    }
  }, [triggerFilter]);

  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [fetchLogs]);

  useEffect(() => {
    const interval = setInterval(() => fetchLogs(1), 10000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

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

  const avgConfidence = useMemo(() => {
    const withConf = logs.filter((l) => l.confidence);
    if (withConf.length === 0) return 0;
    return Math.round(withConf.reduce((sum, l) => sum + (l.confidence || 0), 0) / withConf.length);
  }, [logs]);

  const completedCount = useMemo(() => logs.filter((l) => l.status === "completed").length, [logs]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* header */}
      <div className="shrink-0 flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Agent Executions</h1>
          <p className="text-muted-foreground/60 text-xs mt-0.5">
            Decision loop trace logs
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={expandAll}
            className="text-[11px] h-7 text-muted-foreground hover:text-foreground"
          >
            Expand All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={collapseAll}
            className="text-[11px] h-7 text-muted-foreground hover:text-foreground"
          >
            Collapse All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchLogs(1)}
            className="gap-1.5 h-7 text-xs"
          >
            <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* stats */}
      <div className="shrink-0 grid grid-cols-4 border-b divide-x divide-border/40">
        <div className="px-5 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
            Total
          </p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-semibold tabular-nums">{total}</span>
            <BarChart3 className="h-3 w-3 text-muted-foreground/30" />
          </div>
        </div>
        <div className="px-5 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
            Completed
          </p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-semibold tabular-nums text-emerald-400">
              {completedCount}
            </span>
            <CheckCircle2 className="h-3 w-3 text-emerald-500/30" />
          </div>
        </div>
        <div className="px-5 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
            Avg Confidence
          </p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className={cn("text-xl font-semibold tabular-nums", getConfidenceColor(avgConfidence))}>
              {avgConfidence}%
            </span>
            <Activity className="h-3 w-3 text-muted-foreground/30" />
          </div>
        </div>
        <div className="px-5 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
            Showing
          </p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-semibold tabular-nums">{filteredLogs.length}</span>
            <ArrowUpRight className="h-3 w-3 text-muted-foreground/30" />
          </div>
        </div>
      </div>

      {/* search + filter */}
      <div className="shrink-0 flex items-center gap-3 border-b px-5 py-2.5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
          <Input
            placeholder="Search logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-8 text-xs bg-transparent border-border/40"
          />
        </div>
        <div className="flex items-center gap-0.5">
          {triggerTypes.map((t) => (
            <button
              key={t.value}
              onClick={() => setTriggerFilter(t.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150",
                triggerFilter === t.value
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* log entries */}
      <ScrollArea className="flex-1">
        {isLoading && logs.length === 0 ? (
          <div className="flex flex-col gap-2 p-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
              <Activity className="h-5 w-5 text-muted-foreground/30" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground/60">No execution logs</p>
            <p className="mt-0.5 text-xs text-muted-foreground/40">
              Logs appear when the agent processes triggers
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 p-4">
            {filteredLogs.map((log) => (
              <AgentLogEntry
                key={log._id}
                log={log}
                isExpanded={expandedIds.has(log._id)}
                onToggle={() => toggleExpand(log._id)}
              />
            ))}

            {hasMore && (
              <div className="flex justify-center pt-3 pb-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next = page + 1;
                    setPage(next);
                    fetchLogs(next, true);
                  }}
                  disabled={isLoading}
                  className="gap-1.5 text-xs text-muted-foreground"
                >
                  {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* footer */}
      <div className="shrink-0 flex items-center justify-between border-t px-5 py-2 bg-muted/10">
        <span className="text-[10px] text-muted-foreground/40">
          {filteredLogs.length} of {total} logs
        </span>
        <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-emerald-500/50 animate-pulse" />
          Live · 10s
        </span>
      </div>
    </div>
  );
}
