import { Request, Response } from "express";
import prisma from "../config/database.js";
import ApiResponse from "../utils/apiResponse.js";
import { config } from "../config/env.js";

const N8N_TICKET_WEBHOOK = "https://mihirj.app.n8n.cloud/webhook/ticket";

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
      where: { id: incidentId as string },
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
      where: { incidentId: incidentId as string },
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
      where: { id: incidentId as string },
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
    if (!(incident as any).chatHistory) {
      await prisma.chatHistory.create({
        data: {
          sessionId: incidentId as string,
          incidentId: incidentId as string,
          messages: [adminMessageData as any],
        },
      });
    } else {
      await prisma.chatHistory.update({
        where: { incidentId: incidentId as string },
        data: {
          messages: { push: adminMessageData as any },
        },
      });
    }

    await prisma.incident.update({
      where: { id: incidentId as string },
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
      where: { id: incidentId as string },
    });

    if (!incident) {
      return ApiResponse.notFound(res, "Incident not found");
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId as string },
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
      where: { incidentId: incidentId as string },
    });

    if (existingChat) {
      await prisma.chatHistory.update({
        where: { incidentId: incidentId as string },
        data: { messages: { push: systemMessage as any } },
      });
    } else {
      await prisma.chatHistory.create({
        data: {
          sessionId: incidentId as string,
          incidentId: incidentId as string,
          messages: [systemMessage as any],
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
      where: { id: incidentId as string },
      include: { shipment: true },
    });

    if (!incident) {
      return ApiResponse.notFound(res, "Incident not found");
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId as string },
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
      where: { incidentId: incidentId as string },
    });

    if (existingChat) {
      await prisma.chatHistory.update({
        where: { incidentId: incidentId as string },
        data: { messages: { push: resolutionMessage as any } },
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
      where: { id: incidentId as string },
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

// ─── n8n chats collection endpoints ───

// list all chats from the chats collection
export const getChats = async (req: Request, res: Response) => {
  try {
    const { status, visitor_id } = req.query;

    const where: any = {};
    if (status && typeof status === "string") where.status = status;
    if (visitor_id && typeof visitor_id === "string") where.visitorId = visitor_id;

    const chats = await prisma.chat.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    const normalized = chats.map(normalizeChat);

    return ApiResponse.success(res, { chats: normalized, total: normalized.length });
  } catch (error) {
    console.error("[Admin] Get chats error:", error);
    return ApiResponse.error(res, "Failed to fetch chats", 500);
  }
};

// get single chat by id
export const getChatById = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      return ApiResponse.notFound(res, "Chat not found");
    }

    return ApiResponse.success(res, { chat: normalizeChat(chat) });
  } catch (error) {
    console.error("[Admin] Get chat error:", error);
    return ApiResponse.error(res, "Failed to fetch chat", 500);
  }
};

// get messages for a specific chat
export const getChatMessages = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      return ApiResponse.notFound(res, "Chat not found");
    }

    const messages = (chat.messages || []).map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      is_human: msg.isHuman || false,
      agent_name: msg.agentName || null,
      metadata: msg.metadata || null,
    }));

    return ApiResponse.success(res, { messages });
  } catch (error) {
    console.error("[Admin] Get chat messages error:", error);
    return ApiResponse.error(res, "Failed to fetch chat messages", 500);
  }
};

// send admin message to a chat in the chats collection
export const sendChatMessage = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { admin_id, content } = req.body;

    if (!content || typeof content !== "string") {
      return ApiResponse.error(res, "content is required", 400);
    }

    const admin = await prisma.user.findUnique({
      where: { id: admin_id },
    });

    if (!admin || admin.role !== "admin") {
      return ApiResponse.unauthorized(res, "Not authorized");
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      return ApiResponse.notFound(res, "Chat not found");
    }

    const newMessage = {
      role: "admin",
      content,
      timestamp: new Date(),
      isHuman: true,
      agentName: admin.name,
    };

    await prisma.chat.update({
      where: { id: chatId },
      data: {
        messages: { push: newMessage },
        updatedAt: new Date(),
      },
    });

    return ApiResponse.success(res, {
      message: {
        role: newMessage.role,
        content: newMessage.content,
        timestamp: newMessage.timestamp,
        is_human: true,
        agent_name: admin.name,
      },
    });
  } catch (error) {
    console.error("[Admin] Send chat message error:", error);
    return ApiResponse.error(res, "Failed to send message", 500);
  }
};

