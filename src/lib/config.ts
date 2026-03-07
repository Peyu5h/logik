const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const config = {
  api: {
    baseUrl: API_BASE_URL,
    shipments: {
      list: `${API_BASE_URL}/api/shipments`,
      stats: `${API_BASE_URL}/api/shipments/stats`,
      detail: (id: string) => `${API_BASE_URL}/api/shipments/${id}`,
      create: `${API_BASE_URL}/api/shipments`,
      updateStatus: (id: string) => `${API_BASE_URL}/api/shipments/${id}/status`,
      updateRisk: (id: string) => `${API_BASE_URL}/api/shipments/${id}/risk`,
      reroute: (id: string) => `${API_BASE_URL}/api/shipments/${id}/reroute`,
      agent: `${API_BASE_URL}/api/shipments/agent`,
    },
    warehouses: {
      list: `${API_BASE_URL}/api/warehouses`,
      stats: `${API_BASE_URL}/api/warehouses/stats`,
      detail: (id: string) => `${API_BASE_URL}/api/warehouses/${id}`,
      updateStatus: (id: string) => `${API_BASE_URL}/api/warehouses/${id}/status`,
      inventory: (id: string) => `${API_BASE_URL}/api/warehouses/${id}/inventory`,
      updateInventory: (itemId: string) => `${API_BASE_URL}/api/warehouses/inventory/${itemId}`,
      carriers: `${API_BASE_URL}/api/warehouses/carriers`,
      agentActions: `${API_BASE_URL}/api/warehouses/agent-actions`,
      evaluateAction: (actionId: string) => `${API_BASE_URL}/api/warehouses/agent-actions/${actionId}/evaluate`,
    },
    admin: {
      dashboard: `${API_BASE_URL}/api/admin/dashboard`,
      incidents: `${API_BASE_URL}/api/admin/incidents`,
      escalatedIncidents: `${API_BASE_URL}/api/admin/incidents/escalated`,
      incidentDetail: (id: string) => `${API_BASE_URL}/api/admin/incidents/${id}`,
      incidentMessages: (id: string) => `${API_BASE_URL}/api/admin/incidents/${id}/messages`,
      sendMessage: (id: string) => `${API_BASE_URL}/api/admin/incidents/${id}/message`,
      escalate: (id: string) => `${API_BASE_URL}/api/admin/incidents/${id}/escalate`,
      resolve: (id: string) => `${API_BASE_URL}/api/admin/incidents/${id}/resolve`,
      updateSeverity: (id: string) => `${API_BASE_URL}/api/admin/incidents/${id}/severity`,
    },
    logs: `${API_BASE_URL}/api/logs`,
    auth: {
      signIn: `${API_BASE_URL}/api/auth/signin`,
      signUp: `${API_BASE_URL}/api/auth/signup`,
    },
    health: `${API_BASE_URL}/api/health`,
  },
} as const;

export type Config = typeof config;
