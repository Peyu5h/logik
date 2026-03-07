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
  role: "consumer" | "admin";
  createdAt: string;
}

// shipment types

export interface Location {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  region?: string;
}

export interface Dimensions {
  length: number;
  width: number;
  height: number;
  unit: string;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  label?: string;
  timestamp: string;
  status?: string;
}

export type ShipmentStatus =
  | "pending"
  | "picked_up"
  | "in_transit"
  | "at_warehouse"
  | "out_for_delivery"
  | "delivered"
  | "delayed"
  | "cancelled"
  | "returned"
  | "lost";

export type Priority = "low" | "medium" | "high" | "urgent";
export type Severity = "low" | "medium" | "high" | "critical";

export interface ShipmentCarrier {
  _id?: string;
  id?: string;
  name: string;
  code: string;
  reliabilityScore?: number;
  reliability_score?: number;
}

export interface ShipmentWarehouse {
  _id?: string;
  id?: string;
  name: string;
  code: string;
  status?: string;
  congestionLevel?: string;
  congestion_level?: string;
}

export interface ShipmentIncidentRef {
  _id: string;
  incident_id: string;
  type: string;
  severity: Severity;
  status: string;
}

export interface Shipment {
  _id: string;
  tracking_id: string;
  consumer_id: string;
  consumer?: { id: string; name: string; email: string };
  status: ShipmentStatus;
  priority: Priority;
  origin: Location;
  destination: Location;
  current_location: Location | null;
  carrier: ShipmentCarrier | null;
  warehouse: ShipmentWarehouse | null;
  estimated_delivery: string | null;
  actual_delivery: string | null;
  weight: number | null;
  dimensions: Dimensions | null;
  route_history: RoutePoint[];
  sla_deadline: string | null;
  sla_breached: boolean;
  risk_score: number;
  agent_notes: string | null;
  incidents: ShipmentIncidentRef[];
  created_at: string;
  updated_at: string;
}

export interface ShipmentStats {
  total: number;
  in_transit: number;
  delayed: number;
  delivered: number;
  pending: number;
  at_warehouse: number;
  sla_breached: number;
  high_risk: number;
  avg_risk_score: number;
  on_time_rate: number;
}

// carrier types

export interface Carrier {
  _id: string;
  name: string;
  code: string;
  reliability_score: number;
  avg_delivery_time: number | null;
  active_shipments: number;
  total_deliveries: number;
  on_time_rate: number;
  failure_rate: number;
  regions: string[];
  is_active: boolean;
  last_incident: string | null;
}

// warehouse types

export type WarehouseStatus = "operational" | "degraded" | "congested" | "offline" | "maintenance";
export type CongestionLevel = "low" | "moderate" | "high" | "critical";

export interface Warehouse {
  _id: string;
  name: string;
  code: string;
  location: Location;
  capacity: number;
  current_load: number;
  utilization_pct: number;
  throughput_rate: number;
  status: WarehouseStatus;
  congestion_level: CongestionLevel;
  avg_process_time: number;
  regions: string[];
  is_active: boolean;
  shipment_count?: number;
  inventory_count?: number;
  inventory?: InventoryItem[];
  active_shipments?: Array<{
    _id: string;
    tracking_id: string;
    status: string;
    priority: string;
    risk_score: number;
    estimated_delivery: string | null;
  }>;
  created_at: string;
  updated_at: string;
}

export interface WarehouseStats {
  total_warehouses: number;
  total_capacity: number;
  total_load: number;
  avg_utilization: number;
  avg_process_time: number;
  congested_count: number;
  degraded_count: number;
  low_stock_items: number;
}

export interface InventoryItem {
  _id: string;
  sku: string;
  name: string;
  quantity: number;
  reserved: number;
  available: number;
  reorder_point: number;
  low_stock: boolean;
  last_restocked: string | null;
  warehouse_id?: string;
}

// incident types

