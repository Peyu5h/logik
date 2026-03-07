// re-export types from api/tickets for consistency
export type {
  ActionType,
  ActionCard,
  AgentReasoning,
  TicketHistoryItem,
  Ticket,
} from "~/lib/api/tickets";

// webhook request payload
export interface TicketMessagePayload {
  _id: string | null;
  merchant_id: string;
  message: {
    content: string;
  };
}

// webhook response structure
export interface AgentResponse {
  ticket_id: string;
  agent_message: string | null;
  cards: import("~/lib/api/tickets").ActionCard[];
  tools_used?: string[];
  actions_taken?: string[];
  is_escalated?: boolean;
  reasoning?: import("~/lib/api/tickets").AgentReasoning;
  confidence_score?: number;
  complexity_score?: number;
}

// reasoning step for chain of thought display
export interface ReasoningStep {
  id: string;
  label: string;
  status: "pending" | "active" | "complete" | "error";
}

// chat message for UI
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  cards?: import("~/lib/api/tickets").ActionCard[];
  ticketId?: string;
  reasoning?: ReasoningStep[];
  agentReasoning?: import("~/lib/api/tickets").AgentReasoning;
  toolsUsed?: string[];
  actionsTaken?: string[];
  isHuman?: boolean;
  confidenceScore?: number;
  complexityScore?: number;
}
