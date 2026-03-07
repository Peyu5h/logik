const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const config = {
  api: {
    baseUrl: API_BASE_URL,
    agent: `${API_BASE_URL}/api/agent`,
    tickets: `${API_BASE_URL}/api/tickets`,
    chatHistory: `${API_BASE_URL}/api/chat-history`,
    admin: {
      assignedTickets: `${API_BASE_URL}/api/admin/assigned-tickets`,
      ticketMessages: (ticketId: string) =>
        `${API_BASE_URL}/api/admin/tickets/${ticketId}/messages`,
      sendMessage: (ticketId: string) =>
        `${API_BASE_URL}/api/admin/tickets/${ticketId}/message`,
      escalate: (ticketId: string) =>
        `${API_BASE_URL}/api/admin/tickets/${ticketId}/escalate`,
      resolve: (ticketId: string) =>
        `${API_BASE_URL}/api/admin/tickets/${ticketId}/resolve`,
    },
    logs: `${API_BASE_URL}/api/logs`,
    docs: {
      get: `${API_BASE_URL}/api/docs`,
      update: `${API_BASE_URL}/api/docs/update`,
      check: `${API_BASE_URL}/api/docs/check`,
    },
    github: {
      createIssue: `${API_BASE_URL}/api/github/issue`,
      getIssue: (issueId: string) => `${API_BASE_URL}/api/github/issue/${issueId}`,
    },
  },
  actions: {
    rotateKeys: `${API_BASE_URL}/api/actions/rotate-keys`,
    escalate: `${API_BASE_URL}/api/actions/escalate`,
    increaseRateLimit: `${API_BASE_URL}/api/actions/increase-rate-limit`,
    resendWebhooks: `${API_BASE_URL}/api/actions/resend-webhooks`,
    updateDocs: `${API_BASE_URL}/api/docs/update`,
    createGithubIssue: `${API_BASE_URL}/api/github/issue`,
  },
} as const;

export type Config = typeof config;
