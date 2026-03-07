"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ScrollText,
  Clock,
  Zap,
  Loader2,
  Truck,
  Package,
  RefreshCw,
  CloudRain,
  FileWarning,
  AlertOctagon,
  CheckCircle2,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import { useLogs, useCreateLog, useClearLogs } from "~/hooks/useLogs";
import useUser from "~/hooks/useUser";
import type { SystemLog } from "~/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface ShipmentState {
  _id: string;
  caseId: number;
  trackingId: string;
  status: string;
  priority: string;
  delay: number;
  value: number;
  riskScore: number;
  slaBreached: boolean;
  rerouted: boolean;
  escalated: boolean;
  initialEta: string | null;
  finalEta: string | null;
  slaDeadline: string | null;
  carrier: { code: string; name: string; reliabilityScore: number } | null;
  warehouse: { code: string; name: string; status: string } | null;
  origin: { city?: string } | null;
  destination: { city?: string } | null;
  agentNotes: string | null;
  updatedAt: string;
}

interface TriggerCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  severity: "low" | "medium" | "high" | "critical";
  issue: string;
}

const TRIGGER_CARDS: TriggerCard[] = [
  {
    id: "late-pickup",
    title: "Late Pickup (+2hrs)",
    description: "Carrier hasn't picked up. Adds 2hr delay. Auto-reassigns carrier if pending.",
    icon: <Clock className="h-4 w-4" />,
    severity: "medium",
    issue: "late_pickup",
  },
  {
    id: "carrier-breakdown",
    title: "Carrier Breakdown",
    description: "Vehicle breakdown. Adds 4hr delay. Emergency carrier reassignment.",
    icon: <Truck className="h-4 w-4" />,
    severity: "critical",
    issue: "carrier_breakdown",
  },
  {
    id: "warehouse-congestion",
    title: "Warehouse Congestion",
    description: "Hub congestion. Adds 3hr delay. Processing time elevated.",
    icon: <Package className="h-4 w-4" />,
    severity: "high",
    issue: "warehouse_congestion",
  },
  {
    id: "weather-disruption",
    title: "Weather Disruption",
    description: "Severe weather on route. Adds 5hr delay.",
    icon: <CloudRain className="h-4 w-4" />,
    severity: "high",
    issue: "weather_disruption",
  },
  {
    id: "customs-hold",
    title: "Customs Hold",
    description: "Shipment held at customs. Adds 6hr delay.",
    icon: <FileWarning className="h-4 w-4" />,
    severity: "high",
    issue: "customs_hold",
  },
  {
    id: "inaccurate-eta",
    title: "Inaccurate ETA",
    description: "ETA calculation off. Adds 1.5hr correction delay.",
    icon: <AlertTriangle className="h-4 w-4" />,
    severity: "medium",
    issue: "inaccurate_ETA",
  },
  {
    id: "sla-breach",
    title: "SLA Breach",
    description: "Force SLA breach. Auto-escalates and sends email notification.",
    icon: <AlertOctagon className="h-4 w-4" />,
    severity: "critical",
    issue: "SLA_BREACH",
  },
  {
    id: "resolve",
    title: "Resolve All Issues",
    description: "Clear all delays, reset risk, resolve incidents. Restore initial ETA.",
    icon: <CheckCircle2 className="h-4 w-4" />,
    severity: "low",
    issue: "resolve",
  },
];