export type IncidentType =
  | "delay"
  | "damage"
  | "lost_package"
  | "wrong_route"
  | "warehouse_congestion"
  | "carrier_failure"
  | "sla_breach"
  | "inventory_mismatch"
  | "eta_deviation"
  | "cascading_delay"
  | "weather_disruption"
  | "customs_hold";

export type IncidentStatus = "open" | "investigating" | "in_progress" | "escalated" | "resolved" | "closed";

export interface AgentDecision {
  action: string;
  reasoning: string;
  confidence: number;
  autonomous: boolean;
  approvedBy?: string;
  executedAt?: string;
}

export interface Incident {
  _id: string;
  incident_id: string;
  shipment_id: string | null;
  shipment: {
    _id: string;
    tracking_id: string;
    status: ShipmentStatus;
    priority: Priority;
    origin: Location;
    destination: Location;
    current_location: Location | null;
    risk_score: number;
    sla_breached: boolean;
    sla_deadline: string | null;
    carrier: ShipmentCarrier | null;
    warehouse: ShipmentWarehouse | null;
    consumer: { id: string; name: string; email: string } | null;
  } | null;
  assigned_agent: { id: string; name: string; email: string } | null;
  type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  title: string;
  description: string | null;
  root_cause: string | null;
  resolution: string | null;
  is_escalated: boolean;
  escalated_at: string | null;
  agent_decision: AgentDecision | null;
  risk_score: number;
  affected_count: number;
  chat_history: TicketHistoryItem[];
  created_at: string;
  updated_at: string;
}

// agent types

export type ActionType =
  | "reroute"
  | "reprioritize"
  | "escalate"
  | "reallocate_inventory"
  | "adjust_schedule"
  | "notify_consumer"
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
  issue_type?: IncidentType | string;
  root_cause?: string;
  assumptions?: string[];
  uncertainties?: string[];
  risk_factors?: string[];
  recommended_action?: string;
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

export interface AgentResponse {
  shipment_id: string | null;
  agent_message: string | null;
  cards: ActionCard[];
  tools_used?: string[];
  actions_taken?: string[];
  is_escalated?: boolean;
  reasoning?: AgentReasoning;
  confidence_score?: number;
}

export interface AgentAction {
  _id: string;
  action_id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  description: string;
  reasoning: string | null;
  confidence: number;
  outcome: string | null;
  was_correct: boolean | null;
  required_human: boolean;
  executed_at: string;
  evaluated_at: string | null;
  metadata: Record<string, unknown> | null;
}

// dashboard types

export interface DashboardOverview {
  total_shipments: number;
  active_shipments: number;
  delayed_shipments: number;
  sla_breached: number;
  open_incidents: number;
  critical_incidents: number;
  escalated_incidents: number;
  congested_warehouses: number;
}

export interface DashboardStats {
  overview: DashboardOverview;
  recent_agent_actions: Array<{
    action_id: string;
    action_type: string;
    description: string;
    confidence: number;
    outcome: string | null;
    required_human: boolean;
    executed_at: string;
  }>;
  top_carriers: Array<{
    name: string;
    code: string;
    reliability_score: number;
    on_time_rate: number;
    active_shipments: number;
  }>;
  warehouse_status: Array<{
    name: string;
    code: string;
    status: WarehouseStatus;
    congestion_level: CongestionLevel;
    utilization_pct: number;
    throughput_rate: number;
  }>;
}

// log types

export interface SystemLog {
  id: string;
  timestamp: string;
  event_type: string;
  source: string;
  severity: Severity;
  message: string;
  trace_id?: string;
  metadata?: Record<string, unknown> | null;
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
  metadata?: Record<string, unknown>;
}

// auth types

export interface SignInRequest {
  email: string;
  password: string;
}

export interface SignUpRequest {
  name: string;
  email: string;
  password: string;
}

// send message payload
export interface SendMessagePayload {
  shipment_id: string | null;
  consumer_id: string;
  message: {
    content: string;
  };
}
