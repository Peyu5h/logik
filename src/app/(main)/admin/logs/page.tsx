"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ScrollText,
  Play,
  AlertTriangle,
  Clock,
  Zap,
  Loader2,
  Truck,
  Package,
  MapPin,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import { useLogs, useCreateLog, useClearLogs } from "~/hooks/useLogs";
import useUser from "~/hooks/useUser";
import type { SystemLog } from "~/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const WEBHOOK_URL =
  process.env.NEXT_PUBLIC_WEBHOOK_URL ||
  "https://abstruse.app.n8n.cloud/webhook/system-signal";

interface TriggerCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  severity: "low" | "medium" | "high" | "critical";
  eventType: string;
  errorCode: string;
  serviceSource: string;
  payload: Record<string, unknown>;
}

const TRIGGER_CARDS: TriggerCard[] = [
  {
    id: "delay-30min",
    title: "Add 30min Delay",
    description: "Carrier reports 30 minute delay on shipment",
    icon: <Clock className="h-4 w-4" />,
    severity: "medium",
    eventType: "shipment_delay",
    errorCode: "DELAY_30",
    serviceSource: "carrier_gateway",
    payload: {
      description: "Carrier reported 30 minute delay due to traffic congestion.",
      delay_minutes: 30,
      reason: "traffic_congestion",
    },
  },
  {
    id: "wrong-address",
    title: "Wrong Address Delivery",
    description: "Shipment delivered to incorrect address",
    icon: <MapPin className="h-4 w-4" />,
    severity: "high",
    eventType: "wrong_delivery",
    errorCode: "DEL_WRONG_ADDR",
    serviceSource: "delivery_service",
    payload: {
      description: "Package delivered to wrong address. Consumer reported mismatch.",
      impact: "consumer_complaint",
      requires_redelivery: true,
    },
  },
  {
    id: "pickup-not-initiated",
    title: "Pickup Not Initiated",
    description: "Carrier failed to initiate pickup within SLA window",
    icon: <Package className="h-4 w-4" />,
    severity: "high",
    eventType: "pickup_failure",
    errorCode: "PICKUP_MISS",
    serviceSource: "carrier_gateway",
    payload: {
      description: "Carrier failed to initiate pickup. SLA window exceeded by 2 hours.",
      sla_exceeded_hours: 2,
      carrier_response: "no_response",
    },
  },
  {
    id: "carrier-degraded",
    title: "Carrier Degraded",
    description: "Carrier reliability dropped below threshold",
    icon: <Truck className="h-4 w-4" />,
    severity: "high",
    eventType: "carrier_degradation",
    errorCode: "CARRIER_DEG",
    serviceSource: "monitoring_service",
    payload: {
      description: "Carrier on-time rate dropped to 62%. Multiple delays in last 24h.",
      on_time_rate: 62,
      recent_failures: 5,
    },
  },
  {
    id: "warehouse-congestion",
    title: "Warehouse Congestion",
    description: "Warehouse throughput degraded, utilization above 90%",
    icon: <AlertTriangle className="h-4 w-4" />,
    severity: "medium",
    eventType: "warehouse_congestion",
    errorCode: "WH_CONGESTED",
    serviceSource: "warehouse_monitor",
    payload: {
      description: "Warehouse utilization at 94%. Processing delays expected.",
      utilization_pct: 94,
      estimated_delay_hours: 3,
    },
  },
  {
    id: "sla-breach-imminent",
    title: "SLA Breach Imminent",
    description: "Shipment will breach SLA deadline within 2 hours",
    icon: <ShieldAlert className="h-4 w-4" />,
    severity: "critical",
    eventType: "sla_breach_warning",
    errorCode: "SLA_IMMINENT",
    serviceSource: "sla_monitor",
    payload: {
      description: "SLA breach imminent. Estimated delivery exceeds deadline by 4 hours.",
      hours_until_breach: 2,
      estimated_overshoot_hours: 4,
    },
  },
  {
    id: "route-deviation",
    title: "Route Deviation",
    description: "Carrier deviated from planned route significantly",
    icon: <Zap className="h-4 w-4" />,
    severity: "medium",
    eventType: "route_deviation",
    errorCode: "ROUTE_DEV",
    serviceSource: "tracking_service",
    payload: {
      description: "Carrier deviated 45km from planned route. ETA recalculation needed.",
      deviation_km: 45,
      eta_impact_minutes: 90,
    },
  },
  {
    id: "cascading-delay",
    title: "Cascading Delay",
    description: "Delay on one shipment affecting 3+ downstream shipments",
    icon: <AlertTriangle className="h-4 w-4" />,
    severity: "critical",
    eventType: "cascading_delay",
    errorCode: "CASCADE_DELAY",
    serviceSource: "ops_engine",
    payload: {
      description: "Hub delay causing cascading impact on 5 downstream shipments.",
      affected_shipments: 5,
      hub_location: "Mumbai Central",
      estimated_recovery_hours: 6,
    },
  },
];

const SEVERITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-amber-500",
  high: "text-orange-500",
  critical: "text-red-500",
};

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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

  const [localLogs, setLocalLogs] = useState<SystemLog[]>([]);
  const [loadingTriggers, setLoadingTriggers] = useState<Record<string, boolean>>({});
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());
  const loaderRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();

  const allRemoteLogs: SystemLog[] =
    logsData?.pages.flatMap((page) => page.logs) ?? [];

  const mergedLogs = [...localLogs, ...allRemoteLogs].reduce<SystemLog[]>(
    (acc, log) => {
      if (!acc.find((l) => l.id === log.id)) acc.push(log);
      return acc;
    },
    []
  );

  mergedLogs.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const addLocalLog = useCallback((log: SystemLog) => {
    setLocalLogs((prev) => [log, ...prev].slice(0, 50));
    setNewLogIds(new Set([log.id]));
    setTimeout(() => setNewLogIds(new Set()), 2000);
  }, []);

  // trigger a signal
  const triggerSignal = useCallback(
    async (card: TriggerCard) => {
      if (!user) {
        toast.error("Sign in to trigger signals");
        return;
      }

      setLoadingTriggers((prev) => ({ ...prev, [card.id]: true }));

      const timestamp = new Date().toISOString();

      const logEntry: SystemLog = {
        id: generateId("log"),
        timestamp,
        event_type: card.eventType.toUpperCase(),
        source: card.serviceSource,
        severity: card.severity,
        message: `${card.errorCode}: ${(card.payload as { description?: string }).description || card.description}`,
        trace_id: user.id,
      };

      addLocalLog(logEntry);

      // persist log
      createLog.mutate({
        id: logEntry.id,
        timestamp,
        event_type: logEntry.event_type,
        source: logEntry.source,
        severity: logEntry.severity,
        message: logEntry.message,
        trace_id: user.id,
      });

      // send webhook
      const webhookPayload = {
        event_type: card.eventType,
        severity: card.severity,
        timestamp,
        merchant_id: user.id,
        email: user.email,
        service_source: card.serviceSource,
        error_code: card.errorCode,
        payload: card.payload,
      };

      try {
        const response = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload),
        });

        if (response.ok) {
          toast.success(`Sent: ${card.title}`, {
            description: `${card.eventType} signal dispatched`,
          });

          const ackLog: SystemLog = {
            id: generateId("log"),
            timestamp: new Date().toISOString(),
            event_type: "WEBHOOK_SENT",
            source: "testing-studio",
            severity: "low",
            message: `Signal dispatched: ${card.eventType}`,
            trace_id: user.id,
          };
          addLocalLog(ackLog);
          createLog.mutate({
            id: ackLog.id,
            timestamp: ackLog.timestamp,
            event_type: ackLog.event_type,
            source: ackLog.source,
            severity: ackLog.severity,
            message: ackLog.message,
            trace_id: user.id,
          });
        } else {
          toast.error(`Failed: ${card.title}`, {
            description: `Status ${response.status}`,
          });
        }
      } catch (error) {
        toast.error(`Error: ${card.title}`, {
          description: error instanceof Error ? error.message : "Network error",
        });
      } finally {
        setLoadingTriggers((prev) => ({ ...prev, [card.id]: false }));
      }
    },
    [user, addLocalLog, createLog]
  );

  const handleClearLogs = () => {
    setLocalLogs([]);
    clearLogs.mutate();
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* logs panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between border-b px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">System Logs</h1>
            <p className="text-muted-foreground text-sm">
              Event logs and signal triggers for the agent
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className={cn("h-3.5 w-3.5", isLoadingLogs && "animate-spin")} />
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

        {/* logs */}
        <ScrollArea className="flex-1">
          {isLoadingLogs && mergedLogs.length === 0 ? (
            <div className="flex flex-col gap-1 p-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-start gap-4 px-4 py-2">
                  <div className="w-36 h-4 bg-muted rounded animate-pulse" />
                  <div className="w-44 h-4 bg-muted rounded animate-pulse" />
                  <div className="flex-1 h-4 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : mergedLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <ScrollText className="h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground text-sm">No logs yet</p>
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
                      SEVERITY_COLORS[log.severity] || "text-muted-foreground"
                    )}
                  >
                    {log.event_type.replace(/_/g, " ")}
                  </span>
                  <span className="min-w-0 flex-1 text-[11px]">
                    <span className="text-cyan-600 dark:text-cyan-400">
                      [{log.source}]
                    </span>{" "}
                    <span className="text-muted-foreground">{log.message}</span>
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
        </div>
      </div>

      {/* trigger cards panel */}
      <div className="hidden w-80 border-l lg:flex flex-col overflow-hidden">
        <div className="shrink-0 border-b px-4 py-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Signal Triggers</h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Simulate logistics events to test the agent
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-2 p-3">
            {TRIGGER_CARDS.map((card) => (
              <div
                key={card.id}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex items-start gap-2.5 mb-2.5">
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

                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium uppercase">
                    {card.severity}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {card.errorCode}
                  </span>
                </div>

                <button
                  onClick={() => triggerSignal(card)}
                  disabled={loadingTriggers[card.id]}
                  className={cn(
                    "w-full h-8 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 border border-border",
                    "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                    loadingTriggers[card.id] && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {loadingTriggers[card.id] ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Trigger"
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
