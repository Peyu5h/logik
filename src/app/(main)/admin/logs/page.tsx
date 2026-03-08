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
  ArrowRight,
  Play,
  Warehouse,
  RotateCcw,
  TrafficCone,
  BrainCircuit,
  Search as SearchIcon,
  Route,
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
  lat?: number;
  lng?: number;
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
    description: "Adds 2hr delay. 2hrs: notify + auto-assign if pending. 4hrs: email. 6hrs: carrier swap at next warehouse.",
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
    description: "Advance to next waypoint. Swaps carrier if delay >= 6hrs.",
    icon: <Warehouse className="h-4 w-4" />,
    severity: "medium",
    issue: "arrived_warehouse",
  },
  {
    id: "congestion",
    title: "Congestion Control",
    description: "Marks nearest warehouse congested (100%). Reroutes shipments to the next available warehouse.",
    icon: <TrafficCone className="h-4 w-4" />,
    severity: "high",
    issue: "congestion",
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
    id: "reset-demo",
    title: "Reset Demo",
    description: "Reset shipment to pristine seed state. Restores carriers, waypoints, and warehouses.",
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

// renders the multi-hop route as warehouse (city) -> warehouse (city) -> city
function RouteDisplay({ shipment }: { shipment: ShipmentState }) {
  const waypoints = shipment.routeWaypoints || [];
  const sorted = [...waypoints].sort((a, b) => a.order - b.order);

  // build route stops: origin -> each waypoint with warehouse name -> destination
  interface RouteStop {
    label: string;
    sub?: string;
    status?: string;
  }
  const stops: RouteStop[] = [];

  if (shipment.origin?.city) {
    stops.push({ label: shipment.origin.city });
  }

  for (const wp of sorted) {
    const name = wp.warehouseName || wp.warehouseCode;
    const city = wp.city;
    // avoid duplicate if same city as last stop
    const lastLabel = stops[stops.length - 1]?.label;
    if (name && lastLabel !== name) {
      stops.push({ label: name, sub: city !== name ? city : undefined, status: wp.status });
    } else if (city && lastLabel !== city) {
      stops.push({ label: city, status: wp.status });
    }
  }

  if (shipment.destination?.city) {
    const lastLabel = stops[stops.length - 1]?.label;
    if (lastLabel !== shipment.destination.city) {
      stops.push({ label: shipment.destination.city });
    }
  }

  // fallback to pre-built route array
  if (stops.length === 0 && shipment.route && shipment.route.length > 0) {
    const deduped: string[] = [];
    for (const c of shipment.route) {
      if (deduped[deduped.length - 1] !== c) deduped.push(c);
    }
    return (
      <div className="flex items-center gap-0.5 flex-wrap">
        {deduped.map((city, i) => (
          <span key={i} className="flex items-center gap-0.5">
            <span className="text-[9px] whitespace-nowrap">{city}</span>
            {i < deduped.length - 1 && (
              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
            )}
          </span>
        ))}
      </div>
    );
  }

  if (stops.length === 0) return <span className="text-[9px]">No route</span>;

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {stops.map((stop, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <span
            className={cn(
              "text-[9px] whitespace-nowrap",
              stop.status === "completed" && "text-emerald-500",
              stop.status === "in_transit" && "text-sky-500",
              stop.status === "rerouted" && "text-amber-500"
            )}
          >
            {stop.label}
            {stop.sub && (
              <span className="text-muted-foreground/60 ml-0.5">({stop.sub})</span>
            )}
          </span>
          {i < stops.length - 1 && (
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
  const [isResettingAll, setIsResettingAll] = useState(false);
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

  // resolves the congestion trigger endpoint for a given shipment
  // finds the next PENDING warehouse (not in_transit, that's already departed from)
  const getCongestionWarehouseCode = (): string | null => {
    if (!selectedShipment) return null;
    const waypoints = selectedShipment.routeWaypoints || [];
    const sorted = [...waypoints].sort((a, b) => a.order - b.order);
    const nextWp = sorted.find((wp) => wp.status === "pending");
    return nextWp?.warehouseCode || null;
  };

  // congestion loading phases
  const [congestionPhase, setCongestionPhase] = useState<string | null>(null);

  // helper to run congestion phased loading animation
  const runCongestionPhases = async (): Promise<void> => {
    const whCode = getCongestionWarehouseCode();
    const phases = [
      `Scanning warehouse ${whCode || "?"} congestion levels...`,
      "Evaluating alternate routes & nearby warehouses...",
      "Rerouting affected shipments & reassigning carriers...",
    ];
    for (const phase of phases) {
      setCongestionPhase(phase);
      await new Promise((r) => setTimeout(r, 800));
    }
  };

  // fires a trigger against the selected shipment
  const triggerSignal = async (card: TriggerCard) => {
    if (!selectedShipment) {
      toast.error("Select a shipment first");
      return;
    }

    setLoadingTriggers((prev) => ({ ...prev, [card.id]: true }));

    const timestamp = new Date().toISOString();

    // for congestion, we need the warehouse code of the NEXT PENDING warehouse
    let triggerUrl = `${API_BASE_URL}/api/triggers/${selectedCaseId}/${card.issue}`;
    if (card.issue === "congestion") {
      const whCode = getCongestionWarehouseCode();
      if (!whCode) {
        toast.error("No pending warehouse found to congest");
        setLoadingTriggers((prev) => ({ ...prev, [card.id]: false }));
        return;
      }
      triggerUrl = `${API_BASE_URL}/api/triggers/${whCode}/congestion`;
    }

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
      // run phased loading for congestion
      const fetchPromise = fetch(triggerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (card.issue === "congestion") {
        await Promise.all([runCongestionPhases(), fetchPromise.then(() => {})]);
      }

      const response = await fetchPromise;
      setCongestionPhase(null);

      const result = await response.json();

      if (response.ok) {
        const d = result.data || result;
        const changes = d.changes || {};
        const actions = d.actions || {};

        let resultMessage = `Case ${selectedCaseId}: ${card.title} processed.`;
        if (card.issue === "congestion") {
          const congested = d.congestedWarehouse;
          const alternate = d.alternateWarehouse;
          const count = d.reroutedShipments?.length || 0;
          resultMessage = `${congested?.name || congested?.code} congested. ${count} shipment(s) rerouted to ${alternate?.name || alternate?.code} (${alternate?.city || ""}).`;
        } else {
          resultMessage += ` Delay: ${changes.delay?.total || 0}min, Risk: ${changes.riskScore?.new || 0}%. ${actions.carrierReassigned ? "Carrier reassigned. " : ""}${actions.emailTriggered ? "Email sent. " : ""}${actions.warehouseRerouted ? "Warehouse rerouted. " : ""}`;
        }

        const resultLog: SystemLog = {
          id: `local-result-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          event_type: `trigger_${card.issue}_result`,
          source: "trigger_engine",
          severity: card.severity,
          message: resultMessage,
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
      setCongestionPhase(null);
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

  // resets all 3 demo cases, carriers, and warehouses to seed state
  const handleResetAll = async () => {
    setIsResettingAll(true);
    try {
      for (const cid of [1, 2, 3]) {
        const res = await fetch(`${API_BASE_URL}/api/triggers/${cid}/reset_demo`, { method: "POST" });
        if (res.ok) {
          const result = await res.json();
          addLocalLog({
            id: `local-reset-${cid}-${Date.now().toString(36)}`,
            timestamp: new Date().toISOString(),
            event_type: "trigger_reset_demo",
            source: "admin_panel",
            severity: "low",
            message: `Case ${cid}: ${result.data?.message || "Reset to demo state"}`,
          });
        }
      }
      toast.success("All cases reset to demo state");
      await fetchShipments();
      refetch();
    } catch {
      toast.error("Failed to reset demo");
    } finally {
      setIsResettingAll(false);
    }
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Triggers</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1.5"
              disabled={isResettingAll}
              onClick={handleResetAll}
            >
              {isResettingAll ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RotateCcw className="h-3 w-3" />
                  Reset All
                </>
              )}
            </Button>
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
            {TRIGGER_CARDS.map((card) => {
              const st = selectedShipment?.status;
              // disable "Set In Transit" when already in transit or delivered/cancelled
              const isSetTransitDisabled =
                card.issue === "set_in_transit" &&
                (st === "in_transit" || st === "delivered" || st === "cancelled");
              // disable "Arrived at Warehouse" when not in_transit
              const isArrivedDisabled =
                card.issue === "arrived_warehouse" && st !== "in_transit";
              // disable congestion if no pending waypoint or not in_transit
              const isCongestionDisabled =
                card.issue === "congestion" &&
                selectedShipment &&
                (st !== "in_transit" ||
                  !(selectedShipment.routeWaypoints || []).some(
                    (wp) => wp.status === "pending"
                  ));
              // disable SLA breach if already breached
              const isSlaBreachDisabled =
                card.issue === "SLA_BREACH" &&
                selectedShipment?.slaBreached === true;
              // disable delay/SLA/arrived/congestion when not in_transit (except set_in_transit and reset)
              const isNotTransitAction =
                ["delay", "SLA_BREACH", "arrived_warehouse", "congestion"].includes(card.issue) &&
                st !== "in_transit" &&
                st !== "at_warehouse";
              const isDisabled =
                loadingTriggers[card.id] ||
                !selectedShipment ||
                isSetTransitDisabled ||
                isArrivedDisabled ||
                isCongestionDisabled ||
                isSlaBreachDisabled ||
                (isNotTransitAction && card.issue !== "congestion");

              return (
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

                  {/* congestion phased loading */}
                  {card.issue === "congestion" && loadingTriggers[card.id] && congestionPhase && (
                    <div className="mb-2 space-y-1.5">
                      {[
                        `Scanning warehouse congestion levels...`,
                        "Evaluating alternate routes & nearby warehouses...",
                        "Rerouting affected shipments & reassigning carriers...",
                      ].map((phase, i) => {
                        const isActive = congestionPhase === phase;
                        const isPast = [
                          `Scanning warehouse congestion levels...`,
                          "Evaluating alternate routes & nearby warehouses...",
                          "Rerouting affected shipments & reassigning carriers...",
                        ].indexOf(congestionPhase) > i;
                        return (
                          <div
                            key={i}
                            className={cn(
                              "flex items-center gap-1.5 text-[10px] rounded px-2 py-1 transition-all",
                              isActive
                                ? "bg-amber-500/10 text-amber-500"
                                : isPast
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "text-muted-foreground/50"
                            )}
                          >
                            {isActive ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />
                            ) : isPast ? (
                              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                            ) : (
                              <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30 shrink-0" />
                            )}
                            <span className="truncate">{phase}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={() => triggerSignal(card)}
                    disabled={!!isDisabled}
                    className={cn(
                      "w-full h-8 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 border border-border",
                      card.issue === "congestion"
                        ? "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/30"
                        : card.severity === "critical"
                          ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/30"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                      isDisabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {loadingTriggers[card.id] ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Processing...
                      </>
                    ) : isSetTransitDisabled ? (
                      <>Already In Transit</>
                    ) : isArrivedDisabled ? (
                      <>Not In Transit</>
                    ) : isCongestionDisabled ? (
                      <>No Pending Warehouse</>
                    ) : isSlaBreachDisabled ? (
                      <>SLA Already Breached</>
                    ) : isNotTransitAction && card.issue !== "congestion" ? (
                      <>Set In Transit First</>
                    ) : (
                      <>Fire on Case {selectedCaseId}</>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
