"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  Package,
  Truck,
  MapPin,
  ArrowRight,
  Clock,
  AlertTriangle,
  X,
  Search,
  RefreshCw,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useMyShipments } from "~/hooks/useShipments";
import type { Shipment } from "~/lib/types";

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN
const statusConfig: Record<
  string,
  { label: string; color: string; markerColor: string }
> = {
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

const CITY_COORDS: Record<string, [number, number]> = {
  Mumbai: [72.8777, 19.076],
  "Delhi NCR": [77.1025, 28.7041],
  Bangalore: [77.5946, 12.9716],
  Hyderabad: [78.4867, 17.385],
  Chennai: [80.2707, 13.0827],
  Kolkata: [88.3639, 22.5726],
  Pune: [73.8567, 18.5204],
  Ahmedabad: [72.5714, 23.0225],
  Jaipur: [75.7873, 26.9124],
  Lucknow: [80.9462, 26.8467],
  Solapur: [75.9064, 17.6599],
  Nagpur: [79.0882, 21.1458],
  Ghaziabad: [77.4538, 28.6692],
};

function getCityCoords(cityName: string | undefined): [number, number] | null {
  if (!cityName) return null;
  const key = Object.keys(CITY_COORDS).find(
    (k) =>
      cityName.toLowerCase().includes(k.toLowerCase()) ||
      k.toLowerCase().includes(cityName.toLowerCase())
  );
  return key ? CITY_COORDS[key] : null;
}

// builds full route coords: origin -> waypoints (sorted) -> destination
function getFullRouteCoords(shipment: Shipment): [number, number][] {
  const coords: [number, number][] = [];

  const originCoords =
    shipment.origin.lat && shipment.origin.lng
      ? ([shipment.origin.lng, shipment.origin.lat] as [number, number])
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

  const destCoords =
    shipment.destination.lat && shipment.destination.lng
      ? ([shipment.destination.lng, shipment.destination.lat] as [number, number])
      : getCityCoords(shipment.destination.city);
  if (destCoords) coords.push(destCoords);

  return coords;
}

// approximate position based on shipment status
function getShipmentCoords(shipment: Shipment): {
  origin: [number, number] | null;
  destination: [number, number] | null;
  current: [number, number] | null;
} {
  const originCoords =
    shipment.origin.lat && shipment.origin.lng
      ? ([shipment.origin.lng, shipment.origin.lat] as [number, number])
      : getCityCoords(shipment.origin.city);

  const destCoords =
    shipment.destination.lat && shipment.destination.lng
      ? ([shipment.destination.lng, shipment.destination.lat] as [number, number])
      : getCityCoords(shipment.destination.city);

  // if backend already set current_location, use it
  let currentCoords: [number, number] | null = null;
  if (shipment.current_location?.lat && shipment.current_location?.lng) {
    currentCoords = [shipment.current_location.lng, shipment.current_location.lat];
  } else if (shipment.current_location?.city) {
    currentCoords = getCityCoords(shipment.current_location.city);
  }

  // derive position from status + route waypoints when no explicit location
  if (!currentCoords) {
    const waypoints = shipment.route_waypoints || [];
    const sorted = [...waypoints].sort((a, b) => a.order - b.order);

    switch (shipment.status) {
      case "pending": {
        // at origin
        currentCoords = originCoords;
        break;
      }

      case "in_transit": {
        // find the segment the shipment is currently traversing
        // "from" = last completed waypoint (or origin)
        // "to" = the next waypoint after the in_transit one (or destination)
        const lastCompleted = [...sorted].reverse().find((wp) => wp.status === "completed");
        const inTransitWp = sorted.find((wp) => wp.status === "in_transit");
        const nextPendingAfterTransit = inTransitWp
          ? sorted.find((wp) => wp.order > inTransitWp.order && wp.status === "pending")
          : sorted.find((wp) => wp.status === "pending");

        // "from" is the last completed waypoint or origin
        const fromCoord = lastCompleted
          ? (lastCompleted.lat && lastCompleted.lng ? [lastCompleted.lng, lastCompleted.lat] as [number, number] : getCityCoords(lastCompleted.city))
          : originCoords;

        // "to" is the in_transit waypoint itself (the one we're heading toward)
        // if fromCoord would be the same city, use the waypoint after it instead
        let toCoord: [number, number] | null = null;
        if (inTransitWp) {
          const wpCoord = inTransitWp.lat && inTransitWp.lng
            ? [inTransitWp.lng, inTransitWp.lat] as [number, number]
            : getCityCoords(inTransitWp.city);

          // check if from and to resolve to the same point (same city)
          if (wpCoord && fromCoord &&
            Math.abs(wpCoord[0] - fromCoord[0]) < 0.01 &&
            Math.abs(wpCoord[1] - fromCoord[1]) < 0.01) {
            // origin and first waypoint are same city — use the next waypoint as destination
            const afterWp = nextPendingAfterTransit;
            toCoord = afterWp
              ? (afterWp.lat && afterWp.lng ? [afterWp.lng, afterWp.lat] as [number, number] : getCityCoords(afterWp.city))
              : destCoords;
          } else {
            toCoord = wpCoord;
          }
        } else if (nextPendingAfterTransit) {
          toCoord = nextPendingAfterTransit.lat && nextPendingAfterTransit.lng
            ? [nextPendingAfterTransit.lng, nextPendingAfterTransit.lat] as [number, number]
            : getCityCoords(nextPendingAfterTransit.city);
        } else {
          toCoord = destCoords;
        }

        if (fromCoord && toCoord &&
          (Math.abs(fromCoord[0] - toCoord[0]) > 0.01 || Math.abs(fromCoord[1] - toCoord[1]) > 0.01)) {
          currentCoords = [
            fromCoord[0] + (toCoord[0] - fromCoord[0]) * 0.45,
            fromCoord[1] + (toCoord[1] - fromCoord[1]) * 0.45,
          ];
        } else if (originCoords && destCoords) {
          // fallback: interpolate along full route
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
        break;
      }

      case "at_warehouse": {
        // at the last completed waypoint (the warehouse we just arrived at)
        const arrivedWp = [...sorted].reverse().find((wp) => wp.status === "completed");
        if (arrivedWp) {
          currentCoords = arrivedWp.lat && arrivedWp.lng
            ? [arrivedWp.lng, arrivedWp.lat]
            : getCityCoords(arrivedWp.city);
        }
        break;
      }

      case "out_for_delivery": {
        // near destination — 85% of the way from last waypoint to destination
        const lastWp = sorted[sorted.length - 1];
        const fromCoord = lastWp
          ? (lastWp.lat && lastWp.lng ? [lastWp.lng, lastWp.lat] as [number, number] : getCityCoords(lastWp.city))
          : originCoords;

        if (fromCoord && destCoords) {
          currentCoords = [
            fromCoord[0] + (destCoords[0] - fromCoord[0]) * 0.85,
            fromCoord[1] + (destCoords[1] - fromCoord[1]) * 0.85,
          ];
        }
        break;
      }

      case "delivered": {
        currentCoords = destCoords;
        break;
      }

      // delayed — same logic as in_transit (shipment stays in_transit conceptually)
      case "delayed": {
        const lastCompleted = [...sorted].reverse().find((wp) => wp.status === "completed");
        const inTransitWp = sorted.find((wp) => wp.status === "in_transit");
        const nextPendingAfterTransit = inTransitWp
          ? sorted.find((wp) => wp.order > inTransitWp.order && wp.status === "pending")
          : sorted.find((wp) => wp.status === "pending");

        const fromCoord = lastCompleted
          ? (lastCompleted.lat && lastCompleted.lng ? [lastCompleted.lng, lastCompleted.lat] as [number, number] : getCityCoords(lastCompleted.city))
          : originCoords;

        let toCoord: [number, number] | null = null;
        if (inTransitWp) {
          const wpCoord = inTransitWp.lat && inTransitWp.lng
            ? [inTransitWp.lng, inTransitWp.lat] as [number, number]
            : getCityCoords(inTransitWp.city);
          if (wpCoord && fromCoord &&
            Math.abs(wpCoord[0] - fromCoord[0]) < 0.01 &&
            Math.abs(wpCoord[1] - fromCoord[1]) < 0.01) {
            const afterWp = nextPendingAfterTransit;
            toCoord = afterWp
              ? (afterWp.lat && afterWp.lng ? [afterWp.lng, afterWp.lat] as [number, number] : getCityCoords(afterWp.city))
              : destCoords;
          } else {
            toCoord = wpCoord;
          }
        } else {
          toCoord = nextPendingAfterTransit
            ? (nextPendingAfterTransit.lat && nextPendingAfterTransit.lng ? [nextPendingAfterTransit.lng, nextPendingAfterTransit.lat] as [number, number] : getCityCoords(nextPendingAfterTransit.city))
            : destCoords;
        }

        if (fromCoord && toCoord &&
          (Math.abs(fromCoord[0] - toCoord[0]) > 0.01 || Math.abs(fromCoord[1] - toCoord[1]) > 0.01)) {
          currentCoords = [
            fromCoord[0] + (toCoord[0] - fromCoord[0]) * 0.45,
            fromCoord[1] + (toCoord[1] - fromCoord[1]) * 0.45,
          ];
        }
        break;
      }

      default:
        break;
    }
  }

  return { origin: originCoords, destination: destCoords, current: currentCoords };
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
  if (diff < 0) {
    const fh = Math.floor(Math.abs(diff) / 3600000);
    if (fh < 1) return "< 1h";
    if (fh < 24) return `in ${fh}h`;
    return `in ${Math.floor(Math.abs(diff) / 86400000)}d`;
  }
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function TrackPage() {
  const { resolvedTheme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const sourcesAdded = useRef<Set<string>>(new Set());

  const { data, isLoading, refetch } = useMyShipments();
  const shipments = data?.shipments ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);

  // poll shipments every 5s for real-time map updates
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [refetch]);

  const filtered = useMemo(() => {
    if (!searchQuery) return shipments;
    const q = searchQuery.toLowerCase();
    return shipments.filter(
      (s) =>
        s.tracking_id.toLowerCase().includes(q) ||
        s.origin.city?.toLowerCase().includes(q) ||
        s.destination.city?.toLowerCase().includes(q) ||
        s.carrier?.name?.toLowerCase().includes(q)
    );
  }, [shipments, searchQuery]);

  const selected = useMemo(
    () => shipments.find((s) => s._id === selectedId) || null,
    [shipments, selectedId]
  );

  // init mapbox
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let cancelled = false;

    const initMap = async () => {
      if (cancelled || !mapContainerRef.current) return;
      // @ts-ignore
      mapboxgl.accessToken = MAPBOX_TOKEN;

      // @ts-ignore
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
      // @ts-ignore
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

  // theme change
  useEffect(() => {
    if (!mapRef.current) return;
    const style =
      resolvedTheme === "dark"
        ? "mapbox://styles/mapbox/dark-v11"
        : "mapbox://styles/mapbox/light-v11";
    mapRef.current.setStyle(style);
    sourcesAdded.current.clear();
    mapRef.current.once("style.load", () => {
      setMapLoaded((prev) => !prev);
      setTimeout(() => setMapLoaded(true), 100);
    });
  }, [resolvedTheme]);

  // render markers and routes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const map = mapRef.current;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    sourcesAdded.current.forEach((id) => {
      try {
        if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
        if (map.getSource(id)) map.removeSource(id);
      } catch (e) {
        // ignore
      }
    });
    sourcesAdded.current.clear();

    const renderMarkers = () => {
      filtered.forEach((shipment) => {
        const coords = getShipmentCoords(shipment);
        const sc = statusConfig[shipment.status] || statusConfig.pending;
        const isSelected = shipment._id === selectedId;

        // origin
        if (coords.origin) {
          const el = document.createElement("div");
          el.style.cssText = `width:${isSelected ? 14 : 10}px;height:${isSelected ? 14 : 10}px;border-radius:50%;background:#10b981;border:2px solid white;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.3);${isSelected ? "box-shadow:0 0 0 3px rgba(16,185,129,0.3),0 1px 3px rgba(0,0,0,0.3);" : ""}`;

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat(coords.origin)
            .addTo(map);

          el.addEventListener("click", () => setSelectedId(shipment._id));
          markersRef.current.push(marker);
        }

        // destination
        if (coords.destination) {
          const el = document.createElement("div");
          el.style.cssText = `width:${isSelected ? 14 : 10}px;height:${isSelected ? 14 : 10}px;border-radius:50%;background:${sc.markerColor};border:2px solid white;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.3);${isSelected ? `box-shadow:0 0 0 3px ${sc.markerColor}44,0 1px 3px rgba(0,0,0,0.3);` : ""}`;

          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat(coords.destination)
            .addTo(map);

          el.addEventListener("click", () => setSelectedId(shipment._id));
          markersRef.current.push(marker);
        }

        // carrier / current location
        if (
          coords.current &&
          shipment.status !== "delivered" &&
          shipment.status !== "cancelled"
        ) {
          const size = isSelected ? 32 : 24;
          const sw = isSelected ? 2.5 : 2;
          const el = document.createElement("div");
          el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${sc.markerColor}" stroke="white" stroke-width="${sw}"/><path d="M${size * 0.33} ${size / 2}h${size * 0.33}M${size / 2} ${size * 0.33}l${size * 0.17} ${size * 0.17}-${size * 0.17} ${size * 0.17}" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
          el.style.cssText = "cursor:pointer;";

          const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
            .setLngLat(coords.current)
            .addTo(map);

          el.addEventListener("click", () => setSelectedId(shipment._id));
          markersRef.current.push(marker);
        }

        // waypoint markers for selected shipment
        if (isSelected) {
          const wpList = shipment.route_waypoints || [];
          const sortedWps = [...wpList].sort((a, b) => a.order - b.order);
          sortedWps.forEach((wp) => {
            const wpCoord = wp.lat && wp.lng
              ? [wp.lng, wp.lat] as [number, number]
              : getCityCoords(wp.city);
            if (!wpCoord) return;

            const isCompleted = wp.status === "completed";
            const isActive = wp.status === "in_transit";
            const size = isActive ? 12 : 10;
            const color = isCompleted ? "#10b981" : isActive ? sc.markerColor : "#94a3b8";

            const el = document.createElement("div");
            el.style.cssText = `width:${size}px;height:${size}px;border-radius:2px;transform:rotate(45deg);background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:pointer;`;

            const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
              .setLngLat(wpCoord)
              .addTo(map);
            markersRef.current.push(marker);

            // label
            const label = document.createElement("div");
            label.style.cssText = `font-size:9px;color:${color};white-space:nowrap;text-shadow:0 0 3px rgba(0,0,0,0.5);font-weight:500;`;
            label.textContent = wp.city || wp.warehouse_code;
            const labelMarker = new mapboxgl.Marker({ element: label, anchor: "top" })
              .setLngLat(wpCoord)
              .setOffset([0, 10])
              .addTo(map);
            markersRef.current.push(labelMarker);
          });
        }

        // full multi-hop route line for selected
        if (isSelected && coords.origin && coords.destination) {
          const fullRoute = getFullRouteCoords(shipment);
          const routeCoords = fullRoute.length >= 2 ? fullRoute : [coords.origin, coords.destination];

          const sourceId = `route-${shipment._id}`;

          try {
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
                "line-width": 3,
                "line-opacity": 0.5,
                "line-dasharray": [2, 2],
              },
            });

            sourcesAdded.current.add(sourceId);

            // completed portion — origin through completed waypoints
            const wpList = shipment.route_waypoints || [];
            const sortedWps = [...wpList].sort((a, b) => a.order - b.order);
            const completedWps = sortedWps.filter((wp) => wp.status === "completed");
            if (completedWps.length > 0) {
              const completedCoords: [number, number][] = [coords.origin];
              for (const wp of completedWps) {
                const c = wp.lat && wp.lng
                  ? [wp.lng, wp.lat] as [number, number]
                  : getCityCoords(wp.city);
                if (c) completedCoords.push(c);
              }
              // add current position if in transit
              if (coords.current) completedCoords.push(coords.current);

              if (completedCoords.length >= 2) {
                const completedId = `done-${shipment._id}`;
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
            } else if (coords.current) {
              // no completed waypoints yet but we have a current location
              const completedId = `done-${shipment._id}`;
              map.addSource(completedId, {
                type: "geojson",
                data: {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: [coords.origin, coords.current],
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
          } catch (e) {
            // may already exist
          }
        }
      });
    };

    renderMarkers();
  }, [filtered, selectedId, mapLoaded]);

  // fly to selected
  useEffect(() => {
    if (!mapRef.current || !selected) return;

    const coords = getShipmentCoords(selected);
    if (coords.current) {
      mapRef.current.flyTo({ center: coords.current, zoom: 7, duration: 1200 });
    } else if (coords.origin && coords.destination) {
      const bounds = [
        [
          Math.min(coords.origin[0], coords.destination[0]) - 1,
          Math.min(coords.origin[1], coords.destination[1]) - 1,
        ],
        [
          Math.max(coords.origin[0], coords.destination[0]) + 1,
          Math.max(coords.origin[1], coords.destination[1]) + 1,
        ],
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
      {/* sidebar - shipments */}
      <div className="hidden md:flex w-72 lg:w-80 flex-col border-r overflow-hidden">
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Track Shipments</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="h-7 w-7 p-0"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
              />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by ID, city, carrier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading && shipments.length === 0 ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-14 rounded bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Package className="h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No shipments found
              </p>
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
                    isActive
                      ? "bg-primary/5 border-l-2 border-l-primary"
                      : "hover:bg-muted/30 border-l-2 border-l-transparent"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        sc.color,
                        "bg-current/10"
                      )}
                    >
                      <span className={sc.color}>{sc.label}</span>
                    </span>
                    {s.sla_breached && (
                      <span className="text-[10px] text-red-500 font-medium">
                        SLA
                      </span>
                    )}
                    {s.risk_score > 40 && (
                      <span className="text-[10px] text-orange-500">
                        Risk: {s.risk_score}
                      </span>
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
                  {s.estimated_delivery && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      ETA: {formatDate(s.estimated_delivery)}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </ScrollArea>
      </div>

      {/* map */}
      <div className="relative flex-1">
        <div ref={mapContainerRef} className="h-full w-full" />

        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </div>
        )}

        {/* selected shipment panel */}
        {selected && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:bottom-4 md:w-80 bg-background/95 backdrop-blur rounded-lg border shadow-lg overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-xs font-medium",
                    statusConfig[selected.status]?.color || "text-muted-foreground"
                  )}
                >
                  {statusConfig[selected.status]?.label || selected.status}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {selected.tracking_id}
                </span>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* route */}
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="font-medium">
                    {selected.origin.city ||
                      selected.origin.address ||
                      "Origin"}
                  </span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <div className="flex items-center gap-1.5">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{
                      background:
                        statusConfig[selected.status]?.markerColor || "#94a3b8",
                    }}
                  />
                  <span className="font-medium">
                    {selected.destination.city ||
                      selected.destination.address ||
                      "Destination"}
                  </span>
                </div>
              </div>

              {/* details */}
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
                    <p
                      className={cn(
                        "font-medium",
                        selected.sla_breached ? "text-red-500" : ""
                      )}
                    >
                      {formatDate(selected.estimated_delivery)}
                    </p>
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
                  <p className="text-[10px] text-muted-foreground">
                    Risk Score
                  </p>
                  <p
                    className={cn(
                      "font-medium",
                      selected.risk_score > 70
                        ? "text-red-500"
                        : selected.risk_score > 40
                          ? "text-orange-500"
                          : "text-emerald-500"
                    )}
                  >
                    {selected.risk_score}
                  </p>
                </div>
              </div>

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

              {selected.current_location && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  Currently at{" "}
                  {selected.current_location.city ||
                    selected.current_location.address ||
                    "en route"}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground/60">
                Updated {formatRelativeTime(selected.updated_at)}
              </p>
            </div>
          </div>
        )}

        {/* legend */}
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
