import { Request, Response } from "express";
import prisma from "../config/database.js";
import ApiResponse from "../utils/apiResponse.js";
import { config } from "../config/env.js";

// get all incidents (for ops manager)
export const getIncidents = async (req: Request, res: Response) => {
  try {
    const { admin_id, status, severity, type } = req.query;

    if (!admin_id || typeof admin_id !== "string") {
      return ApiResponse.error(res, "admin_id is required", 400);
    }

    const admin = await prisma.user.findUnique({
      where: { id: admin_id },
    });

    if (!admin || admin.role !== "admin") {
      return ApiResponse.unauthorized(res, "Not authorized as operations manager");
    }

    const where: any = {};
    if (status && typeof status === "string") where.status = status;
    if (severity && typeof severity === "string") where.severity = severity;
    if (type && typeof type === "string") where.type = type;

    const incidents = await prisma.incident.findMany({
      where,
      include: {
        shipment: {
          select: {
            id: true,
            trackingId: true,
            status: true,
            priority: true,
            origin: true,
            destination: true,
            currentLocation: true,
            riskScore: true,
            slaBreached: true,
            slaDeadline: true,
            carrier: { select: { id: true, name: true, code: true, reliabilityScore: true } },
            warehouse: { select: { id: true, name: true, code: true, status: true } },
            consumer: { select: { id: true, name: true, email: true } },
          },
        },
        assignedAgent: { select: { id: true, name: true, email: true } },
        chatHistory: true,
      },
      orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
    });

    const normalized = incidents.map(normalizeIncident);
    return ApiResponse.success(res, { incidents: normalized, total: normalized.length });
  } catch (error) {
    console.error("[Admin] Error fetching incidents:", error);
    return ApiResponse.error(res, "Failed to fetch incidents", 500);
  }
};

// get escalated incidents only
export const getEscalatedIncidents = async (req: Request, res: Response) => {
  try {
    const { admin_id } = req.query;

    if (!admin_id || typeof admin_id !== "string") {
      return ApiResponse.error(res, "admin_id is required", 400);
    }

    const admin = await prisma.user.findUnique({
      where: { id: admin_id },
    });

    if (!admin || admin.role !== "admin") {
      return ApiResponse.unauthorized(res, "Not authorized as operations manager");
    }

    const incidents = await prisma.incident.findMany({
      where: { isEscalated: true },
      include: {
        shipment: {
          select: {
            id: true,
            trackingId: true,
            status: true,
            priority: true,
            origin: true,
            destination: true,
            currentLocation: true,
            riskScore: true,
            slaBreached: true,
            slaDeadline: true,
            carrier: { select: { id: true, name: true, code: true, reliabilityScore: true } },
            warehouse: { select: { id: true, name: true, code: true, status: true } },
            consumer: { select: { id: true, name: true, email: true } },
          },
        },
        assignedAgent: { select: { id: true, name: true, email: true } },
        chatHistory: true,
      },
      orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
    });

    const normalized = incidents.map(normalizeIncident);
    return ApiResponse.success(res, { incidents: normalized, total: normalized.length });
  } catch (error) {
    console.error("[Admin] Error fetching escalated incidents:", error);
    return ApiResponse.error(res, "Failed to fetch escalated incidents", 500);
  }
};

// get single incident detail
export const getIncidentById = async (req: Request, res: Response) => {
  try {
    const { incidentId } = req.params;

    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        shipment: {
          include: {
            carrier: true,
            warehouse: true,
            consumer: { select: { id: true, name: true, email: true } },
          },
        },
        assignedAgent: { select: { id: true, name: true, email: true } },
        chatHistory: true,
      },
    });

    if (!incident) {
      return ApiResponse.notFound(res, "Incident not found");
    }

    return ApiResponse.success(res, { incident: normalizeIncident(incident) });
  } catch (error) {
    console.error("[Admin] Error fetching incident:", error);
    return ApiResponse.error(res, "Failed to fetch incident", 500);
  }
};

// get messages for an incident chat
export const getIncidentMessages = async (req: Request, res: Response) => {
  try {
    const { incidentId } = req.params;
    const { since } = req.query;

    const chatHistory = await prisma.chatHistory.findUnique({
      where: { incidentId },
    });

    if (!chatHistory) {
      return ApiResponse.success(res, { messages: [] });
    }

    let messages = (chatHistory.messages || []).map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      cards: msg.cards || [],
      tools_used: msg.toolsUsed || [],
      actions_taken: msg.actionsTaken || [],
      reasoning: msg.reasoning || null,
      confidence_score: msg.confidenceScore || null,
      is_human: msg.isHuman || false,
    }));

    if (since && typeof since === "string") {
      const sinceTime = new Date(since).getTime();
      messages = messages.filter(
        (msg: any) => new Date(msg.timestamp).getTime() > sinceTime
      );
    }

    return ApiResponse.success(res, { messages });
  } catch (error) {
    console.error("[Admin] Error fetching incident messages:", error);
    return ApiResponse.error(res, "Failed to fetch messages", 500);
  }
};

