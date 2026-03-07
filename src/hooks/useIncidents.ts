"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "~/lib/api/client";
import { getUser } from "~/hooks/useAuth";
import type {
  ApiResponse,
  Incident,
  TicketHistoryItem,
} from "~/lib/types";

export const incidentKeys = {
  all: ["incidents"] as const,
  lists: () => [...incidentKeys.all, "list"] as const,
  list: (filters?: Record<string, string>) => [...incidentKeys.lists(), filters] as const,
  escalated: () => [...incidentKeys.all, "escalated"] as const,
  detail: (id: string) => [...incidentKeys.all, "detail", id] as const,
  messages: (id: string) => [...incidentKeys.all, "messages", id] as const,
};

// fetch all incidents (admin only)
export function useIncidents(filters?: Record<string, string>) {
  const user = getUser();

  return useQuery({
    queryKey: incidentKeys.list(filters),
    queryFn: async () => {
      if (!user?.id) return { incidents: [], total: 0 };

      const searchParams: Record<string, string> = { admin_id: user.id };
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value && value !== "all") searchParams[key] = value;
        });
      }

      const res = await api
        .get("api/admin/incidents", { searchParams })
        .json<ApiResponse<{ incidents: Incident[]; total: number }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch incidents");
      }

      return res.data;
    },
    enabled: !!user?.id && user.role === "admin",
  });
}

// fetch escalated incidents only
export function useEscalatedIncidents() {
  const user = getUser();

  return useQuery({
    queryKey: incidentKeys.escalated(),
    queryFn: async () => {
      if (!user?.id) return { incidents: [], total: 0 };

      const res = await api
        .get("api/admin/incidents/escalated", {
          searchParams: { admin_id: user.id },
        })
        .json<ApiResponse<{ incidents: Incident[]; total: number }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch escalated incidents");
      }

      return res.data;
    },
    enabled: !!user?.id && user.role === "admin",
  });
}

// fetch single incident detail
export function useIncident(incidentId: string | null) {
  return useQuery({
    queryKey: incidentKeys.detail(incidentId ?? ""),
    queryFn: async () => {
      if (!incidentId) return null;

      const res = await api
        .get(`api/admin/incidents/${incidentId}`)
        .json<ApiResponse<{ incident: Incident }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch incident");
      }

      return res.data.incident;
    },
    enabled: !!incidentId,
  });
}

// fetch messages for an incident (polling)
export function useIncidentMessages(incidentId: string | null, since?: string) {
  return useQuery({
    queryKey: incidentKeys.messages(incidentId ?? ""),
    queryFn: async () => {
      if (!incidentId) return [];

      const searchParams: Record<string, string> = {};
      if (since) searchParams.since = since;

      const res = await api
        .get(`api/admin/incidents/${incidentId}/messages`, {
          searchParams: Object.keys(searchParams).length ? searchParams : undefined,
        })
        .json<ApiResponse<{ messages: TicketHistoryItem[] }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch messages");
      }

      return res.data.messages;
    },
    enabled: !!incidentId,
    refetchInterval: 3000,
  });
}

// send message as ops manager on an incident
export function useSendIncidentMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      incidentId,
      admin_id,
      content,
    }: {
      incidentId: string;
      admin_id: string;
      content: string;
    }) => {
      const res = await api
        .post(`api/admin/incidents/${incidentId}/message`, {
          json: { admin_id, content },
        })
        .json<ApiResponse<{ message: string; content: string; timestamp: string; is_human: boolean }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to send message");
      }

      return res.data;
    },
    onSuccess: (_, { incidentId }) => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.messages(incidentId) });
      queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
      queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
    },
    onError: (error) => {
      toast.error("Failed to send message", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// escalate an incident
export function useEscalateIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      incidentId,
      reason,
    }: {
      incidentId: string;
      reason?: string;
    }) => {
      const res = await api
        .post(`api/admin/incidents/${incidentId}/escalate`, {
          json: { reason },
        })
        .json<ApiResponse<{ _id: string; incident_id: string; is_escalated: boolean; status: string }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to escalate incident");
      }

      return res.data;
    },
    onSuccess: (_, { incidentId }) => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: incidentKeys.escalated() });
      queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
      toast.success("Incident escalated");
    },
    onError: (error) => {
      toast.error("Failed to escalate incident", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// resolve an incident
export function useResolveIncident() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      incidentId,
      admin_id,
      resolution,
    }: {
      incidentId: string;
      admin_id: string;
      resolution?: string;
    }) => {
      const res = await api
        .patch(`api/admin/incidents/${incidentId}/resolve`, {
          json: { admin_id, resolution },
        })
        .json<ApiResponse<{ _id: string; incident_id: string; status: string; is_escalated: boolean; resolution: string }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to resolve incident");
      }

      return res.data;
    },
    onSuccess: (_, { incidentId }) => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: incidentKeys.escalated() });
      queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
      toast.success("Incident resolved");
    },
    onError: (error) => {
      toast.error("Failed to resolve incident", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// update incident severity
export function useUpdateIncidentSeverity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      incidentId,
      severity,
    }: {
      incidentId: string;
      severity: string;
    }) => {
      const res = await api
        .patch(`api/admin/incidents/${incidentId}/severity`, {
          json: { severity },
        })
        .json<ApiResponse<{ _id: string; incident_id: string; severity: string }>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to update severity");
      }

      return res.data;
    },
    onSuccess: (_, { incidentId }) => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: incidentKeys.detail(incidentId) });
      toast.success("Incident severity updated");
    },
    onError: (error) => {
      toast.error("Failed to update severity", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}
