"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "~/lib/api/client";
import type {
  ApiResponse,
  Warehouse,
  WarehouseStats,
  Carrier,
  InventoryItem,
  AgentAction,
} from "~/lib/types";

export const warehouseKeys = {
  all: ["warehouses"] as const,
  lists: () => [...warehouseKeys.all, "list"] as const,
  list: (filters?: Record<string, string>) => [...warehouseKeys.lists(), filters] as const,
  detail: (id: string) => [...warehouseKeys.all, "detail", id] as const,
  stats: () => [...warehouseKeys.all, "stats"] as const,
  inventory: (warehouseId: string) => [...warehouseKeys.all, "inventory", warehouseId] as const,
};

export const carrierKeys = {
  all: ["carriers"] as const,
  list: (region?: string) => [...carrierKeys.all, "list", region] as const,
};

export const agentActionKeys = {
  all: ["agent-actions"] as const,
  list: () => [...agentActionKeys.all, "list"] as const,
};

// fetch all warehouses
export function useWarehouses(filters?: Record<string, string>) {
  return useQuery({
    queryKey: warehouseKeys.list(filters),
    queryFn: async () => {
      const searchParams: Record<string, string> = {};
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value && value !== "all") searchParams[key] = value;
        });
      }

      const res = await api
        .get("api/warehouses", {
          searchParams: Object.keys(searchParams).length ? searchParams : undefined,
        })
        .json<ApiResponse<{ warehouses: Warehouse[]; total: number }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch warehouses");
      }

      return res.data;
    },
  });
}

// fetch single warehouse with inventory and active shipments
export function useWarehouse(warehouseId: string | null) {
  return useQuery({
    queryKey: warehouseKeys.detail(warehouseId ?? ""),
    queryFn: async () => {
      if (!warehouseId) return null;

      const res = await api
        .get(`api/warehouses/${warehouseId}`)
        .json<ApiResponse<{ warehouse: Warehouse }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch warehouse");
      }

      return res.data.warehouse;
    },
    enabled: !!warehouseId,
  });
}

// fetch warehouse stats overview
export function useWarehouseStats() {
  return useQuery({
    queryKey: warehouseKeys.stats(),
    queryFn: async () => {
      const res = await api
        .get("api/warehouses/stats")
        .json<ApiResponse<{ stats: WarehouseStats }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch warehouse stats");
      }

      return res.data.stats;
    },
    staleTime: 1000 * 30,
  });
}

// fetch inventory for a specific warehouse
export function useWarehouseInventory(warehouseId: string | null, lowStockOnly?: boolean) {
  return useQuery({
    queryKey: warehouseKeys.inventory(warehouseId ?? ""),
    queryFn: async () => {
      if (!warehouseId) return { inventory: [], total: 0 };

      const searchParams: Record<string, string> = {};
      if (lowStockOnly) searchParams.low_stock = "true";

      const res = await api
        .get(`api/warehouses/${warehouseId}/inventory`, {
          searchParams: Object.keys(searchParams).length ? searchParams : undefined,
        })
        .json<ApiResponse<{ inventory: InventoryItem[]; total: number }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch inventory");
      }

      return res.data;
    },
    enabled: !!warehouseId,
  });
}

// update warehouse status and congestion
export function useUpdateWarehouseStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      warehouseId,
      status,
      congestion_level,
      current_load,
      throughput_rate,
    }: {
      warehouseId: string;
      status?: string;
      congestion_level?: string;
      current_load?: number;
      throughput_rate?: number;
    }) => {
      const res = await api
        .patch(`api/warehouses/${warehouseId}/status`, {
          json: { status, congestion_level, current_load, throughput_rate },
        })
        .json<ApiResponse<{ _id: string; code: string; status: string; congestion_level: string; utilization_pct: number }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to update warehouse status");
      }

      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: warehouseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: warehouseKeys.stats() });
      if (data._id) {
        queryClient.invalidateQueries({ queryKey: warehouseKeys.detail(data._id) });
      }
      toast.success("Warehouse status updated");
    },
    onError: (error) => {
      toast.error("Failed to update warehouse status", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// update inventory item quantity
export function useUpdateInventory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      quantity,
      reserved,
    }: {
      itemId: string;
      quantity?: number;
      reserved?: number;
    }) => {
      const res = await api
        .patch(`api/warehouses/inventory/${itemId}`, {
          json: { quantity, reserved },
        })
        .json<ApiResponse<{ _id: string; sku: string; quantity: number; reserved: number; available: number }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to update inventory");
      }

      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: warehouseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: warehouseKeys.stats() });
      toast.success("Inventory updated");
    },
    onError: (error) => {
      toast.error("Failed to update inventory", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// fetch all carriers
export function useCarriers(region?: string) {
  return useQuery({
    queryKey: carrierKeys.list(region),
    queryFn: async () => {
      const searchParams: Record<string, string> = {};
      if (region && region !== "all") searchParams.region = region;

      const res = await api
        .get("api/warehouses/carriers", {
          searchParams: Object.keys(searchParams).length ? searchParams : undefined,
        })
        .json<ApiResponse<{ carriers: Carrier[]; total: number }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch carriers");
      }

      return res.data;
    },
  });
}

// fetch agent actions (learn loop)
export function useAgentActions(limit?: number) {
  return useQuery({
    queryKey: agentActionKeys.list(),
    queryFn: async () => {
      const searchParams: Record<string, string> = {};
      if (limit) searchParams.limit = String(limit);

      const res = await api
        .get("api/warehouses/agent-actions", {
          searchParams: Object.keys(searchParams).length ? searchParams : undefined,
        })
        .json<ApiResponse<{ actions: AgentAction[]; total: number }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch agent actions");
      }

      return res.data;
    },
    staleTime: 1000 * 15,
  });
}

// evaluate agent action outcome (learn loop feedback)
export function useEvaluateAgentAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      actionId,
      was_correct,
      outcome,
    }: {
      actionId: string;
      was_correct: boolean;
      outcome?: string;
    }) => {
      const res = await api
        .patch(`api/warehouses/agent-actions/${actionId}/evaluate`, {
          json: { was_correct, outcome },
        })
        .json<ApiResponse<{ action_id: string; was_correct: boolean; outcome: string }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to evaluate agent action");
      }

      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentActionKeys.list() });
      toast.success("Agent action evaluated");
    },
    onError: (error) => {
      toast.error("Failed to evaluate agent action", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}
