"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import type { AgentExecutionLog } from "~/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const OODA_KEYS = ["observe", "reason", "decide", "act", "learn"] as const;

const OODA_LABELS: Record<string, string> = {
  observe: "Observe",
  reason: "Reason",
  decide: "Decide",
  act: "Act",
  learn: "Learn",
};

const TRIGGER_LABELS: Record<string, string> = {
  delay: "Delay",
  congestion: "Congestion",
  sla_breach: "SLA Breach",
  set_in_transit: "In Transit",
  arrived_warehouse: "Arrived WH",
  monitoring: "Monitoring",
  reroute: "Reroute",
};

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "-";
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
  if (isNaN(d.getTime())) return "-";
  const diff = Date.now() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function getTriggerLabel(t: string | null) {
  if (!t) return "General";
  return TRIGGER_LABELS[t] || t.replace(/_/g, " ");
}

function statusText(s: string) {
  if (s === "completed") return "completed";
  if (s === "failed") return "failed";
  return "pending";
}

// single log entry rendered as a vertical card on the timeline
function LogEntry({
  log,
  isExpanded,
  onToggle,
}: {
  log: AgentExecutionLog;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const stepsWithContent = OODA_KEYS.filter((k) => log[k]);

  return (
    <div className="relative pl-6">
      {/* timeline dot */}
      <div
        className={cn(
          "absolute left-0 top-3 h-2.5 w-2.5 rounded-full border-2 z-10",
          log.status === "completed"
            ? "bg-emerald-500 border-emerald-500/50"
            : log.status === "failed"
              ? "bg-red-500 border-red-500/50"
              : "bg-amber-500 border-amber-500/50"
        )}
      />

      <button
        onClick={onToggle}
        className={cn(
          "w-full text-left rounded-lg border px-4 py-3 transition-colors",
          isExpanded
            ? "bg-card border-border/60"
            : "bg-card/40 border-border/30 hover:bg-card/70 hover:border-border/50"
        )}
      >
        {/* top row: trigger + status + time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {getTriggerLabel(log.trigger_type)}
            </span>
            {log.shipment_id && (
              <span className="text-[10px] text-muted-foreground/50 font-mono">
                {log.shipment_id.substring(0, 8)}
              </span>
            )}
            <span
              className={cn(
                "text-[10px]",
                log.status === "completed"
                  ? "text-emerald-500"
                  : log.status === "failed"
                    ? "text-red-500"
                    : "text-amber-500"
              )}
            >
              {statusText(log.status)}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {log.duration != null && (
              <span className="text-[10px] text-muted-foreground/40">
                {log.duration}ms
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/50">
              {formatRelativeTime(log.created_at)}
            </span>
          </div>
        </div>

        {/* preview line */}
        <p className="text-xs text-muted-foreground/60 mt-1.5 line-clamp-2 leading-relaxed">
          {log.observe?.substring(0, 180) || "Agent execution cycle"}
        </p>

        {/* step indicators when collapsed */}
        {!isExpanded && stepsWithContent.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2">
            {OODA_KEYS.map((k) => (
              <div
                key={k}
                className={cn(
                  "h-1 rounded-full",
                  log[k] ? "w-5 bg-muted-foreground/30" : "w-2 bg-muted-foreground/10"
                )}
              />
            ))}
            <span className="text-[9px] text-muted-foreground/30 ml-1">
              {stepsWithContent.length}/{OODA_KEYS.length}
            </span>
          </div>
        )}
      </button>

      {/* expanded content */}
      {isExpanded && (
        <div className="mt-0 rounded-b-lg border border-t-0 border-border/40 bg-card px-4 pb-4">
          {/* meta */}
          <div className="flex items-center gap-3 flex-wrap py-3 border-b border-border/20 text-[10px] text-muted-foreground/50">
            <span>{formatTimestamp(log.created_at)}</span>
            {log.duration != null && <span>{log.duration}ms</span>}
            {log.session_id && (
              <span className="font-mono">{log.session_id.substring(0, 16)}</span>
            )}
          </div>

          {/* ooda steps as vertical list */}
          <div className="mt-3 space-y-3">
            {OODA_KEYS.map((key) => {
              const content = log[key];
              if (!content) return null;
              return (
                <div key={key}>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-1">
                    {OODA_LABELS[key]}
                  </p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap">
                    {content}
                  </p>
                </div>
              );
            })}
          </div>

          {/* metadata */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="mt-3 rounded border border-border/20 bg-muted/10 px-3 py-2">
              <p className="text-[9px] font-medium text-muted-foreground/40 uppercase tracking-wider mb-1">
                metadata
              </p>
              <pre className="text-[10px] text-muted-foreground/50 whitespace-pre-wrap font-mono leading-relaxed">
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
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [triggerFilter, setTriggerFilter] = useState("all");
  const loaderRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(
    async (pageNum: number, append = false) => {
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
    },
    [triggerFilter]
  );

  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [fetchLogs]);

  // auto refresh
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
    return logs.filter(
      (log) =>
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

  const completedCount = useMemo(
    () => logs.filter((l) => l.status === "completed").length,
    [logs]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* header */}
      <div className="shrink-0 flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Agent Logs</h1>
          <p className="text-muted-foreground/50 text-[11px]">
            {total} total, {completedCount} completed
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={expandAll}
            className="text-[11px] h-7 text-muted-foreground/60 hover:text-foreground"
          >
            Expand
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={collapseAll}
            className="text-[11px] h-7 text-muted-foreground/60 hover:text-foreground"
          >
            Collapse
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPage(1);
              fetchLogs(1);
            }}
            className="h-7 text-[11px] border-border/40"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* filters */}
      <div className="shrink-0 flex items-center gap-3 border-b border-border/30 px-5 py-2.5">
        <Input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 max-w-xs text-xs bg-transparent border-border/30 focus:border-border/60"
        />
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

      {/* timeline list */}
      <ScrollArea className="flex-1">
        {isLoading && logs.length === 0 ? (
          <div className="flex flex-col gap-3 p-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <p className="text-sm text-muted-foreground/50">No logs yet</p>
            <p className="mt-1 text-[11px] text-muted-foreground/30">
              Logs appear when the agent processes triggers
            </p>
          </div>
        ) : (
          <div className="relative px-5 py-4">
            {/* vertical timeline line */}
            <div className="absolute left-[31px] top-4 bottom-4 w-px bg-border/40" />

            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <LogEntry
                  key={log._id}
                  log={log}
                  isExpanded={expandedIds.has(log._id)}
                  onToggle={() => toggleExpand(log._id)}
                />
              ))}
            </div>

            {/* infinite scroll sentinel */}
            <div ref={loaderRef} className="h-8 flex items-center justify-center mt-2">
              {isFetchingMore && (
                <span className="text-[10px] text-muted-foreground/30">loading...</span>
              )}
            </div>
          </div>
        )}
      </ScrollArea>

      {/* footer */}
      <div className="shrink-0 flex items-center justify-between border-t border-border/30 px-5 py-2 bg-muted/5">
        <span className="text-[10px] text-muted-foreground/30">
          {filteredLogs.length} of {total}
        </span>
        <span className="text-[10px] text-muted-foreground/30">
          auto-refresh 10s
        </span>
      </div>
    </div>
  );
}
