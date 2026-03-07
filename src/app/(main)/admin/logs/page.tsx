"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ScrollText,
  Clock,
  Zap,
  Loader2,
  Truck,
  RefreshCw,
  AlertOctagon,
  CheckCircle2,
  ArrowRight,
  Play,
  Warehouse,
  RotateCcw,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import { useLogs, useCreateLog, useClearLogs } from "~/hooks/useLogs";
import useUser from "~/hooks/useUser";
import type { SystemLog } from "~/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface RouteWaypoint {
  warehouseCode: string;
  warehouseName: string;
  city: string;
  region: string;
  order: number;
  status: string;
}

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
  routeWaypoints?: RouteWaypoint[];
  route?: string[];
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
    id: "delay",
    title: "Delay +2hrs",
    description: "Adds 2hr delay. Auto-reassigns carrier at 2hrs, emails consumer, reroutes warehouse at 10hrs.",
    icon: <Clock className="h-4 w-4" />,
    severity: "high",
    issue: "delay",
  },
  {
    id: "set-in-transit",
    title: "Set In Transit",
    description: "Dispatch shipment. Marks first waypoint as in transit.",
    icon: <Play className="h-4 w-4" />,
    severity: "low",
    issue: "set_in_transit",
  },
  {
    id: "arrived-warehouse",
    title: "Arrived at Warehouse",
    description: "Advance to next waypoint. Swaps carrier if delay is high.",
    icon: <Warehouse className="h-4 w-4" />,
    severity: "medium",
    issue: "arrived_warehouse",
  },
  {
    id: "sla-breach",
    title: "SLA Breach",
    description: "Force SLA breach. Auto-escalates and sends notification.",
    icon: <AlertOctagon className="h-4 w-4" />,
    severity: "critical",
    issue: "SLA_BREACH",
  },
  {
    id: "resolve",
    title: "Resolve All Issues",
    description: "Clear all delays, reset risk, resolve incidents.",
    icon: <CheckCircle2 className="h-4 w-4" />,
    severity: "low",
    issue: "resolve",
  },
  {
    id: "reset-demo",
    title: "Reset Demo",
    description: "Reset shipment to pristine seed state. Restores carriers and waypoints.",
    icon: <RotateCcw className="h-4 w-4" />,
    severity: "low",
    issue: "reset_demo",
  },
];