// normalizes a chat from prisma to api response format
function normalizeChat(chat: any) {
  const messages = (chat.messages || []).map((msg: any) => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    is_human: msg.isHuman || false,
    agent_name: msg.agentName || null,
    metadata: msg.metadata || null,
  }));

  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;

  return {
    _id: chat.id,
    session_id: chat.sessionId,
    visitor_id: chat.visitorId,
    visitor_name: chat.visitorName,
    visitor_email: chat.visitorEmail,
    status: chat.status,
    channel: chat.channel,
    metadata: chat.metadata,
    messages,
    message_count: messages.length,
    last_message: lastMsg?.content || "",
    last_message_at: lastMsg?.timestamp || chat.updatedAt,
    created_at: chat.createdAt,
    updated_at: chat.updatedAt,
  };
}

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

// ─── SUPPORT TICKETS (n8n agent integration) ───

// list all support tickets
export const getSupportTickets = async (req: Request, res: Response) => {
  try {
    const { status, consumer_id, shipment_id } = req.query;

    const where: any = {};
    if (status && typeof status === "string") where.status = status;
    if (consumer_id && typeof consumer_id === "string") where.consumerId = consumer_id;
    if (shipment_id && typeof shipment_id === "string") where.shipmentId = shipment_id;

    const tickets = await prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const normalized = tickets.map(normalizeTicket);

    return ApiResponse.success(res, { tickets: normalized, total: normalized.length });
  } catch (error) {
    console.error("[Admin] Get support tickets error:", error);
    return ApiResponse.error(res, "Failed to fetch support tickets", 500);
  }
};

// get single ticket by id
export const getSupportTicketById = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;

    const ticket = await prisma.supportTicket.findFirst({
      where: { OR: [{ id: ticketId }, { ticketId: ticketId }] },
    });

    if (!ticket) {
      return ApiResponse.notFound(res, "Ticket not found");
    }

    return ApiResponse.success(res, { ticket: normalizeTicket(ticket) });
  } catch (error) {
    console.error("[Admin] Get ticket by id error:", error);
    return ApiResponse.error(res, "Failed to fetch ticket", 500);
  }
};

// get chat messages linked to a ticket from support_chat_history collection
export const getSupportTicketMessages = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;

    const ticket = await prisma.supportTicket.findFirst({
      where: { OR: [{ id: ticketId }, { ticketId: ticketId }] },
    });

    if (!ticket) {
      return ApiResponse.notFound(res, "Ticket not found");
    }

    // find linked chat session by shipment id or ticket metadata
    const shipmentId = ticket.shipmentId;

    // look in the chats collection for messages linked to this ticket
    const chats = await prisma.chat.findMany({
      where: {
        OR: [
          { sessionId: ticket.ticketId },
          ...(shipmentId ? [{ sessionId: shipmentId }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 1,
    });

    const chat = chats[0];
    const messages = chat
      ? (chat.messages || []).map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          is_human: msg.isHuman || false,
          agent_name: msg.agentName || null,
          metadata: msg.metadata || null,
        }))
      : [];

    return ApiResponse.success(res, {
      ticket_id: ticket.ticketId,
      messages,
      total: messages.length,
    });
  } catch (error) {
    console.error("[Admin] Get ticket messages error:", error);
    return ApiResponse.error(res, "Failed to fetch ticket messages", 500);
  }
};

