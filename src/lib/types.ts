export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: Array<{
    message: string;
    code?: string;
    path?: string[];
  }>;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
}

export type ActionType =
  | "escalate"
  | "update_docs"
  | "create_github_issue"
  | "resend_webhook"
  | "rotate_api_keys"
  | "generic";

export interface ActionCard {
  id: string;
  type: "action_button" | "link";
  label: string;
  style?: "primary" | "secondary" | "destructive";
  url?: string;
  action_payload?: {
    action_type?: ActionType;
    webhook_to_call: string;
    params: Record<string, unknown>;
  };
}

export interface AgentReasoning {
  issue_type?: "migration_issue" | "platform_bug" | "documentation_gap" | "merchant_config" | "unknown";
  root_cause?: string;
  assumptions?: string[];
  uncertainties?: string[];
}

export interface TicketHistoryItem {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  cards?: ActionCard[];
  tools_used?: string[];
  actions_taken?: string[];
  reasoning?: AgentReasoning;
  confidence_score?: number;
  complexity_score?: number;
  is_human?: boolean;
}

export interface MerchantInfo {
  id: string;
  name: string;
  email: string;
}

export interface Ticket {
  _id: string;
  ticket_id: string;
  merchant_id: string;
  merchant?: MerchantInfo;
  assigned_agent_id?: string;
  status: "open" | "in_progress" | "escalated" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  title?: string;
  is_escalated?: boolean;
  escalated_at?: string;
  chat_history: TicketHistoryItem[];
  created_at: string;
  updated_at: string;
}

export interface AgentResponse {
  ticket_id: string;
  agent_message: string | null;
  cards: ActionCard[];
  tools_used?: string[];
  actions_taken?: string[];
  is_escalated?: boolean;
  reasoning?: AgentReasoning;
  confidence_score?: number;
  complexity_score?: number;
}

export interface SendMessagePayload {
  _id: string | null;
  merchant_id: string;
  message: {
    content: string;
  };
}

export interface TicketStatusPayload {
  status: "open" | "in_progress" | "escalated" | "resolved" | "closed";
}

export interface TicketPriorityPayload {
  priority: "low" | "medium" | "high" | "urgent";
}

export interface EscalateTicketPayload {
  merchant_id: string;
}

export interface EscalateTicketResponse {
  _id: string;
  is_escalated: boolean;
  escalated_at: string;
  status: string;
  system_message: string;
}

export interface AdminMessagePayload {
  admin_id: string;
  content: string;
}

export interface AdminMessageResponse {
  message: string;
  content: string;
  timestamp: string;
  is_human: boolean;
}

export interface ResolveTicketPayload {
  admin_id: string;
}

export interface AnalyticsData {
  signal_frequency: SignalFrequency[];
  top_errors: TopError[];
  unique_merchants: number;
}

export interface TopError {
  error_code: string;
  count: number;
}

export interface SignalFrequency {
  date: string;
  count: number;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  event_type: string;
  source: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  trace_id?: string;
}

export interface LogsResponse {
  logs: SystemLog[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CreateLogPayload {
  id: string;
  timestamp: string;
  event_type: string;
  source: string;
  severity: string;
  message: string;
  trace_id?: string;
}

export interface DocsUpdatePayload {
  operation: "add" | "remove" | "reset";
  section?: string;
  content?: string;
}

export interface DocsUpdateResponse {
  message: string;
  action_taken: string;
  operation: string;
}

export interface GithubIssuePayload {
  title: string;
  description: string;
  issue_type?: string;
  severity?: string;
  merchant_id?: string;
  ticket_id?: string;
  error_code?: string;
  reproduction_steps?: string;
  expected_behavior?: string;
  actual_behavior?: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface SignUpRequest {
  name: string;
  email: string;
  password: string;
}
