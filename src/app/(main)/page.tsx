"use client";

import { useState, useMemo } from "react";
import {
  Package,
  Clock,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  ArrowRight,
  RefreshCw,
  Truck,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Card } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useMyShipments, useCreateShipment } from "~/hooks/useShipments";
import useUser from "~/hooks/useUser";
import Link from "next/link";
import type { Shipment } from "~/lib/types";

const statusConfig: Record<string, { label: string; className: string }> = {
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

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (diff < 0) {
    const future = Math.abs(diff);
    const fh = Math.floor(future / 3600000);
    if (fh < 1) return "< 1h";
    if (fh < 24) return `in ${fh}h`;
    return `in ${Math.floor(future / 86400000)}d`;
  }
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ShipmentRow({ shipment }: { shipment: Shipment }) {
  const sc = statusConfig[shipment.status] || statusConfig.pending;

  return (
    <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3 last:border-0 hover:bg-muted/30 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", sc.className)}>
            {sc.label}
          </span>
          <span className="text-xs font-medium capitalize text-muted-foreground">
            {shipment.priority}
          </span>
          {shipment.sla_breached && (
            <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
              SLA
            </span>
          )}
          {shipment.risk_score > 40 && (
            <span className="text-[10px] text-orange-500">Risk: {shipment.risk_score}</span>
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
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          {shipment.carrier && (
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3" />
              {shipment.carrier.name}
            </span>
          )}
          {shipment.weight && <span>{shipment.weight} kg</span>}
        </div>
        {shipment.agent_notes && (
          <p className="mt-1 text-[10px] text-muted-foreground/70 line-clamp-1">
            {shipment.agent_notes}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-[10px] text-muted-foreground">{shipment.tracking_id}</p>
        {shipment.estimated_delivery && (
          <p className="mt-0.5 text-[10px]">
            <span className="text-muted-foreground">ETA </span>
            <span className={cn("font-medium", shipment.sla_breached ? "text-red-500" : "text-foreground")}>
              {formatDate(shipment.estimated_delivery)}
            </span>
          </p>
        )}
        <p className="mt-0.5 text-[10px] text-muted-foreground/60">
          {formatRelativeTime(shipment.updated_at)}
        </p>
      </div>
    </div>
  );
}

// indian cities for the form
const CITIES = [
  { name: "Mumbai", lat: 19.076, lng: 72.8777, region: "West" },
  { name: "Delhi NCR", lat: 28.7041, lng: 77.1025, region: "North" },
  { name: "Bangalore", lat: 12.9716, lng: 77.5946, region: "South" },
  { name: "Hyderabad", lat: 17.385, lng: 78.4867, region: "South" },
  { name: "Chennai", lat: 13.0827, lng: 80.2707, region: "South" },
  { name: "Kolkata", lat: 22.5726, lng: 88.3639, region: "East" },
  { name: "Pune", lat: 18.5204, lng: 73.8567, region: "West" },
  { name: "Ahmedabad", lat: 23.0225, lng: 72.5714, region: "West" },
  { name: "Jaipur", lat: 26.9124, lng: 75.7873, region: "North" },
  { name: "Lucknow", lat: 26.8467, lng: 80.9462, region: "North" },
];

export default function ConsumerDashboard() {
  const { user } = useUser();
  const { data, isLoading, refetch } = useMyShipments();
  const createShipment = useCreateShipment();

  const [showCreate, setShowCreate] = useState(false);
  const [originCity, setOriginCity] = useState("");
  const [destCity, setDestCity] = useState("");
  const [weight, setWeight] = useState("");
  const [priority, setPriority] = useState("medium");

  const shipments = data?.shipments ?? [];

  const stats = useMemo(() => {
    const active = shipments.filter((s) =>
      ["in_transit", "out_for_delivery", "at_warehouse", "picked_up"].includes(s.status)
    ).length;
    const delayed = shipments.filter((s) => s.status === "delayed").length;
    const delivered = shipments.filter((s) => s.status === "delivered").length;
    const pending = shipments.filter((s) => s.status === "pending").length;
    return { active, delayed, delivered, pending, total: shipments.length };
  }, [shipments]);

  const sortedShipments = useMemo(() => {
    return [...shipments].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [shipments]);

  const alertShipments = useMemo(() => {
    return shipments
      .filter((s) => s.status === "delayed" || s.sla_breached || s.risk_score > 60)
      .sort((a, b) => b.risk_score - a.risk_score)
      .slice(0, 5);
  }, [shipments]);

  const handleCreateShipment = () => {
    if (!originCity || !destCity || !user) return;

    const origin = CITIES.find((c) => c.name === originCity);
    const dest = CITIES.find((c) => c.name === destCity);
    if (!origin || !dest) return;

    createShipment.mutate(
      {
        consumer_id: user.id,
        origin: { lat: origin.lat, lng: origin.lng, city: origin.name, region: origin.region },
        destination: { lat: dest.lat, lng: dest.lng, city: dest.name, region: dest.region },
        priority: priority as "low" | "medium" | "high" | "urgent",
        weight: weight ? parseFloat(weight) : undefined,
        sla_hours: priority === "urgent" ? 24 : priority === "high" ? 48 : 72,
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setOriginCity("");
          setDestCity("");
          setWeight("");
          setPriority("medium");
        },
      }
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* header */}
      <div className="shrink-0 flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">
            Welcome, {user?.name?.split(" ")[0] || "there"}
          </h1>
          <p className="text-muted-foreground text-sm">Track and manage your shipments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Shipment
          </Button>
        </div>
      </div>

      {/* kpi strip */}
      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-5 gap-px bg-border/40 border-b">
        <KpiCell label="Total" value={stats.total} />
        <KpiCell label="Active" value={stats.active} accent="text-sky-500" />
        <KpiCell label="Delayed" value={stats.delayed} accent={stats.delayed > 0 ? "text-red-500" : undefined} />
        <KpiCell label="Delivered" value={stats.delivered} accent="text-emerald-500" />
        <KpiCell label="Pending" value={stats.pending} />
      </div>

      {/* main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* shipments list */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="shrink-0 flex items-center gap-2 border-b px-4 py-2.5">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">My Shipments</span>
            <span className="text-xs text-muted-foreground">({sortedShipments.length})</span>
            <Link href="/track" className="ml-auto text-xs text-primary hover:underline flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Track on map
            </Link>
          </div>
          <ScrollArea className="flex-1">
            {isLoading && shipments.length === 0 ? (
              <div className="flex flex-col gap-2 p-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : sortedShipments.length > 0 ? (
              sortedShipments.map((s) => <ShipmentRow key={s._id} shipment={s} />)
            ) : (
              <div className="flex flex-col items-center justify-center py-20">
                <Package className="h-10 w-10 text-muted-foreground" />
                <h3 className="mt-3 text-sm font-medium">No shipments yet</h3>
                <p className="mt-1 text-xs text-muted-foreground text-center">
                  Create your first shipment to get started.
                </p>
                <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Create Shipment
                </Button>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* right sidebar - alerts */}
        <div className="hidden lg:flex w-80 flex-col border-l overflow-hidden">
          <div className="shrink-0 flex items-center gap-2 border-b px-4 py-2.5">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Alerts & Risks</span>
          </div>
          <ScrollArea className="flex-1">
            {alertShipments.length > 0 ? (
              <div className="p-3 space-y-2">
                {alertShipments.map((s) => (
                  <div
                    key={s._id}
                    className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {s.tracking_id}
                        </p>
                        <p className="mt-0.5 text-xs font-medium">
                          {s.origin.city} → {s.destination.city}
                        </p>
                        {s.agent_notes && (
                          <p className="mt-1 text-[10px] text-orange-600/80 dark:text-orange-400/80 line-clamp-2">
                            {s.agent_notes}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                          s.risk_score > 70
                            ? "bg-red-500/10 text-red-500"
                            : "bg-amber-500/10 text-amber-500"
                        )}
                      >
                        {s.risk_score}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      {s.sla_breached && <span className="text-red-500 font-medium">SLA Breached</span>}
                      <span>{statusConfig[s.status]?.label || s.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <h3 className="mt-2 text-sm font-medium">All clear</h3>
                <p className="mt-1 text-xs text-muted-foreground text-center px-4">
                  No shipments at risk right now.
                </p>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* create shipment modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md p-6 mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Shipment</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Origin City</Label>
                <select
                  value={originCity}
                  onChange={(e) => setOriginCity(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select origin</option>
                  {CITIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.region})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Destination City</Label>
                <select
                  value={destCity}
                  onChange={(e) => setDestCity(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select destination</option>
                  {CITIES.filter((c) => c.name !== originCity).map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.region})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Weight (kg)</Label>
                  <Input
                    type="number"
                    placeholder="0.5"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="h-9 text-sm"
                    min="0.1"
                    step="0.1"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Priority</Label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={!originCity || !destCity || createShipment.isPending}
                  onClick={handleCreateShipment}
                >
                  {createShipment.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Shipment"
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
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
