"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "~/lib/api/client";
import { getUser } from "~/hooks/useAuth";
import type {
  ApiResponse,
  Shipment,
  ShipmentStats,
  AgentResponse,
  SendMessagePayload,
} from "~/lib/types";

export const shipmentKeys = {
  all: ["shipments"] as const,
  lists: () => [...shipmentKeys.all, "list"] as const,
  list: (filters?: Record<string, string>) => [...shipmentKeys.lists(), filters] as const,
  detail: (id: string) => [...shipmentKeys.all, "detail", id] as const,
  stats: () => [...shipmentKeys.all, "stats"] as const,
};

// fetch all shipments with optional filters
export function useShipments(
  filters?: Record<string, string>,
  options?: { refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: shipmentKeys.list(filters),
    queryFn: async () => {
      const searchParams: Record<string, string> = {};
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value && value !== "all") searchParams[key] = value;
        });
      }

      const res = await api
        .get("api/shipments", {
          searchParams: Object.keys(searchParams).length ? searchParams : undefined,
        })
        .json<ApiResponse<{ shipments: Shipment[]; total: number }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch shipments");
      }

      return res.data;
    },
    refetchInterval: options?.refetchInterval ?? false,
  });
}

// fetch shipments for current consumer
export function useMyShipments() {
  const user = getUser();

  return useQuery({
    queryKey: shipmentKeys.list({ consumer_id: user?.id ?? "" }),
    queryFn: async () => {
      if (!user?.id) return { shipments: [], total: 0 };

      const res = await api
        .get("api/shipments", { searchParams: { consumer_id: user.id } })
        .json<ApiResponse<{ shipments: Shipment[]; total: number }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch shipments");
      }

      return res.data;
    },
    enabled: !!user?.id,
  });
}

// fetch single shipment by id
export function useShipment(shipmentId: string | null) {
  return useQuery({
    queryKey: shipmentKeys.detail(shipmentId ?? ""),
    queryFn: async () => {
      if (!shipmentId) return null;

      const res = await api
        .get(`api/shipments/${shipmentId}`)
        .json<ApiResponse<{ shipment: Shipment }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch shipment");
      }

      return res.data.shipment;
    },
    enabled: !!shipmentId,
  });
}

// fetch shipment stats overview
export function useShipmentStats() {
  return useQuery({
    queryKey: shipmentKeys.stats(),
    queryFn: async () => {
      const res = await api
        .get("api/shipments/stats")
        .json<ApiResponse<{ stats: ShipmentStats }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch shipment stats");
      }

      return res.data.stats;
    },
    staleTime: 1000 * 30,
  });
}

// update shipment status
export function useUpdateShipmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shipmentId,
      status,
      current_location,
      agent_notes,
    }: {
      shipmentId: string;
      status: string;
      current_location?: { lat: number; lng: number; address?: string; city?: string };
      agent_notes?: string;
    }) => {
      const res = await api
        .patch(`api/shipments/${shipmentId}/status`, {
          json: { status, current_location, agent_notes },
        })
        .json<ApiResponse<{ shipment: Shipment }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to update status");
      }

      return res.data.shipment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: shipmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: shipmentKeys.stats() });
      if (data._id) {
        queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(data._id) });
      }
      toast.success("Shipment status updated");
    },
    onError: (error) => {
      toast.error("Failed to update shipment status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// reroute shipment to different carrier
export function useRerouteShipment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shipmentId,
      carrier_id,
      reason,
    }: {
      shipmentId: string;
      carrier_id: string;
      reason?: string;
    }) => {
      const res = await api
        .post(`api/shipments/${shipmentId}/reroute`, {
          json: { carrier_id, reason },
        })
        .json<ApiResponse<{ shipment: Shipment }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to reroute shipment");
      }

      return res.data.shipment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: shipmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: shipmentKeys.stats() });
      if (data._id) {
        queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(data._id) });
      }
      toast.success("Shipment rerouted successfully");
    },
    onError: (error) => {
      toast.error("Failed to reroute shipment", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// update risk score
export function useUpdateRiskScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shipmentId,
      risk_score,
      agent_notes,
    }: {
      shipmentId: string;
      risk_score: number;
      agent_notes?: string;
    }) => {
      const res = await api
        .patch(`api/shipments/${shipmentId}/risk`, {
          json: { risk_score, agent_notes },
        })
        .json<ApiResponse<{ shipment: Shipment }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to update risk score");
      }

      return res.data.shipment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shipmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: shipmentKeys.stats() });
    },
    onError: (error) => {
      toast.error("Failed to update risk score", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// send message to agent about shipment
export function useSendAgentMessage() {
  const queryClient = useQueryClient();
  const user = getUser();

  return useMutation({
    mutationFn: async (payload: SendMessagePayload) => {
      const res = await api
        .post("api/shipments/agent", { json: payload })
        .json<ApiResponse<AgentResponse>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to send message");
      }

      return res.data;
    },
    onSuccess: (data) => {
      if (data.shipment_id) {
        queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(data.shipment_id) });
      }
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: shipmentKeys.lists() });
      }
    },
    onError: (error) => {
      toast.error("Failed to send message", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// create new shipment
export function useCreateShipment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      consumer_id: string;
      origin: { lat: number; lng: number; address?: string; city?: string; region?: string };
      destination: { lat: number; lng: number; address?: string; city?: string; region?: string };
      priority?: string;
      weight?: number;
      dimensions?: { length: number; width: number; height: number; unit: string };
      carrier_id?: string;
      warehouse_id?: string;
      sla_hours?: number;
    }) => {
      const res = await api
        .post("api/shipments", { json: payload })
        .json<ApiResponse<{ shipment: Shipment }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to create shipment");
      }

      return res.data.shipment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shipmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: shipmentKeys.stats() });
      toast.success("Shipment created");
    },
    onError: (error) => {
      toast.error("Failed to create shipment", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}