// send message as ops manager on an incident
export const sendAdminMessage = async (req: Request, res: Response) => {
  try {
    const { incidentId } = req.params;
    const { admin_id, content } = req.body;

    if (!admin_id || !content) {
      return ApiResponse.error(res, "admin_id and content are required", 400);
    }

    const admin = await prisma.user.findUnique({
      where: { id: admin_id },
    });

    if (!admin || admin.role !== "admin") {
      return ApiResponse.unauthorized(res, "Not authorized as operations manager");
    }

    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { chatHistory: true },
    });

    if (!incident) {
      return ApiResponse.notFound(res, "Incident not found");
    }

    const adminMessageData = {
      role: "assistant",
      content,
      timestamp: new Date(),
      cards: null,
      toolsUsed: [],
      actionsTaken: [],
      isHuman: true,
    };

    // create chat history if it doesn't exist
    if (!incident.chatHistory) {
      await prisma.chatHistory.create({
        data: {
          sessionId: incidentId,
          incidentId,
          messages: [adminMessageData],
        },
      });
    } else {
      await prisma.chatHistory.update({
        where: { incidentId },
        data: {
          messages: { push: adminMessageData },
        },
      });
    }

    await prisma.incident.update({
      where: { id: incidentId },
      data: {
        assignedAgentId: admin_id,
        status: "in_progress",
        updatedAt: new Date(),
      },
    });

    return ApiResponse.success(res, {
      message: "Message sent successfully",
      content,
      timestamp: adminMessageData.timestamp,
      is_human: true,
    });
  } catch (error) {
    console.error("[Admin] Error sending message:", error);
    return ApiResponse.error(res, "Failed to send message", 500);
  }
};

// escalate incident (flag for human review)
export const escalateIncident = async (req: Request, res: Response) => {
  try {
    const { incidentId } = req.params;
    const { reason } = req.body;

    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      return ApiResponse.notFound(res, "Incident not found");
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        isEscalated: true,
        escalatedAt: new Date(),
        status: "escalated",
      },
    });

    // add system message to chat history
    const systemMessage = {
      role: "assistant",
      content: reason
        ? `Incident escalated to operations manager. Reason: ${reason}`
        : "This incident has been escalated to an operations manager for review. They will assess and take action shortly.",
      timestamp: new Date(),
      cards: null,
      toolsUsed: [],
      actionsTaken: ["escalate"],
      isHuman: false,
    };

    const existingChat = await prisma.chatHistory.findUnique({
      where: { incidentId },
    });

    if (existingChat) {
      await prisma.chatHistory.update({
        where: { incidentId },
        data: { messages: { push: systemMessage } },
      });
    } else {
      await prisma.chatHistory.create({
        data: {
          sessionId: incidentId,
          incidentId,
          messages: [systemMessage],
        },
      });
    }

    return ApiResponse.success(res, {
      _id: updated.id,
      incident_id: updated.incidentId,
      is_escalated: updated.isEscalated,
      escalated_at: updated.escalatedAt,
      status: updated.status,
    });
  } catch (error) {
    console.error("[Admin] Error escalating incident:", error);
    return ApiResponse.error(res, "Failed to escalate incident", 500);
  }
};

// resolve incident
export const resolveIncident = async (req: Request, res: Response) => {
  try {
    const { incidentId } = req.params;
    const { admin_id, resolution } = req.body;

    if (!admin_id) {
      return ApiResponse.error(res, "admin_id is required", 400);
    }

    const admin = await prisma.user.findUnique({
      where: { id: admin_id },
    });

    if (!admin || admin.role !== "admin") {
      return ApiResponse.unauthorized(res, "Not authorized as operations manager");
    }

    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { shipment: true },
    });

    if (!incident) {
      return ApiResponse.notFound(res, "Incident not found");
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: "resolved",
        isEscalated: false,
        resolution: resolution || "Resolved by operations manager",
        assignedAgentId: admin_id,
      },
    });

    const resolutionMessage = {
      role: "assistant",
      content: resolution
        ? `Incident resolved: ${resolution}`
        : "This incident has been resolved by the operations manager.",
      timestamp: new Date(),
      cards: null,
      toolsUsed: [],
      actionsTaken: ["resolve"],
      isHuman: true,
    };

    const existingChat = await prisma.chatHistory.findUnique({
      where: { incidentId },
    });

    if (existingChat) {
      await prisma.chatHistory.update({
        where: { incidentId },
        data: { messages: { push: resolutionMessage } },
      });
    }

    // send resolve webhook to n8n
    try {
      await fetch(config.webhook.resolveIncidentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incident_id: incidentId,
          shipment_id: incident.shipmentId,
          resolution: resolution || "Resolved by operations manager",
        }),
      });
    } catch (webhookError) {
      console.error("[Admin] Resolve webhook failed:", webhookError);
    }

    return ApiResponse.success(res, {
      _id: updated.id,
      incident_id: updated.incidentId,
      status: updated.status,
      is_escalated: updated.isEscalated,
      resolution: updated.resolution,
    });
  } catch (error) {
    console.error("[Admin] Error resolving incident:", error);
    return ApiResponse.error(res, "Failed to resolve incident", 500);
  }
};