// create a support ticket and send to n8n agent
export const createSupportTicket = async (req: Request, res: Response) => {
  try {
    const { shipment_id, consumer_id, message, subject, priority, category } = req.body;

    if (!message?.content) {
      return ApiResponse.error(res, "message.content is required", 400);
    }

    const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    // create ticket in db
    const ticket = await prisma.supportTicket.create({
      data: {
        ticketId,
        shipmentId: shipment_id || null,
        consumerId: consumer_id || null,
        subject: subject || message.content.substring(0, 100),
        status: "open",
        priority: priority || "medium",
        category: category || null,
        toolsUsed: [],
        actionsTaken: [],
      },
    });

    // store initial message in chats collection (support_chat_history)
    const chat = await prisma.chat.create({
      data: {
        sessionId: ticketId,
        visitorId: consumer_id || null,
        status: "open",
        channel: "support",
        metadata: {
          ticket_id: ticketId,
          shipment_id: shipment_id || null,
        },
        messages: [
          {
            role: "user",
            content: message.content,
            timestamp: new Date(),
            isHuman: true,
          },
        ],
      },
    });

    // fire n8n webhook for agent processing
    let agentResponse = null;
    try {
      const webhookPayload = {
        _id: ticket.id,
        shipment_id: shipment_id || null,
        message: { content: message.content },
      };

      const n8nRes = await fetch(N8N_TICKET_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookPayload),
      });

      if (n8nRes.ok) {
        const n8nData: any = await n8nRes.json();
        agentResponse = Array.isArray(n8nData) ? n8nData[0]?.output : n8nData?.output;

        if (agentResponse) {
          // update ticket with agent response
          await prisma.supportTicket.update({
            where: { id: ticket.id },
            data: {
              agentMessage: agentResponse.agent_message || null,
              confidence: agentResponse.confidence_score || null,
              complexity: agentResponse.complexity_score || null,
              toolsUsed: agentResponse.tools_used || [],
              actionsTaken: agentResponse.actions_taken || [],
              reasoning: agentResponse.reasoning || null,
              cards: agentResponse.cards || null,
              status: "active",
              updatedAt: new Date(),
            },
          });

          // store agent response in chat history
          await prisma.chat.update({
            where: { id: chat.id },
            data: {
              messages: {
                push: {
                  role: "assistant",
                  content: agentResponse.agent_message || "Processing your request...",
                  timestamp: new Date(),
                  isHuman: false,
                  agentName: "Logistix Agent",
                  metadata: {
                    ticket_id: agentResponse.ticket_id || ticketId,
                    tools_used: agentResponse.tools_used || [],
                    actions_taken: agentResponse.actions_taken || [],
                    confidence_score: agentResponse.confidence_score,
                    reasoning: agentResponse.reasoning,
                    cards: agentResponse.cards,
                  },
                },
              },
              updatedAt: new Date(),
            },
          });
        }
      } else {
        console.warn("[Admin] n8n ticket webhook returned:", n8nRes.status);
      }
    } catch (err) {
      console.warn("[Admin] n8n ticket webhook unreachable:", err instanceof Error ? err.message : err);
    }

    return ApiResponse.success(res, {
      ticket: normalizeTicket(
        await prisma.supportTicket.findUnique({ where: { id: ticket.id } })
      ),
      agent_response: agentResponse,
      chat_id: chat.id,
    });
  } catch (error) {
    console.error("[Admin] Create support ticket error:", error);
    return ApiResponse.error(res, "Failed to create support ticket", 500);
  }
};

// follow-up message on existing ticket
export const sendTicketMessage = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;
    const { consumer_id, message } = req.body;

    if (!message?.content) {
      return ApiResponse.error(res, "message.content is required", 400);
    }

    // find ticket by id or ticketId string
    const ticket = await prisma.supportTicket.findFirst({
      where: { OR: [{ id: ticketId }, { ticketId: ticketId }] },
    });

    if (!ticket) {
      return ApiResponse.notFound(res, "Ticket not found");
    }

    // find linked chat
    const chat = await prisma.chat.findFirst({
      where: { sessionId: ticket.ticketId },
    });

    if (!chat) {
      return ApiResponse.notFound(res, "Chat session not found for this ticket");
    }

    // append user message to chat
    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        messages: {
          push: {
            role: "user",
            content: message.content,
            timestamp: new Date(),
            isHuman: true,
          },
        },
        updatedAt: new Date(),
      },
    });

    // fire n8n webhook with existing ticket context
    let agentResponse = null;
    try {
      const webhookPayload = {
        _id: ticket.id,
        shipment_id: ticket.shipmentId || null,
        message: { content: message.content },
      };

      const n8nRes = await fetch(N8N_TICKET_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookPayload),
      });

      if (n8nRes.ok) {
        const n8nData: any = await n8nRes.json();
        agentResponse = Array.isArray(n8nData) ? n8nData[0]?.output : n8nData?.output;

        if (agentResponse) {
          // update ticket with latest agent response
          await prisma.supportTicket.update({
            where: { id: ticket.id },
            data: {
              agentMessage: agentResponse.agent_message || ticket.agentMessage,
              confidence: agentResponse.confidence_score ?? ticket.confidence,
              complexity: agentResponse.complexity_score ?? ticket.complexity,
              toolsUsed: agentResponse.tools_used || ticket.toolsUsed,
              actionsTaken: agentResponse.actions_taken || ticket.actionsTaken,
              reasoning: agentResponse.reasoning || ticket.reasoning,
              cards: agentResponse.cards || ticket.cards,
              updatedAt: new Date(),
            },
          });

          // append agent response to chat
          await prisma.chat.update({
            where: { id: chat.id },
            data: {
              messages: {
                push: {
                  role: "assistant",
                  content: agentResponse.agent_message || "Processing your request...",
                  timestamp: new Date(),
                  isHuman: false,
                  agentName: "Logistix Agent",
                  metadata: {
                    ticket_id: ticket.ticketId,
                    tools_used: agentResponse.tools_used || [],
                    actions_taken: agentResponse.actions_taken || [],
                    confidence_score: agentResponse.confidence_score,
                    reasoning: agentResponse.reasoning,
                    cards: agentResponse.cards,
                  },
                },
              },
              updatedAt: new Date(),
            },
          });
        }
      } else {
        console.warn("[Admin] n8n follow-up webhook returned:", n8nRes.status);
      }
    } catch (err) {
      console.warn("[Admin] n8n follow-up webhook unreachable:", err instanceof Error ? err.message : err);
    }

    return ApiResponse.success(res, {
      ticket: normalizeTicket(
        await prisma.supportTicket.findUnique({ where: { id: ticket.id } })
      ),
      agent_response: agentResponse,
    });
  } catch (error) {
    console.error("[Admin] Send ticket message error:", error);
    return ApiResponse.error(res, "Failed to send message", 500);
  }
};