const SEVERITY_COLORS: Record<string, string> = {
  low: "text-emerald-500",
  medium: "text-amber-500",
  high: "text-orange-500",
  critical: "text-red-500",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500",
  picked_up: "bg-blue-500",
  in_transit: "bg-blue-500",
  at_warehouse: "bg-purple-500",
  out_for_delivery: "bg-cyan-500",
  delivered: "bg-emerald-500",
  delayed: "bg-red-500",
  cancelled: "bg-zinc-500",
};

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatDelayHrs(minutes: number): string {
  if (minutes === 0) return "0";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export default function LogsPage() {
  const {
    data: logsData,
    isLoading: isLoadingLogs,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useLogs();
  const createLog = useCreateLog();
  const clearLogs = useClearLogs();

  const { user } = useUser();

  const [localLogs, setLocalLogs] = useState<SystemLog[]>([]);
  const [loadingTriggers, setLoadingTriggers] = useState<Record<string, boolean>>({});
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());
  const loaderRef = useRef<HTMLDivElement>(null);

  // shipment selector state
  const [demoShipments, setDemoShipments] = useState<ShipmentState[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<number>(1);
  const [isLoadingShipments, setIsLoadingShipments] = useState(false);

  const allRemoteLogs: SystemLog[] =
    logsData?.pages?.flatMap((page) => page.logs) ?? [];

  const mergedLogs = [...localLogs, ...allRemoteLogs]
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .filter(
      (log, idx, arr) => arr.findIndex((l) => l.id === log.id) === idx
    );

  // infinite scroll observer
  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // fetch demo shipments
  const fetchShipments = useCallback(async () => {
    setIsLoadingShipments(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/agent/observe`);
      if (res.ok) {
        const data = await res.json();
        const shipments = (data.data?.shipments || []) as ShipmentState[];
        setDemoShipments(shipments);
      }
    } catch {
      // fallback: try individual case ids
      const results: ShipmentState[] = [];
      for (const cid of [1, 2, 3]) {
        try {
          const r = await fetch(`${API_BASE_URL}/api/agent/shipment/${cid}`);
          if (r.ok) {
            const d = await r.json();
            if (d.data) results.push(d.data);
          }
        } catch {
          // skip
        }
      }
      setDemoShipments(results);
    } finally {
      setIsLoadingShipments(false);
    }
  }, []);

  // initial load
  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  // poll shipments every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchShipments();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchShipments]);

  // poll logs every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 3000);
    return () => clearInterval(interval);
  }, [refetch]);

  const selectedShipment = demoShipments.find(
    (s) => s.caseId === selectedCaseId
  );

  const addLocalLog = (log: SystemLog) => {
    setLocalLogs((prev) => [log, ...prev]);
    setNewLogIds((prev) => new Set([...prev, log.id]));
    setTimeout(() => {
      setNewLogIds((prev) => {
        const next = new Set(prev);
        next.delete(log.id);
        return next;
      });
    }, 3000);
  };

  // fires a trigger against the selected shipment
  const triggerSignal = async (card: TriggerCard) => {
    if (!selectedShipment) {
      toast.error("Select a shipment first");
      return;
    }

    setLoadingTriggers((prev) => ({ ...prev, [card.id]: true }));

    const timestamp = new Date().toISOString();
    const logEntry: SystemLog = {
      id: `local-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp,
      event_type: `trigger_${card.issue}`,
      source: "admin_panel",
      severity: card.severity,
      message: `Case ${selectedCaseId}: Triggering ${card.title}...`,
    };
    addLocalLog(logEntry);

    try {
      // fire the trigger endpoint
      const response = await fetch(
        `${API_BASE_URL}/api/triggers/${selectedCaseId}/${card.issue}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      const result = await response.json();

      if (response.ok) {
        const d = result.data || result;
        const changes = d.changes || {};
        const actions = d.actions || {};

        // log the result
        const resultLog: SystemLog = {
          id: `local-result-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          event_type: `trigger_${card.issue}_result`,
          source: "trigger_engine",
          severity: card.severity,
          message: `Case ${selectedCaseId}: ${card.title} processed. Delay: ${changes.delay?.total || 0}min, Risk: ${changes.riskScore?.new || 0}%. ${actions.carrierReassigned ? "Carrier reassigned. " : ""}${actions.emailTriggered ? "Email sent. " : ""}${actions.warehouseRerouted ? "Warehouse rerouted. " : ""}`,
        };
        addLocalLog(resultLog);

        // persist log to backend
        createLog.mutate({
          id: resultLog.id,
          timestamp: resultLog.timestamp,
          event_type: resultLog.event_type,
          source: resultLog.source,
          severity: resultLog.severity,
          message: resultLog.message,
        });

        toast.success(`${card.title} triggered for Case ${selectedCaseId}`);

        // refresh shipments immediately
        fetchShipments();
      } else {
        toast.error(result.error?.[0]?.message || "Trigger failed");

        const errorLog: SystemLog = {
          id: `local-err-${Date.now().toString(36)}`,
          timestamp: new Date().toISOString(),
          event_type: "trigger_error",
          source: "admin_panel",
          severity: "high",
          message: `Case ${selectedCaseId}: ${card.title} FAILED - ${result.error?.[0]?.message || "Unknown error"}`,
        };
        addLocalLog(errorLog);
      }
    } catch (err) {
      toast.error("Failed to connect to server");
      const errorLog: SystemLog = {
        id: `local-err-${Date.now().toString(36)}`,
        timestamp: new Date().toISOString(),
        event_type: "trigger_error",
        source: "admin_panel",
        severity: "critical",
        message: `Case ${selectedCaseId}: ${card.title} connection error`,
      };
      addLocalLog(errorLog);
    } finally {
      setLoadingTriggers((prev) => ({ ...prev, [card.id]: false }));
    }
  };

  const handleClearLogs = () => {
    setLocalLogs([]);
    clearLogs.mutate();
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* left: shipment selector + state */}
      <div className="hidden w-72 flex-col border-r lg:flex overflow-hidden">
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Demo Shipments</h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Select a case to trigger events
          </p>
        </div>

        <div className="shrink-0 border-b">
          {[1, 2, 3].map((cid) => {
            const s = demoShipments.find((sh) => sh.caseId === cid);
            const isActive = selectedCaseId === cid;
            return (
              <button
                key={cid}
                onClick={() => setSelectedCaseId(cid)}
                className={cn(
                  "flex w-full items-start gap-3 border-b last:border-b-0 px-4 py-3 text-left transition-colors",
                  isActive
                    ? "bg-primary/5"
                    : "hover:bg-muted/50"
                )}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold">
                  {cid}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">
                      {s?.trackingId || `SHP-CASE00${cid}`}
                    </span>
                    {s && (
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          STATUS_COLORS[s.status] || "bg-zinc-400"
                        )}
                      />
                    )}
                  </div>
                  {s ? (
                    <>
                      <p className="text-muted-foreground text-[11px] truncate mt-0.5">
                        {s.origin?.city || "?"} → {s.destination?.city || "?"}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] capitalize text-muted-foreground">
                          {s.status.replace(/_/g, " ")}
                        </span>
                        {s.delay > 0 && (
                          <span className="text-[10px] text-red-500 font-medium">
                            +{formatDelayHrs(s.delay)}
                          </span>
                        )}
                        {s.slaBreached && (
                          <span className="text-[10px] text-red-600 font-semibold">
                            SLA!
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-[10px] mt-0.5">
                      Loading...
                    </p>
                  )}
                </div>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 mt-1",
                    isActive ? "text-primary" : "text-muted-foreground/30"
                  )}
                />
              </button>
            );
          })}
        </div>

        {/* selected shipment detail */}
        <ScrollArea className="flex-1">
          {selectedShipment ? (
            <div className="p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                Case {selectedShipment.caseId} State
              </h3>

              <div className="space-y-2 text-xs">
                <Row label="Status" value={selectedShipment.status.replace(/_/g, " ")}
                  color={selectedShipment.status === "delayed" ? "text-red-500" : selectedShipment.status === "delivered" ? "text-emerald-500" : "text-foreground"} />
                <Row label="Priority" value={selectedShipment.priority}
                  color={selectedShipment.priority === "urgent" ? "text-red-500" : selectedShipment.priority === "high" ? "text-orange-500" : "text-foreground"} />
                <Row label="Delay" value={formatDelayHrs(selectedShipment.delay)}
                  color={selectedShipment.delay > 0 ? "text-red-500" : "text-foreground"} />
                <Row label="Risk" value={`${selectedShipment.riskScore}%`}
                  color={selectedShipment.riskScore >= 70 ? "text-red-500" : selectedShipment.riskScore >= 40 ? "text-orange-500" : "text-foreground"} />
                <Row label="Value" value={`INR ${selectedShipment.value?.toLocaleString("en-IN") || "0"}`} />
                <Row label="Carrier" value={selectedShipment.carrier?.code || "unassigned"} />
                <Row label="Warehouse" value={selectedShipment.warehouse?.code || "none"} />
                <Row label="SLA Breach" value={selectedShipment.slaBreached ? "YES" : "No"}
                  color={selectedShipment.slaBreached ? "text-red-600 font-semibold" : "text-emerald-500"} />
                <Row label="Rerouted" value={selectedShipment.rerouted ? "Yes" : "No"}
                  color={selectedShipment.rerouted ? "text-amber-500" : "text-foreground"} />
                <Row label="Escalated" value={selectedShipment.escalated ? "Yes" : "No"}
                  color={selectedShipment.escalated ? "text-red-500" : "text-foreground"} />

                {selectedShipment.initialEta && (
                  <Row label="Initial ETA" value={new Date(selectedShipment.initialEta).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} />
                )}
                {selectedShipment.finalEta && (
                  <Row label="Final ETA" value={new Date(selectedShipment.finalEta).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    color={selectedShipment.delay > 0 ? "text-red-500" : "text-foreground"} />
                )}
                {selectedShipment.slaDeadline && (
                  <Row label="SLA Deadline" value={new Date(selectedShipment.slaDeadline).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} />
                )}
              </div>

              {selectedShipment.agentNotes && (
                <div className="mt-3 rounded-md bg-muted/50 p-2">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase">Agent Notes</span>
                  <p className="text-[11px] text-foreground mt-0.5">{selectedShipment.agentNotes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </ScrollArea>
      </div>

      {/* center: logs panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between border-b px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">System Logs</h1>
            <p className="text-muted-foreground text-sm">
              Event logs and trigger testing for Case {selectedCaseId}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  isLoadingLogs && "animate-spin"
                )}
              />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleClearLogs}>
              Clear
            </Button>
          </div>
        </div>

        {/* table header */}
        <div className="shrink-0 flex items-center gap-2 border-b px-4 py-2 font-mono text-[10px] tracking-wide uppercase text-muted-foreground">
          <span className="w-36">Timestamp</span>
          <span className="w-44">Event</span>
          <span className="flex-1">Details</span>
        </div>

        {/* logs list */}
        <ScrollArea className="flex-1">
          {isLoadingLogs && mergedLogs.length === 0 ? (
            <div className="flex flex-col gap-1 p-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 px-4 py-2"
                >
                  <div className="w-36 h-4 bg-muted rounded animate-pulse" />
                  <div className="w-44 h-4 bg-muted rounded animate-pulse" />
                  <div className="flex-1 h-4 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : mergedLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <ScrollText className="h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground text-sm">
                No logs yet
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                Trigger a signal to see logs here
              </p>
            </div>
          ) : (
            <div>
              {mergedLogs.map((log) => (
                <div
                  key={log.id}
                  className={cn(
                    "group flex items-start gap-4 border-b border-border/30 px-4 py-2 font-mono text-xs transition-colors hover:bg-muted/30",
                    newLogIds.has(log.id) && "bg-primary/5"
                  )}
                >
                  <span className="w-36 shrink-0 text-[11px] text-muted-foreground">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span
                    className={cn(
                      "w-44 shrink-0 text-[11px] font-medium uppercase",
                      SEVERITY_COLORS[log.severity] ||
                        "text-muted-foreground"
                    )}
                  >
                    {log.event_type.replace(/_/g, " ")}
                  </span>
                  <span className="min-w-0 flex-1 text-[11px]">
                    <span className="text-cyan-600 dark:text-cyan-400">
                      [{log.source}]
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {log.message}
                    </span>
                  </span>
                </div>
              ))}
              <div ref={loaderRef} className="py-4 flex justify-center">
                {isFetchingNextPage && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          )}
        </ScrollArea>

        {/* footer */}
        <div className="shrink-0 flex items-center justify-between border-t bg-muted/30 px-4 py-2">
          <span className="text-[10px] text-muted-foreground">
            {mergedLogs.length} log entries
          </span>
          <span className="text-[10px] text-muted-foreground">
            Polling every 3s
          </span>
        </div>
      </div>

      {/* right: trigger cards panel */}
      <div className="hidden w-80 border-l xl:flex flex-col overflow-hidden">
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Triggers</h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Fire events on Case {selectedCaseId}
            {selectedShipment
              ? ` (${selectedShipment.origin?.city || "?"} → ${selectedShipment.destination?.city || "?"})`
              : ""}
          </p>
        </div>

        {/* delay thresholds info */}
        <div className="shrink-0 border-b px-4 py-2 bg-muted/30">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">
            Auto-action thresholds
          </p>
          <div className="space-y-0.5 text-[10px] text-muted-foreground">
            <p>2hrs delay → carrier reassigned</p>
            <p>6hrs delay → email to consumer</p>
            <p>10hrs delay → warehouse reroute + new carrier</p>
            <p>SLA breach → auto-escalate + email</p>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-2 p-3">
            {TRIGGER_CARDS.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex items-start gap-2.5 mb-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    {card.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium leading-tight">
                      {card.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {card.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium uppercase",
                      SEVERITY_COLORS[card.severity] ||
                        "text-muted-foreground"
                    )}
                  >
                    {card.severity}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {card.issue}
                  </span>
                </div>

                <button
                  onClick={() => triggerSignal(card)}
                  disabled={loadingTriggers[card.id] || !selectedShipment}
                  className={cn(
                    "w-full h-8 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 border border-border",
                    card.issue === "resolve"
                      ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30"
                      : card.severity === "critical"
                        ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/30"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                    (loadingTriggers[card.id] || !selectedShipment) &&
                      "opacity-50 cursor-not-allowed"
                  )}
                >
                  {loadingTriggers[card.id] ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Fire on Case {selectedCaseId}
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// helper row component for shipment state display
function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <span className={cn("text-[11px] font-medium capitalize", color || "text-foreground")}>
        {value}
      </span>
    </div>
  );
}