const SEVERITY_COLORS: Record<string, string> = {
  low: "text-emerald-500",
  medium: "text-amber-500",
  high: "text-orange-500",
  critical: "text-red-500",
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

// renders the multi-hop route as city -> city -> city
function RouteDisplay({ shipment }: { shipment: ShipmentState }) {
  const route = shipment.route;
  if (route && route.length > 0) {
    return (
      <div className="flex items-center gap-0.5 flex-wrap">
        {route.map((city, i) => (
          <span key={i} className="flex items-center gap-0.5">
            <span className="text-[9px] whitespace-nowrap">{city}</span>
            {i < route.length - 1 && (
              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
            )}
          </span>
        ))}
      </div>
    );
  }

  // fallback to origin -> waypoints -> destination
  const waypoints = shipment.routeWaypoints || [];
  const sorted = [...waypoints].sort((a, b) => a.order - b.order);
  const cities: string[] = [];
  if (shipment.origin?.city) cities.push(shipment.origin.city);
  for (const wp of sorted) {
    if (wp.city && !cities.includes(wp.city)) cities.push(wp.city);
  }
  if (shipment.destination?.city && !cities.includes(shipment.destination.city)) {
    cities.push(shipment.destination.city);
  }

  if (cities.length === 0) return <span className="text-[9px]">No route</span>;

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {cities.map((city, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <span className="text-[9px] whitespace-nowrap">{city}</span>
          {i < cities.length - 1 && (
            <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
          )}
        </span>
      ))}
    </div>
  );
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

  const [demoShipments, setDemoShipments] = useState<ShipmentState[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<number>(1);

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
    try {
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
      if (results.length > 0) setDemoShipments(results);
    } catch {
      // silent
    }
  }, []);

  // initial load
  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  // poll shipments every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchShipments();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchShipments]);

  // poll logs every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 5000);
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

        const resultLog: SystemLog = {
          id: `local-result-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          event_type: `trigger_${card.issue}_result`,
          source: "trigger_engine",
          severity: card.severity,
          message: `Case ${selectedCaseId}: ${card.title} processed. Delay: ${changes.delay?.total || 0}min, Risk: ${changes.riskScore?.new || 0}%. ${actions.carrierReassigned ? "Carrier reassigned. " : ""}${actions.emailTriggered ? "Email sent. " : ""}${actions.warehouseRerouted ? "Warehouse rerouted. " : ""}`,
        };
        addLocalLog(resultLog);

        createLog.mutate({
          id: resultLog.id,
          timestamp: resultLog.timestamp,
          event_type: resultLog.event_type,
          source: resultLog.source,
          severity: resultLog.severity,
          message: resultLog.message,
        });

        toast.success(`${card.title} triggered for Case ${selectedCaseId}`);
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
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* center: logs panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between border-b px-6 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">System Logs</h1>
            <p className="text-muted-foreground text-sm truncate">
              Event logs and trigger testing for Case {selectedCaseId}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
          <span className="w-36 shrink-0">Timestamp</span>
          <span className="w-44 shrink-0">Event</span>
          <span className="min-w-0 flex-1">Details</span>
        </div>

        {/* logs list */}
        <ScrollArea className="flex-1 min-h-0">
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
                      "w-44 shrink-0 text-[11px] font-medium uppercase truncate",
                      SEVERITY_COLORS[log.severity] ||
                        "text-muted-foreground"
                    )}
                  >
                    {log.event_type.replace(/_/g, " ")}
                  </span>
                  <span className="min-w-0 flex-1 text-[11px] break-words">
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
            Polling every 5s
          </span>
        </div>
      </div>

      {/* right: trigger cards panel */}
      <div className="hidden w-80 shrink-0 border-l lg:flex flex-col overflow-hidden">
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Triggers</h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            Fire events on Case {selectedCaseId}
          </p>
        </div>

        {/* case selector */}
        <div className="shrink-0 border-b px-4 py-3 overflow-hidden">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">
            Select Case
          </p>
          <div className="flex items-stretch gap-1.5">
            {[1, 2, 3].map((cid) => {
              const s = demoShipments.find((sh) => sh.caseId === cid);
              const isActive = selectedCaseId === cid;
              return (
                <button
                  key={cid}
                  onClick={() => setSelectedCaseId(cid)}
                  className={cn(
                    "flex-1 min-w-0 rounded-md border px-1.5 py-2 text-center transition-colors overflow-hidden",
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <p className="text-[10px] font-bold truncate">Case {cid}</p>
                  {s ? (
                    <p className="text-[8px] mt-0.5 truncate">
                      {s.origin?.city || "?"} → {s.destination?.city || "?"}
                    </p>
                  ) : (
                    <p className="text-[8px] mt-0.5">Loading...</p>
                  )}
                </button>
              );
            })}
          </div>

          {/* multi-route display */}
          {selectedShipment && (
            <div className="mt-2 space-y-1.5 overflow-hidden">
              <RouteDisplay shipment={selectedShipment} />
              <div className="flex items-center gap-2 flex-wrap text-[10px]">
                <span className="capitalize text-muted-foreground">
                  {selectedShipment.status.replace(/_/g, " ")}
                </span>
                {selectedShipment.delay > 0 && (
                  <span className="text-red-500 font-medium">
                    +{formatDelayHrs(selectedShipment.delay)}
                  </span>
                )}
                {selectedShipment.slaBreached && (
                  <span className="text-red-600 font-semibold">SLA!</span>
                )}
                {selectedShipment.rerouted && (
                  <span className="text-amber-500">Rerouted</span>
                )}
              </div>

              {/* waypoint details */}
              {selectedShipment.routeWaypoints &&
                selectedShipment.routeWaypoints.length > 0 && (
                  <div className="flex flex-col gap-0.5 mt-1">
                    {[...selectedShipment.routeWaypoints]
                      .sort((a, b) => a.order - b.order)
                      .map((wp, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1.5 text-[9px] text-muted-foreground"
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              wp.status === "rerouted"
                                ? "bg-amber-500"
                                : wp.status === "completed"
                                  ? "bg-emerald-500"
                                  : "bg-muted-foreground/40"
                            )}
                          />
                          <span className="truncate">
                            {wp.warehouseCode} - {wp.city}
                          </span>
                          {wp.status === "rerouted" && (
                            <span className="text-amber-500 text-[8px] shrink-0">
                              rerouted
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                )}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-2 p-3">
            {TRIGGER_CARDS.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-border p-3 overflow-hidden"
              >
                <div className="flex items-start gap-2.5 mb-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    {card.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium leading-tight truncate">
                      {card.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {card.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2 overflow-hidden">
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium uppercase shrink-0",
                      SEVERITY_COLORS[card.severity] ||
                        "text-muted-foreground"
                    )}
                  >
                    {card.severity}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono truncate">
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
                    <>Fire on Case {selectedCaseId}</>
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
