// re-exports for backwards compatibility with agent components
import api from "./client";
import type {
  ActionCard,
  AgentReasoning,
  TicketHistoryItem,
  Incident,
  ActionType,
} from "~/lib/types";

export type { ActionCard, AgentReasoning, TicketHistoryItem, ActionType };

export type Ticket = Incident;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// fetches chat history for a shipment/incident
export async function fetchChatHistory(
  shipmentId: string
): Promise<TicketHistoryItem[]> {
  try {
    const res = await api
      .get(`api/admin/incidents/${shipmentId}/messages`)
      .json<{
        success: boolean;
        data?: { messages: TicketHistoryItem[] };
      }>();
    return res.data?.messages || [];
  } catch {
    return [];
  }
}

// fetches messages for admin chat panel
export async function fetchTicketMessagesAdmin(
  incidentId: string,
  since?: string
): Promise<TicketHistoryItem[]> {
  try {
    const params: Record<string, string> = {};
    if (since) params.since = since;

    const res = await api
      .get(`api/admin/incidents/${incidentId}/messages`, {
        searchParams: Object.keys(params).length ? params : undefined,
      })
      .json<{
        success: boolean;
        data?: { messages: TicketHistoryItem[] };
      }>();
    return res.data?.messages || [];
  } catch {
    return [];
  }
}

// sends admin message on an incident
export async function sendAdminMessage(
  incidentId: string,
  adminId: string,
  content: string
): Promise<{ success: boolean }> {
  try {
    const res = await api
      .post(`api/admin/incidents/${incidentId}/message`, {
        json: { admin_id: adminId, content },
      })
      .json<{ success: boolean }>();
    return res;
  } catch {
    return { success: false };
  }
}

// escalates a ticket/incident
export async function escalateTicket(
  incidentId: string,
  reason?: string
): Promise<{ success: boolean }> {
  try {
    const res = await api
      .post(`api/admin/incidents/${incidentId}/escalate`, {
        json: { reason: reason || "Escalated by user" },
      })
      .json<{ success: boolean }>();
    return res;
  } catch {
    return { success: false };
  }
}

// resolves a ticket/incident
export async function resolveTicketAdmin(
  incidentId: string,
  adminId: string,
  resolution: string
): Promise<{ success: boolean }> {
  try {
    const res = await api
      .patch(`api/admin/incidents/${incidentId}/resolve`, {
        json: { admin_id: adminId, resolution },
      })
      .json<{ success: boolean }>();
    return res;
  } catch {
    return { success: false };
  }
}
