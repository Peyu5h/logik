"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Package,
  AlertTriangle,
  Truck,
  Warehouse,
  Clock,
  CheckCircle2,
  MapPin,
  ArrowRight,
  RefreshCw,
  Search,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Card } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useDashboardStats } from "~/hooks/useDashboard";
import { useShipments, useShipmentStats } from "~/hooks/useShipments";
import { useWarehouses } from "~/hooks/useWarehouses";
import type { Shipment, Warehouse as WarehouseType } from "~/lib/types";

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "text-muted-foreground bg-muted" },
  picked_up: { label: "Picked Up", className: "text-blue-500 bg-blue-500/10" },
  in_transit: { label: "In Transit", className: "text-sky-500 bg-sky-500/10" },
  at_warehouse: { label: "At Warehouse", className: "text-indigo-500 bg-indigo-500/10" },
  out_for_delivery: { label: "Out for Delivery", className: "text-amber-500 bg-amber-500/10" },
  delivered: { label: "Delivered", className: "text-emerald-500 bg-emerald-500/10" },
  delayed: { label: "Delayed", className: "text-red-500 bg-red-500/10" },
  cancelled: { label: "Cancelled", className: "text-muted-foreground bg-muted" },
  returned: { label: "Returned", className: "text-orange-500 bg-orange-500/10" },
  lost: { label: "Lost", className: "text-destructive bg-destructive/10" },
};

