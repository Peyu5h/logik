"use client";

import { useQuery } from "@tanstack/react-query";
import api from "~/lib/api/client";
import { getUser } from "~/hooks/useAuth";
import type { ApiResponse, DashboardStats } from "~/lib/types";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  stats: () => [...dashboardKeys.all, "stats"] as const,
};

// fetch ops manager dashboard stats
export function useDashboardStats() {
  const user = getUser();

  return useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");

      const res = await api
        .get("api/admin/dashboard", {
          searchParams: { admin_id: user.id },
        })
        .json<ApiResponse<DashboardStats>>();

      if (!res.success || !res.data) {
        throw new Error(res.error?.[0]?.message ?? "Failed to fetch dashboard stats");
      }

      return res.data;
    },
    enabled: !!user?.id && user.role === "admin",
    staleTime: 1000 * 20,
    refetchInterval: 1000 * 30,
  });
}
