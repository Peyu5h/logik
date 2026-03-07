"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import type { Shipment, RouteWaypoint } from "~/lib/types";
import {
  Package,
  Truck,
  MapPin,
  ArrowRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  X,
  Search,
  Warehouse,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useShipments } from "~/hooks/useShipments";

let mapboxgl: any = null;

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

const statusConfig: Record<string, { label: string; color: string; markerColor: string }> = {
  pending: { label: "Pending", color: "text-muted-foreground", markerColor: "#94a3b8" },
  picked_up: { label: "Picked Up", color: "text-blue-500", markerColor: "#3b82f6" },
  in_transit: { label: "In Transit", color: "text-sky-500", markerColor: "#0ea5e9" },
  at_warehouse: { label: "At Warehouse", color: "text-indigo-500", markerColor: "#6366f1" },
  out_for_delivery: { label: "Out for Delivery", color: "text-amber-500", markerColor: "#f59e0b" },
  delivered: { label: "Delivered", color: "text-emerald-500", markerColor: "#10b981" },
  delayed: { label: "Delayed", color: "text-red-500", markerColor: "#ef4444" },
  cancelled: { label: "Cancelled", color: "text-muted-foreground", markerColor: "#64748b" },
  returned: { label: "Returned", color: "text-orange-500", markerColor: "#f97316" },
  lost: { label: "Lost", color: "text-destructive", markerColor: "#dc2626" },
};

// indian city coordinates for simulation
const CITY_COORDS: Record<string, [number, number]> = {
  "Mumbai": [72.8777, 19.0760],
  "Delhi NCR": [77.1025, 28.7041],
  "Bangalore": [77.5946, 12.9716],
  "Hyderabad": [78.4867, 17.3850],
  "Chennai": [80.2707, 13.0827],
  "Kolkata": [88.3639, 22.5726],
  "Pune": [73.8567, 18.5204],
  "Ahmedabad": [72.5714, 23.0225],
  "Jaipur": [75.7873, 26.9124],
  "Lucknow": [80.9462, 26.8467],
  "Solapur": [75.9064, 17.6599],
  "Nagpur": [79.0882, 21.1458],
};

function getCityCoords(cityName: string | undefined): [number, number] | null {
  if (!cityName) return null;
  const key = Object.keys(CITY_COORDS).find(
    (k) => cityName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(cityName.toLowerCase())
  );
  return key ? CITY_COORDS[key] : null;
}

// builds full route coords: origin -> waypoints (sorted) -> destination
function getFullRouteCoords(shipment: Shipment): [number, number][] {
  const coords: [number, number][] = [];

  const originCoords = shipment.origin.lat && shipment.origin.lng
    ? [shipment.origin.lng, shipment.origin.lat] as [number, number]
    : getCityCoords(shipment.origin.city);
  if (originCoords) coords.push(originCoords);

  const waypoints = shipment.route_waypoints || [];
  const sorted = [...waypoints].sort((a, b) => a.order - b.order);
  for (const wp of sorted) {
    if (wp.lat && wp.lng) {
      coords.push([wp.lng, wp.lat]);
    } else {
      const c = getCityCoords(wp.city);
      if (c) coords.push(c);
    }
  }

  const destCoords = shipment.destination.lat && shipment.destination.lng
    ? [shipment.destination.lng, shipment.destination.lat] as [number, number]
    : getCityCoords(shipment.destination.city);
  if (destCoords) coords.push(destCoords);

  return coords;
}