const whStatusStyles: Record<string, { className: string; label: string }> = {
  operational: { className: "text-emerald-500", label: "Operational" },
  degraded: { className: "text-amber-500", label: "Degraded" },
  congested: { className: "text-orange-500", label: "Congested" },
  offline: { className: "text-red-500", label: "Offline" },
  maintenance: { className: "text-muted-foreground", label: "Maintenance" },
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// shipment row component
function ShipmentRow({ shipment }: { shipment: Shipment }) {
  const sc = statusConfig[shipment.status] || statusConfig.pending;
  const delayHrs = shipment.delay ? Math.round(shipment.delay / 60 * 10) / 10 : 0;

  return (
    <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3 last:border-0 hover:bg-muted/30 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", sc.className)}>
            {sc.label}
          </span>
          <span className="text-xs font-medium capitalize text-muted-foreground">
            {shipment.priority}
          </span>
          {shipment.case_id && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              #{shipment.case_id}
            </span>
          )}
          {shipment.sla_breached && (
            <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
              SLA BREACH
            </span>
          )}
          {shipment.rerouted && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
              Rerouted
            </span>
          )}
          {shipment.escalated && (
            <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
              Escalated
            </span>
          )}
          {shipment.risk_score > 40 && (
            <span className="text-[10px] text-orange-500">Risk: {shipment.risk_score}%</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-sm">
          <span className="truncate max-w-[120px] font-medium">
            {shipment.origin.city || "Origin"}
          </span>
          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="truncate max-w-[120px] font-medium">
            {shipment.destination.city || "Destination"}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {shipment.carrier && (
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3" />
              {shipment.carrier.name}
            </span>
          )}
          {shipment.consumer && <span>{shipment.consumer.name}</span>}
          {delayHrs > 0 && (
            <span className="text-red-500 font-medium">+{delayHrs}h delay</span>
          )}
          {shipment.value > 0 && (
            <span>INR {shipment.value.toLocaleString("en-IN")}</span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-[10px] text-muted-foreground">{shipment.tracking_id}</p>
        {shipment.estimated_delivery && (
          <p className="mt-0.5 text-[10px]">
            <span className="text-muted-foreground">ETA </span>
            <span className={cn("font-medium", shipment.sla_breached ? "text-red-500" : shipment.delay > 0 ? "text-amber-500" : "text-foreground")}>
              {formatDate(shipment.estimated_delivery)}
            </span>
          </p>
        )}
        {shipment.initial_eta && shipment.delay > 0 && (
          <p className="mt-0.5 text-[10px] text-muted-foreground/60 line-through">
            was {formatDate(shipment.initial_eta)}
          </p>
        )}
        <p className="mt-0.5 text-[10px] text-muted-foreground/60">
          {formatRelativeTime(shipment.updated_at)}
        </p>
      </div>
    </div>
  );
}

// warehouse row component
function WarehouseRow({ warehouse }: { warehouse: WarehouseType }) {
  const ws = whStatusStyles[warehouse.status] || whStatusStyles.operational;
  const utilizationColor =
    warehouse.utilization_pct > 85
      ? "bg-red-500"
      : warehouse.utilization_pct > 65
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3 last:border-0 hover:bg-muted/30 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{warehouse.name}</span>
          <span className={cn("text-[10px] font-medium", ws.className)}>{ws.label}</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{warehouse.location.city || warehouse.code}</span>
          <span>{warehouse.throughput_rate} pkg/hr</span>
          <span>{warehouse.regions.join(", ")}</span>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs font-medium">{warehouse.utilization_pct}%</p>
          <p className="text-[10px] text-muted-foreground">
            {warehouse.current_load}/{warehouse.capacity}
          </p>
        </div>
        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", utilizationColor)}
            style={{ width: `${Math.min(warehouse.utilization_pct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: dashboardData, isLoading: isLoadingDashboard, refetch: refetchDashboard } = useDashboardStats();
  const { data: shipmentStats, refetch: refetchStats } = useShipmentStats();
  const { data: shipmentsData, isLoading: isLoadingShipments, refetch: refetchShipments } = useShipments();
  const { data: warehousesData, isLoading: isLoadingWarehouses, refetch: refetchWarehouses } = useWarehouses();

  const [shipmentSearch, setShipmentSearch] = useState("");
  const [shipmentFilter, setShipmentFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");

  const shipments = shipmentsData?.shipments ?? [];
  const warehouses = warehousesData?.warehouses ?? [];
  const overview = dashboardData?.overview;
  const recentActions = dashboardData?.recent_agent_actions ?? [];
  const topCarriers = dashboardData?.top_carriers ?? [];

  const isLoading = isLoadingDashboard || isLoadingShipments;

  // polling every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetchDashboard();
      refetchStats();
      refetchShipments();
      refetchWarehouses();
    }, 10000);
    return () => clearInterval(interval);
  }, [refetchDashboard, refetchStats, refetchShipments, refetchWarehouses]);

  const handleRefresh = () => {
    refetchDashboard();
    refetchStats();
    refetchShipments();
    refetchWarehouses();
  };

  const filteredShipments = useMemo(() => {
    let result = shipments;
    if (shipmentFilter !== "all") {
      result = result.filter((s) => s.status === shipmentFilter);
    }
    if (shipmentSearch) {
      const q = shipmentSearch.toLowerCase();
      result = result.filter(
        (s) =>
          s.tracking_id.toLowerCase().includes(q) ||
          s.origin.city?.toLowerCase().includes(q) ||
          s.destination.city?.toLowerCase().includes(q) ||
          s.carrier?.name.toLowerCase().includes(q) ||
          s.consumer?.name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [shipments, shipmentFilter, shipmentSearch]);

  const filteredWarehouses = useMemo(() => {
    if (warehouseFilter === "all") return warehouses;
    return warehouses.filter((w) => w.status === warehouseFilter);
  }, [warehouses, warehouseFilter]);

  const shipmentStatusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: shipments.length };
    shipments.forEach((s) => {
      counts[s.status] = (counts[s.status] || 0) + 1;
    });
    return counts;
  }, [shipments]);

  if (isLoading && !dashboardData && shipments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* header */}
      <div className="shrink-0 flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Operations Dashboard</h1>
          <p className="text-muted-foreground text-sm">Real-time logistics overview</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5">
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* kpi strip */}
      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-px bg-border/40 border-b">
        <KpiCell label="Total" value={overview?.total_shipments ?? shipmentStats?.total ?? 0} />
        <KpiCell
          label="In Transit"
          value={shipmentStats?.in_transit ?? 0}
          accent="text-sky-500"
        />
        <KpiCell
          label="Delayed"
          value={overview?.delayed_shipments ?? shipmentStats?.delayed ?? 0}
          accent={(overview?.delayed_shipments ?? 0) > 0 ? "text-red-500" : undefined}
        />
        <KpiCell
          label="SLA Breached"
          value={overview?.sla_breached ?? shipmentStats?.sla_breached ?? 0}
          accent={(overview?.sla_breached ?? 0) > 0 ? "text-red-500" : undefined}
        />
        <KpiCell
          label="Incidents"
          value={overview?.open_incidents ?? 0}
          accent={(overview?.critical_incidents ?? 0) > 0 ? "text-orange-500" : undefined}
        />
        <KpiCell
          label="On-Time"
          value={shipmentStats ? `${shipmentStats.on_time_rate}%` : "—"}
          accent="text-emerald-500"
        />
      </div>

      {/* main content - two panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* shipments panel */}
        <div className="flex flex-1 flex-col border-r overflow-hidden">
          <div className="shrink-0 border-b px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Shipments</span>
              <span className="text-xs text-muted-foreground">({filteredShipments.length})</span>
              <div className="ml-auto relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={shipmentSearch}
                  onChange={(e) => setShipmentSearch(e.target.value)}
                  className="h-7 w-48 pl-7 text-xs"
                />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-1">
              {[
                { value: "all", label: "All" },
                { value: "in_transit", label: "In Transit" },
                { value: "delayed", label: "Delayed" },
                { value: "at_warehouse", label: "Warehouse" },
                { value: "out_for_delivery", label: "Out for Delivery" },
                { value: "delivered", label: "Delivered" },
                { value: "pending", label: "Pending" },
              ].map((s) => (
                <button
                  key={s.value}
                  onClick={() => setShipmentFilter(s.value)}
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    shipmentFilter === s.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {s.label}
                  {shipmentStatusCounts[s.value] !== undefined && (
                    <span className="ml-1 opacity-70">{shipmentStatusCounts[s.value]}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="flex-1">
            {isLoadingShipments && shipments.length === 0 ? (
              <div className="flex flex-col gap-2 p-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : filteredShipments.length > 0 ? (
              filteredShipments.map((s) => <ShipmentRow key={s._id} shipment={s} />)
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <Package className="h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">No shipments found</p>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* right sidebar - warehouses + carriers + agent actions */}
        <div className="hidden lg:flex w-80 xl:w-96 flex-col overflow-hidden">
          {/* warehouses section */}
          <div className="flex flex-col flex-1 overflow-hidden border-b">
            <div className="shrink-0 flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Warehouse className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Warehouses</span>
              </div>
              <div className="flex items-center gap-1">
                {["all", "operational", "congested", "degraded"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setWarehouseFilter(f)}
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-medium transition-colors capitalize",
                      warehouseFilter === f
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <ScrollArea className="flex-1">
              {isLoadingWarehouses && warehouses.length === 0 ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 rounded bg-muted animate-pulse" />
                  ))}
                </div>
              ) : filteredWarehouses.length > 0 ? (
                filteredWarehouses.map((w) => <WarehouseRow key={w._id} warehouse={w} />)
              ) : (
                <div className="flex flex-col items-center justify-center py-10">
                  <Warehouse className="h-6 w-6 text-muted-foreground" />
                  <p className="mt-2 text-xs text-muted-foreground">No warehouses</p>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* carriers + agent actions */}
          <div className="flex flex-col shrink-0 max-h-[45%] overflow-hidden">
            <div className="shrink-0 flex items-center gap-2 border-b px-4 py-2.5">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Carriers</span>
            </div>
            <ScrollArea className="flex-1">
              {/* carriers */}
              {topCarriers.length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-[10px] font-medium uppercase text-muted-foreground tracking-wide mb-2">
                    Top Carriers
                  </p>
                  <div className="space-y-2">
                    {topCarriers.map((c) => (
                      <div key={c.code} className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {c.active_shipments} active
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            "text-xs font-medium",
                            c.reliability_score >= 90
                              ? "text-emerald-500"
                              : c.reliability_score >= 75
                                ? "text-amber-500"
                                : "text-red-500"
                          )}>
                            {c.reliability_score}%
                          </p>
                          <p className="text-[10px] text-muted-foreground">reliability</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topCarriers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10">
                  <Truck className="h-6 w-6 text-muted-foreground" />
                  <p className="mt-2 text-xs text-muted-foreground">No carriers yet</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="bg-background px-4 py-3">
      <p className={cn("text-lg font-semibold tabular-nums", accent || "text-foreground")}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