// escalate a support ticket to human agent
export const escalateTicketHandler = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;
    const { reason } = req.body;

    // find ticket by id or ticketId string
    const ticket = await prisma.supportTicket.findFirst({
      where: { OR: [{ id: ticketId }, { ticketId: ticketId }] },
    });

    if (!ticket) {
      return ApiResponse.notFound(res, "Ticket not found");
    }

    // update ticket status to escalated
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: "escalated",
        updatedAt: new Date(),
      },
    });

    // find linked chat and add system message
    const chat = await prisma.chat.findFirst({
      where: { sessionId: ticket.ticketId },
    });

    if (chat) {
      await prisma.chat.update({
        where: { id: chat.id },
        data: {
          messages: {
            push: {
              role: "assistant",
              content: reason
                ? `Ticket escalated to human support. Reason: ${reason}`
                : "This ticket has been escalated to a human support agent. They will respond shortly.",
              timestamp: new Date(),
              isHuman: false,
              agentName: "System",
              metadata: { action: "escalate", reason: reason || null },
            },
          },
          status: "escalated",
          updatedAt: new Date(),
        },
      });
    }

    return ApiResponse.success(res, {
      _id: ticket.id,
      ticket_id: ticket.ticketId,
      status: "escalated",
      system_message: reason
        ? `Ticket escalated. Reason: ${reason}`
        : "You've been connected to a human agent. They will respond shortly.",
    });
  } catch (error) {
    console.error("[Admin] Escalate ticket error:", error);
    return ApiResponse.error(res, "Failed to escalate ticket", 500);
  }
};

function normalizeTicket(ticket: any) {
  if (!ticket) return null;
  return {
    _id: ticket.id,
    ticket_id: ticket.ticketId,
    shipment_id: ticket.shipmentId,
    consumer_id: ticket.consumerId,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    category: ticket.category,
    resolution: ticket.resolution,
    agent_message: ticket.agentMessage,
    confidence: ticket.confidence,
    complexity: ticket.complexity,
    tools_used: ticket.toolsUsed || [],
    actions_taken: ticket.actionsTaken || [],
    reasoning: ticket.reasoning,
    cards: ticket.cards,
    metadata: ticket.metadata,
    created_at: ticket.createdAt,
    updated_at: ticket.updatedAt,
  };
}

// ─── AGENT EXECUTION LOGS (OODA loop display) ───

// list all agent logs
export const getAgentLogs = async (req: Request, res: Response) => {
  try {
    const { trigger_type, session_id, limit, page } = req.query;

    const where: any = {};
    if (trigger_type && typeof trigger_type === "string") where.triggerType = trigger_type;
    if (session_id && typeof session_id === "string") where.sessionId = session_id;

    const take = parseInt(limit as string) || 50;
    const skip = ((parseInt(page as string) || 1) - 1) * take;

    const [logs, total] = await Promise.all([
      prisma.agentLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.agentLog.count({ where }),
    ]);

    const normalized = logs.map(normalizeAgentLog);

    return ApiResponse.success(res, {
      logs: normalized,
      total,
      page: Math.floor(skip / take) + 1,
      limit: take,
      hasMore: skip + take < total,
    });
  } catch (error) {
    console.error("[Admin] Get agent logs error:", error);
    return ApiResponse.error(res, "Failed to fetch agent logs", 500);
  }
};

// get single agent log
export const getAgentLogById = async (req: Request, res: Response) => {
  try {
    const { logId } = req.params;

    const log = await prisma.agentLog.findUnique({
      where: { id: logId },
    });

    if (!log) {
      return ApiResponse.notFound(res, "Agent log not found");
    }

    return ApiResponse.success(res, { log: normalizeAgentLog(log) });
  } catch (error) {
    console.error("[Admin] Get agent log error:", error);
    return ApiResponse.error(res, "Failed to fetch agent log", 500);
  }
};

function normalizeAgentLog(log: any) {
  return {
    _id: log.id,
    session_id: log.sessionId,
    trigger_type: log.triggerType,
    shipment_id: log.shipmentId,
    observe: log.observe,
    reason: log.reason,
    decide: log.decide,
    act: log.act,
    learn: log.learn,
    confidence: log.confidence,
    status: log.status,
    duration: log.duration,
    metadata: log.metadata,
    created_at: log.createdAt ?? new Date().toISOString(),
  };
}