function getShipmentCoords(shipment: Shipment): {
  origin: [number, number] | null;
  destination: [number, number] | null;
  current: [number, number] | null;
  waypoints: { coord: [number, number]; wp: RouteWaypoint }[];
} {
  const originCoords = shipment.origin.lat && shipment.origin.lng
    ? [shipment.origin.lng, shipment.origin.lat] as [number, number]
    : getCityCoords(shipment.origin.city);

  const destCoords = shipment.destination.lat && shipment.destination.lng
    ? [shipment.destination.lng, shipment.destination.lat] as [number, number]
    : getCityCoords(shipment.destination.city);

  let currentCoords: [number, number] | null = null;
  if (shipment.current_location?.lat && shipment.current_location?.lng) {
    currentCoords = [shipment.current_location.lng, shipment.current_location.lat];
  } else if (shipment.current_location?.city) {
    currentCoords = getCityCoords(shipment.current_location.city);
  }

  // for in-transit without current location, simulate midpoint along route
  if (!currentCoords && originCoords && destCoords && shipment.status === "in_transit") {
    const fullRoute = getFullRouteCoords(shipment);
    if (fullRoute.length >= 2) {
      const midIdx = Math.floor(fullRoute.length * 0.45);
      const a = fullRoute[Math.min(midIdx, fullRoute.length - 2)];
      const b = fullRoute[Math.min(midIdx + 1, fullRoute.length - 1)];
      currentCoords = [a[0] + (b[0] - a[0]) * 0.5, a[1] + (b[1] - a[1]) * 0.5];
    } else {
      currentCoords = [
        originCoords[0] + (destCoords[0] - originCoords[0]) * 0.45,
        originCoords[1] + (destCoords[1] - originCoords[1]) * 0.45,
      ];
    }
  }

  // build waypoint coords
  const wpList = shipment.route_waypoints || [];
  const sortedWps = [...wpList].sort((a, b) => a.order - b.order);
  const waypoints: { coord: [number, number]; wp: RouteWaypoint }[] = [];
  for (const wp of sortedWps) {
    const c = wp.lat && wp.lng
      ? [wp.lng, wp.lat] as [number, number]
      : getCityCoords(wp.city);
    if (c) waypoints.push({ coord: c, wp });
  }

  return { origin: originCoords, destination: destCoords, current: currentCoords, waypoints };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function LiveMapPage() {
  const { resolvedTheme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const sourcesAdded = useRef<Set<string>>(new Set());

  const { data, isLoading } = useShipments();
  const shipments = data?.shipments ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mapLoaded, setMapLoaded] = useState(false);

  const filtered = useMemo(() => {
    let result = shipments;
    if (statusFilter !== "all") {
      result = result.filter((s) => s.status === statusFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.tracking_id.toLowerCase().includes(q) ||
          s.origin.city?.toLowerCase().includes(q) ||
          s.destination.city?.toLowerCase().includes(q) ||
          s.carrier?.name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [shipments, statusFilter, searchQuery]);

  const selected = useMemo(
    () => shipments.find((s) => s._id === selectedId) || null,
    [shipments, selectedId]
  );

  // initialize mapbox
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let cancelled = false;

    const initMap = async () => {
      if (cancelled || !mapContainerRef.current) return;

      if (!mapboxgl) {
        const mod = await import("mapbox-gl");
        await import("mapbox-gl/dist/mapbox-gl.css");
        mapboxgl = mod.default || mod;
      }

      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style:
          resolvedTheme === "dark"
            ? "mapbox://styles/mapbox/dark-v11"
            : "mapbox://styles/mapbox/light-v11",
        center: [78.9629, 20.5937],
        zoom: 4.5,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

      map.on("load", () => {
        if (!cancelled) {
          mapRef.current = map;
          setMapLoaded(true);
        }
      });
    };

    initMap();

    return () => {
      cancelled = true;
    };
  }, [resolvedTheme]);

  // update map style on theme change
  useEffect(() => {
    if (!mapRef.current) return;
    const style =
      resolvedTheme === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11";
    mapRef.current.setStyle(style);
    sourcesAdded.current.clear();
    // re-render after style loads
    mapRef.current.once("style.load", () => {
      setMapLoaded((prev) => !prev);
      setTimeout(() => setMapLoaded(true), 100);
    });
  }, [resolvedTheme]);

  // render markers and routes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const map = mapRef.current;

    // clean old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // clean old sources/layers
    sourcesAdded.current.forEach((id) => {
      try {
        if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
        if (map.getLayer(`${id}-line-dash`)) map.removeLayer(`${id}-line-dash`);
        if (map.getSource(id)) map.removeSource(id);
      } catch (e) {
        // ignore
      }
    });
    sourcesAdded.current.clear();

    const renderAll = () => {
      filtered.forEach((shipment) => {
        const coords = getShipmentCoords(shipment);
        const sc = statusConfig[shipment.status] || statusConfig.pending;
        const isSelected = shipment._id === selectedId;

        // origin marker
        if (coords.origin) {
          const el = document.createElement("div");
          el.className = "mapbox-marker-origin";
          el.style.cssText = `width:10px;height:10px;border-radius:50%;background:#10b981;border:2px solid white;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
          if (isSelected) {
            el.style.width = "14px";
            el.style.height = "14px";
            el.style.boxShadow = "0 0 0 3px rgba(16,185,129,0.3),0 1px 3px rgba(0,0,0,0.3)";
          }

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat(coords.origin)
            .addTo(map);

          el.addEventListener("click", () => setSelectedId(shipment._id));
          markersRef.current.push(marker);
        }

        // waypoint warehouse markers (only for selected or all if you want)
        if (isSelected && coords.waypoints.length > 0) {
          coords.waypoints.forEach(({ coord, wp }) => {
            const wpStatusColor = wp.status === "completed" ? "#10b981"
              : wp.status === "in_transit" ? "#0ea5e9"
              : wp.status === "rerouted" ? "#f97316"
              : "#6366f1";

            const size = isSelected ? 12 : 8;
            const el = document.createElement("div");
            el.className = "mapbox-marker-waypoint";
            el.style.cssText = `width:${size}px;height:${size}px;border-radius:3px;background:${wpStatusColor};border:2px solid white;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.3);transform:rotate(45deg);`;

            const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
              .setLngLat(coord)
              .addTo(map);

            el.addEventListener("click", () => setSelectedId(shipment._id));
            markersRef.current.push(marker);

            // label for selected
            if (isSelected) {
              const label = document.createElement("div");
              label.style.cssText = `position:absolute;white-space:nowrap;font-size:9px;font-weight:600;color:white;background:${wpStatusColor};padding:1px 5px;border-radius:3px;transform:translateY(-20px);pointer-events:none;box-shadow:0 1px 2px rgba(0,0,0,0.3);`;
              label.textContent = wp.city || wp.warehouse_code;
              const labelMarker = new mapboxgl.Marker({ element: label, anchor: "center" })
                .setLngLat(coord)
                .addTo(map);
              markersRef.current.push(labelMarker);
            }
          });
        }

        // destination marker
        if (coords.destination) {
          const el = document.createElement("div");
          el.className = "mapbox-marker-dest";
          el.style.cssText = `width:10px;height:10px;border-radius:50%;background:${sc.markerColor};border:2px solid white;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
          if (isSelected) {
            el.style.width = "14px";
            el.style.height = "14px";
            el.style.boxShadow = `0 0 0 3px ${sc.markerColor}44,0 1px 3px rgba(0,0,0,0.3)`;
          }

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat(coords.destination)
            .addTo(map);

          el.addEventListener("click", () => setSelectedId(shipment._id));
          markersRef.current.push(marker);
        }

        // current location / carrier marker
        if (coords.current && shipment.status !== "delivered" && shipment.status !== "cancelled") {
          const el = document.createElement("div");
          el.className = "mapbox-marker-carrier";
          el.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="${sc.markerColor}" stroke="white" stroke-width="2"/><path d="M8 12h8M12 8l4 4-4 4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
          el.style.cssText = `cursor:pointer;`;
          if (isSelected) {
            el.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="${sc.markerColor}" stroke="white" stroke-width="2.5"/><path d="M10 16h12M16 10l6 6-6 6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
          }

          const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
            .setLngLat(coords.current)
            .addTo(map);

          el.addEventListener("click", () => setSelectedId(shipment._id));
          markersRef.current.push(marker);
        }

        // route line through all waypoints for selected shipment
        if (isSelected && coords.origin && coords.destination) {
          const fullRoute = getFullRouteCoords(shipment);
          // use full multi-hop route if available, fallback to origin->dest
          const routeCoords: [number, number][] = fullRoute.length >= 2
            ? fullRoute
            : [coords.origin, coords.destination];

          const sourceId = `route-${shipment._id}`;

          try {
            // full route line (dashed for pending segments)
            map.addSource(sourceId, {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: routeCoords,
                },
              },
            });

            map.addLayer({
              id: `${sourceId}-line`,
              type: "line",
              source: sourceId,
              paint: {
                "line-color": sc.markerColor,
                "line-width": 2.5,
                "line-opacity": 0.5,
                "line-dasharray": [4, 3],
              },
            });

            sourcesAdded.current.add(sourceId);

            // completed segments (solid line through completed waypoints)
            const waypoints = shipment.route_waypoints || [];
            const sorted = [...waypoints].sort((a, b) => a.order - b.order);
            const completedWps = sorted.filter(wp => wp.status === "completed" || wp.status === "in_transit");

            if (completedWps.length > 0 || coords.current) {
              const completedCoords: [number, number][] = [coords.origin];

              for (const wp of completedWps) {
                const c = wp.lat && wp.lng
                  ? [wp.lng, wp.lat] as [number, number]
                  : getCityCoords(wp.city);
                if (c) completedCoords.push(c);
              }

              if (coords.current) {
                completedCoords.push(coords.current);
              }

              if (completedCoords.length >= 2) {
                const completedId = `completed-${shipment._id}`;
                map.addSource(completedId, {
                  type: "geojson",
                  data: {
                    type: "Feature",
                    properties: {},
                    geometry: {
                      type: "LineString",
                      coordinates: completedCoords,
                    },
                  },
                });

                map.addLayer({
                  id: `${completedId}-line`,
                  type: "line",
                  source: completedId,
                  paint: {
                    "line-color": "#10b981",
                    "line-width": 3.5,
                    "line-opacity": 0.9,
                  },
                });

                sourcesAdded.current.add(completedId);
              }
            }
          } catch (e) {
            // source may already exist
          }
        }
      });
    };

    renderAll();
  }, [filtered, selectedId, mapLoaded]);

  // fly to selected shipment
  useEffect(() => {
    if (!mapRef.current || !selected) return;

    const coords = getShipmentCoords(selected);
    if (coords.current) {
      mapRef.current.flyTo({ center: coords.current, zoom: 7, duration: 1200 });
    } else if (coords.origin && coords.destination) {
      const bounds = [
        [Math.min(coords.origin[0], coords.destination[0]) - 1, Math.min(coords.origin[1], coords.destination[1]) - 1],
        [Math.max(coords.origin[0], coords.destination[0]) + 1, Math.max(coords.origin[1], coords.destination[1]) + 1],
      ];
      mapRef.current.fitBounds(bounds, { padding: 80, duration: 1200 });
    } else if (coords.origin) {
      mapRef.current.flyTo({ center: coords.origin, zoom: 8, duration: 1200 });
    }
  }, [selected]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      {/* left sidebar - shipment list */}
      <div className="hidden md:flex w-72 lg:w-80 flex-col border-r overflow-hidden">
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Live Tracking</span>
            <span className="text-[10px] text-muted-foreground">({filtered.length})</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search shipments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
          <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-0.5">
            {[
              { value: "all", label: "All" },
              { value: "in_transit", label: "Transit" },
              { value: "delayed", label: "Delayed" },
              { value: "out_for_delivery", label: "Delivering" },
              { value: "at_warehouse", label: "Warehouse" },
            ].map((s) => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                  statusFilter === s.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading && shipments.length === 0 ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Package className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No shipments</p>
            </div>
          ) : (
            filtered.map((s) => {
              const sc = statusConfig[s.status] || statusConfig.pending;
              const isActive = s._id === selectedId;

              return (
                <div
                  key={s._id}
                  onClick={() => handleSelect(s._id)}
                  className={cn(
                    "cursor-pointer border-b border-border/30 px-4 py-3 transition-colors",
                    isActive ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/30 border-l-2 border-l-transparent"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", sc.color, `bg-current/10`)}>
                      <span className={sc.color}>{sc.label}</span>
                    </span>
                    {s.sla_breached && (
                      <span className="text-[10px] text-red-500 font-medium">SLA</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium truncate max-w-[80px]">
                      {s.origin.city || "Origin"}
                    </span>
                    <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate max-w-[80px]">
                      {s.destination.city || "Dest"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-mono">{s.tracking_id}</span>
                    {s.carrier && (
                      <>
                        <span>&middot;</span>
                        <span>{s.carrier.name}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* map */}
      <div className="relative flex-1">
        <div ref={mapContainerRef} className="h-full w-full" />

        {/* loading overlay */}
        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        )}

        {/* selected shipment detail panel */}
        {selected && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:bottom-4 md:w-80 bg-background/95 backdrop-blur rounded-lg border shadow-lg overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-medium", statusConfig[selected.status]?.color || "text-muted-foreground")}>
                  {statusConfig[selected.status]?.label || selected.status}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {selected.tracking_id}
                </span>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* route with waypoints */}
              <div className="space-y-1">
                <div className="flex items-center flex-wrap gap-1 text-sm">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="font-medium text-xs">{selected.origin.city || selected.origin.address || "Origin"}</span>
                  </div>
                  {selected.route_waypoints && selected.route_waypoints.length > 0 && (
                    [...selected.route_waypoints].sort((a, b) => a.order - b.order).map((wp, i) => {
                      const wpColor = wp.status === "completed" ? "#10b981"
                        : wp.status === "in_transit" ? "#0ea5e9"
                        : wp.status === "rerouted" ? "#f97316"
                        : "#6366f1";
                      return (
                        <div key={i} className="flex items-center gap-1">
                          <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                          <div className="h-2 w-2 shrink-0 rotate-45 rounded-[1px]" style={{ background: wpColor }} />
                          <span className="text-[10px] text-muted-foreground">{wp.city || wp.warehouse_code}</span>
                        </div>
                      );
                    })
                  )}
                  <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ background: statusConfig[selected.status]?.markerColor }} />
                    <span className="font-medium text-xs">{selected.destination.city || selected.destination.address || "Destination"}</span>
                  </div>
                </div>
              </div>

              {/* details grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {selected.carrier && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Carrier</p>
                    <p className="font-medium flex items-center gap-1">
                      <Truck className="h-3 w-3" />
                      {selected.carrier.name}
                    </p>
                  </div>
                )}
                {selected.estimated_delivery && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">ETA</p>
                    <p className={cn("font-medium", selected.sla_breached ? "text-red-500" : "")}>
                      {formatDate(selected.estimated_delivery)}
                    </p>
                  </div>
                )}
                {selected.consumer && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Consumer</p>
                    <p className="font-medium">{selected.consumer.name}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-muted-foreground">Priority</p>
                  <p className="font-medium capitalize">{selected.priority}</p>
                </div>
                {selected.weight && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Weight</p>
                    <p className="font-medium">{selected.weight} kg</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-muted-foreground">Risk Score</p>
                  <p className={cn(
                    "font-medium",
                    selected.risk_score > 70 ? "text-red-500" : selected.risk_score > 40 ? "text-orange-500" : "text-emerald-500"
                  )}>
                    {selected.risk_score}
                  </p>
                </div>
              </div>

              {/* warnings */}
              {selected.sla_breached && (
                <div className="flex items-center gap-1.5 rounded bg-red-500/10 px-2.5 py-1.5 text-xs text-red-500">
                  <AlertTriangle className="h-3 w-3" />
                  SLA breached
                </div>
              )}

              {selected.agent_notes && (
                <p className="rounded bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  {selected.agent_notes}
                </p>
              )}

              {/* current location */}
              {selected.current_location && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  Currently at {selected.current_location.city || selected.current_location.address || "en route"}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground/60">
                Updated {formatRelativeTime(selected.updated_at)}
              </p>
            </div>
          </div>
        )}

        {/* map legend */}
        <div className="absolute top-4 right-4 bg-background/90 backdrop-blur rounded-lg border px-3 py-2 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[10px]">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Origin</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <div className="h-2 w-2 rounded-full bg-sky-500" />
              <span className="text-muted-foreground">Destination</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <div className="h-2 w-2 rotate-45 rounded-[1px] bg-indigo-500" />
              <span className="text-muted-foreground">Warehouse</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <div className="h-3 w-3 rounded-full bg-sky-500 flex items-center justify-center">
                <ArrowRight className="h-1.5 w-1.5 text-white" />
              </div>
              <span className="text-muted-foreground">Carrier</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