// update incident severity
export const updateIncidentSeverity = async (req: Request, res: Response) => {
  try {
    const { incidentId } = req.params;
    const { severity } = req.body;

    if (!severity) {
      return ApiResponse.error(res, "severity is required", 400);
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: { severity },
    });

    return ApiResponse.success(res, {
      _id: updated.id,
      incident_id: updated.incidentId,
      severity: updated.severity,
    });
  } catch (error) {
    console.error("[Admin] Error updating severity:", error);
    return ApiResponse.error(res, "Failed to update incident severity", 500);
  }
};

// get ops dashboard stats
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const [
      totalShipments,
      activeShipments,
      delayedShipments,
      slaBreached,
      openIncidents,
      criticalIncidents,
      escalatedIncidents,
    ] = await Promise.all([
      prisma.shipment.count(),
      prisma.shipment.count({ where: { status: { in: ["in_transit", "out_for_delivery", "at_warehouse"] } } }),
      prisma.shipment.count({ where: { status: "delayed" } }),
      prisma.shipment.count({ where: { slaBreached: true, status: { notIn: ["delivered", "cancelled"] } } }),
      prisma.incident.count({ where: { status: { in: ["open", "investigating", "in_progress"] } } }),
      prisma.incident.count({ where: { severity: "critical", status: { not: "resolved" } } }),
      prisma.incident.count({ where: { isEscalated: true, status: { not: "resolved" } } }),
    ]);

    const recentActions = await prisma.agentAction.findMany({
      orderBy: { executedAt: "desc" },
      take: 5,
    });

    const carriers = await prisma.carrier.findMany({
      where: { isActive: true },
      orderBy: { reliabilityScore: "desc" },
      take: 5,
    });

    const warehouses = await prisma.warehouse.findMany({
      where: { isActive: true },
    });

    const congestedWarehouses = warehouses.filter(
      (wh) => wh.congestionLevel === "high" || wh.congestionLevel === "critical"
    );

    return ApiResponse.success(res, {
      overview: {
        total_shipments: totalShipments,
        active_shipments: activeShipments,
        delayed_shipments: delayedShipments,
        sla_breached: slaBreached,
        open_incidents: openIncidents,
        critical_incidents: criticalIncidents,
        escalated_incidents: escalatedIncidents,
        congested_warehouses: congestedWarehouses.length,
      },
      recent_agent_actions: recentActions.map((a) => ({
        action_id: a.actionId,
        action_type: a.actionType,
        description: a.description,
        confidence: a.confidence,
        outcome: a.outcome,
        required_human: a.requiredHuman,
        executed_at: a.executedAt,
      })),
      top_carriers: carriers.map((c) => ({
        name: c.name,
        code: c.code,
        reliability_score: c.reliabilityScore,
        on_time_rate: c.onTimeRate,
        active_shipments: c.activeShipments,
      })),
      warehouse_status: warehouses.map((wh) => ({
        name: wh.name,
        code: wh.code,
        status: wh.status,
        congestion_level: wh.congestionLevel,
        utilization_pct: wh.utilizationPct,
        throughput_rate: wh.throughputRate,
      })),
    });
  } catch (error) {
    console.error("[Admin] Error fetching dashboard stats:", error);
    return ApiResponse.error(res, "Failed to fetch dashboard stats", 500);
  }
};

// normalizes prisma incident to api response format
function normalizeIncident(incident: any) {
  return {
    _id: incident.id,
    incident_id: incident.incidentId,
    shipment_id: incident.shipmentId,
    shipment: incident.shipment
      ? {
          _id: incident.shipment.id,
          tracking_id: incident.shipment.trackingId,
          status: incident.shipment.status,
          priority: incident.shipment.priority,
          origin: incident.shipment.origin,
          destination: incident.shipment.destination,
          current_location: incident.shipment.currentLocation || null,
          risk_score: incident.shipment.riskScore,
          sla_breached: incident.shipment.slaBreached,
          sla_deadline: incident.shipment.slaDeadline,
          carrier: incident.shipment.carrier || null,
          warehouse: incident.shipment.warehouse || null,
          consumer: incident.shipment.consumer || null,
        }
      : null,
    assigned_agent: incident.assignedAgent || null,
    type: incident.type,
    severity: incident.severity,
    status: incident.status,
    title: incident.title,
    description: incident.description,
    root_cause: incident.rootCause,
    resolution: incident.resolution,
    is_escalated: incident.isEscalated,
    escalated_at: incident.escalatedAt,
    agent_decision: incident.agentDecision,
    risk_score: incident.riskScore,
    affected_count: incident.affectedCount,
    chat_history: (incident.chatHistory?.messages || []).map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      cards: msg.cards || [],
      tools_used: msg.toolsUsed || [],
      actions_taken: msg.actionsTaken || [],
      reasoning: msg.reasoning || null,
      confidence_score: msg.confidenceScore || null,
      is_human: msg.isHuman || false,
    })),
    created_at: incident.createdAt,
    updated_at: incident.updatedAt,
  };
}
