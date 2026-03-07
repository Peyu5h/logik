"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "~/lib/api/client";
import type { ApiResponse, SystemLog, LogsResponse, CreateLogPayload } from "~/lib/types";

export const logKeys = {
  all: ["logs"] as const,
  lists: () => [...logKeys.all, "list"] as const,
  list: () => [...logKeys.lists()] as const,
};

// fetch logs with infinite scroll
export function useLogs() {
  return useInfiniteQuery({
    queryKey: logKeys.list(),
    queryFn: async ({ pageParam = 0 }) => {
      const res = await api
        .get("api/logs", { searchParams: { page: String(pageParam), limit: "50" } })
        .json<ApiResponse<LogsResponse>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch logs");
      }

      return res.data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length;
    },
  });
}

// create a new log entry
export function useCreateLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateLogPayload) => {
      const res = await api
        .post("api/logs", { json: payload })
        .json<ApiResponse<SystemLog>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to create log");
      }

      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: logKeys.list() });
    },
    onError: (error) => {
      toast.error("Failed to create log", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// clear all logs
export function useClearLogs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.delete("api/logs").json<ApiResponse<null>>();

      if (!res.success) {
        throw new Error(res.error?.[0]?.message ?? "Failed to clear logs");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: logKeys.list() });
      toast.success("Logs cleared");
    },
    onError: (error) => {
      toast.error("Failed to clear logs", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}
