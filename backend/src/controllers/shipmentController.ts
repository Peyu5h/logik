import { Request, Response } from "express";
import prisma from "../config/database.js";
import ApiResponse from "../utils/apiResponse.js";
import { config } from "../config/env.js";

// generates unique tracking id
function generateTrackingId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SHP-${timestamp}-${random}`;
}

// get all shipments (optionally filtered by consumer)
export const getShipments = async (req: Request, res: Response) => {
  try {
    const { consumer_id, status, priority, carrier_id, warehouse_id } = req.query;

    const where: any = {};
    if (consumer_id && typeof consumer_id === "string") where.consumerId = consumer_id;
    if (status && typeof status === "string") where.status = status;
    if (priority && typeof priority === "string") where.priority = priority;
    if (carrier_id && typeof carrier_id === "string") where.carrierId = carrier_id;
    if (warehouse_id && typeof warehouse_id === "string") where.warehouseId = warehouse_id;

    const shipments = await prisma.shipment.findMany({
      where,
      include: {
        carrier: { select: { id: true, name: true, code: true, reliabilityScore: true } },
        warehouse: { select: { id: true, name: true, code: true, status: true, congestionLevel: true } },
        consumer: { select: { id: true, name: true, email: true } },
        incidents: { select: { id: true, incidentId: true, type: true, severity: true, status: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const normalized = shipments.map(normalize);
    return ApiResponse.success(res, { shipments: normalized, total: normalized.length });
  } catch (error) {
    console.error("[Shipments] Error fetching shipments:", error);
    return ApiResponse.error(res, "Failed to fetch shipments", 500);
  }
};

// get single shipment by id
export const getShipmentById = async (req: Request, res: Response) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        carrier: true,
        warehouse: true,
        consumer: { select: { id: true, name: true, email: true } },
        incidents: true,
        chatHistory: true,
      },
    });

    if (!shipment) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    return ApiResponse.success(res, { shipment: normalize(shipment) });
  } catch (error) {
    console.error("[Shipments] Error fetching shipment:", error);
    return ApiResponse.error(res, "Failed to fetch shipment", 500);
  }
};

// create new shipment
export const createShipment = async (req: Request, res: Response) => {
  try {
    const {
      consumer_id,
      origin,
      destination,
      priority,
      weight,
      dimensions,
      carrier_id,
      warehouse_id,
      sla_hours,
    } = req.body;

    if (!consumer_id || !origin || !destination) {
      return ApiResponse.error(res, "consumer_id, origin, and destination are required", 400);
    }

    const trackingId = generateTrackingId();
    const slaDeadline = sla_hours ? new Date(Date.now() + sla_hours * 60 * 60 * 1000) : null;

    const shipment = await prisma.shipment.create({
      data: {
        trackingId,
        consumerId: consumer_id,
        status: "pending",
        priority: priority || "medium",
        origin,
        destination,
        carrierId: carrier_id || null,
        warehouseId: warehouse_id || null,
        weight: weight || null,
        dimensions: dimensions || null,
        routeHistory: [],
        slaDeadline,
        riskScore: 0,
      },
      include: {
        carrier: { select: { id: true, name: true, code: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
    });

    console.log("[Shipments] Created:", shipment.trackingId);
    return ApiResponse.created(res, { shipment: normalize(shipment) }, "Shipment created");
  } catch (error) {
    console.error("[Shipments] Error creating shipment:", error);
    return ApiResponse.error(res, "Failed to create shipment", 500);
  }
};

// update shipment status
export const updateShipmentStatus = async (req: Request, res: Response) => {
  try {
    const { shipmentId } = req.params;
    const { status, current_location, agent_notes } = req.body;

    if (!status) {
      return ApiResponse.error(res, "status is required", 400);
    }

    const existing = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!existing) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    const updateData: any = { status, updatedAt: new Date() };

    if (current_location) {
      updateData.currentLocation = current_location;
      updateData.routeHistory = {
        push: {
          lat: current_location.lat,
          lng: current_location.lng,
          label: current_location.address || status,
          timestamp: new Date(),
          status,
        },
      };
    }

    if (agent_notes) updateData.agentNotes = agent_notes;
    if (status === "delivered") updateData.actualDelivery = new Date();

    // check sla breach
    if (existing.slaDeadline && new Date() > existing.slaDeadline && status !== "delivered") {
      updateData.slaBreached = true;
    }

    const shipment = await prisma.shipment.update({
      where: { id: shipmentId },
      data: updateData,
    });

    console.log("[Shipments] Status updated:", shipment.trackingId, "->", status);
    return ApiResponse.success(res, { shipment: normalize(shipment) });
  } catch (error) {
    console.error("[Shipments] Error updating status:", error);
    return ApiResponse.error(res, "Failed to update shipment status", 500);
  }
};

// update shipment risk score (called by agent)
export const updateRiskScore = async (req: Request, res: Response) => {
  try {
    const { shipmentId } = req.params;
    const { risk_score, agent_notes } = req.body;

    if (risk_score === undefined) {
      return ApiResponse.error(res, "risk_score is required", 400);
    }

    const updateData: any = { riskScore: risk_score };
    if (agent_notes) updateData.agentNotes = agent_notes;

    // auto-escalate high risk shipments
    if (risk_score > 70) {
      updateData.priority = "urgent";
    } else if (risk_score > 40) {
      updateData.priority = "high";
    }

    const shipment = await prisma.shipment.update({
      where: { id: shipmentId },
      data: updateData,
    });

    return ApiResponse.success(res, { shipment: normalize(shipment) });
  } catch (error) {
    console.error("[Shipments] Error updating risk:", error);
    return ApiResponse.error(res, "Failed to update risk score", 500);
  }
};

// reroute shipment to different carrier
export const rerouteShipment = async (req: Request, res: Response) => {
  try {
    const { shipmentId } = req.params;
    const { carrier_id, reason } = req.body;

    if (!carrier_id) {
      return ApiResponse.error(res, "carrier_id is required", 400);
    }

    const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    const newCarrier = await prisma.carrier.findUnique({ where: { id: carrier_id } });
    if (!newCarrier) {
      return ApiResponse.notFound(res, "Carrier not found");
    }

    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        carrierId: carrier_id,
        agentNotes: reason || `Rerouted to carrier ${newCarrier.code}`,
      },
      include: {
        carrier: { select: { id: true, name: true, code: true } },
      },
    });

    // log the agent action
    const actionId = `act-${Date.now().toString(36)}`;
    await prisma.agentAction.create({
      data: {
        actionId,
        actionType: "reroute",
        targetType: "shipment",
        targetId: shipmentId,
        description: `Rerouted from previous carrier to ${newCarrier.name}`,
        reasoning: reason || "Manual reroute",
        confidence: 0.85,
        outcome: "executed",
        requiredHuman: false,
      },
    });

    console.log("[Shipments] Rerouted:", updated.trackingId, "-> carrier", newCarrier.code);
    return ApiResponse.success(res, { shipment: normalize(updated) });
  } catch (error) {
    console.error("[Shipments] Error rerouting:", error);
    return ApiResponse.error(res, "Failed to reroute shipment", 500);
  }
};

// get shipment stats / overview
export const getShipmentStats = async (req: Request, res: Response) => {
  try {
    const [
      total,
      inTransit,
      delayed,
      delivered,
      pending,
      slaBreached,
      atWarehouse,
    ] = await Promise.all([
      prisma.shipment.count(),
      prisma.shipment.count({ where: { status: "in_transit" } }),
      prisma.shipment.count({ where: { status: "delayed" } }),
      prisma.shipment.count({ where: { status: "delivered" } }),
      prisma.shipment.count({ where: { status: "pending" } }),
      prisma.shipment.count({ where: { slaBreached: true } }),
      prisma.shipment.count({ where: { status: "at_warehouse" } }),
    ]);

    const highRisk = await prisma.shipment.count({
      where: { riskScore: { gt: 60 }, status: { notIn: ["delivered", "cancelled"] } },
    });

    const avgRisk = await prisma.shipment.aggregate({
      _avg: { riskScore: true },
      where: { status: { notIn: ["delivered", "cancelled"] } },
    });

    return ApiResponse.success(res, {
      stats: {
        total,
        in_transit: inTransit,
        delayed,
        delivered,
        pending,
        at_warehouse: atWarehouse,
        sla_breached: slaBreached,
        high_risk: highRisk,
        avg_risk_score: Math.round((avgRisk._avg.riskScore || 0) * 10) / 10,
        on_time_rate: total > 0 ? Math.round(((total - slaBreached) / total) * 1000) / 10 : 100,
      },
    });
  } catch (error) {
    console.error("[Shipments] Error fetching stats:", error);
    return ApiResponse.error(res, "Failed to fetch shipment stats", 500);
  }
};

// send message to agent about a shipment
export const sendAgentMessage = async (req: Request, res: Response) => {
  try {
    const { shipment_id, consumer_id, message } = req.body;

    if (!consumer_id || !message?.content) {
      return ApiResponse.error(res, "consumer_id and message.content are required", 400);
    }

    let shipment;
    if (shipment_id) {
      shipment = await prisma.shipment.findFirst({
        where: { id: shipment_id, consumerId: consumer_id },
        include: { chatHistory: true },
      });
    }

    if (!shipment && shipment_id) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    // ensure chat history exists
    if (shipment && !shipment.chatHistory) {
      await prisma.chatHistory.create({
        data: { sessionId: shipment.id, messages: [] },
      });
    }

    if (shipment) {
      // add user message
      await prisma.chatHistory.update({
        where: { sessionId: shipment.id },
        data: {
          messages: {
            push: {
              role: "user",
              content: message.content,
              timestamp: new Date(),
              cards: null,
              toolsUsed: [],
              actionsTaken: [],
              isHuman: false,
            },
          },
        },
      });
    }

    // forward to n8n agent webhook
    const webhookUrl = config.webhook.agentUrl;
    const payload = {
      shipment_id: shipment?.id || null,
      consumer_id,
      message: { content: message.content },
    };

    let agentMessage = "Your request has been received. Let me look into this.";
    let cards: any[] = [];
    let toolsUsed: string[] = [];
    let actionsTaken: string[] = [];
    let reasoning: any = null;
    let confidenceScore: number | null = null;

    try {
      const webhookResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseText = await webhookResponse.text();
      console.log("[Agent] Webhook status:", webhookResponse.status);

      if (webhookResponse.ok && responseText) {
        try {
          const data = JSON.parse(responseText);
          const responseData = data.output || data;

          agentMessage = responseData.agent_message || responseData.message || agentMessage;
          cards = responseData.cards || [];
          toolsUsed = responseData.tools_used || [];
          actionsTaken = responseData.actions_taken || [];
          reasoning = responseData.reasoning || null;
          confidenceScore = responseData.confidence_score || null;
        } catch {
          if (responseText.length > 0 && responseText.length < 2000) {
            agentMessage = responseText;
          }
        }
      }
    } catch (webhookError) {
      console.error("[Agent] Webhook error:", webhookError);
      agentMessage = "I'm having trouble connecting to the analysis engine. Please try again.";
    }

    // store assistant response
    if (shipment) {
      await prisma.chatHistory.update({
        where: { sessionId: shipment.id },
        data: {
          messages: {
            push: {
              role: "assistant",
              content: agentMessage,
              timestamp: new Date(),
              cards: cards.length > 0 ? cards : null,
              toolsUsed,
              actionsTaken,
              reasoning,
              confidenceScore,
              isHuman: false,
            },
          },
        },
      });
    }

    return ApiResponse.success(res, {
      shipment_id: shipment?.id || null,
      agent_message: agentMessage,
      cards,
      tools_used: toolsUsed,
      actions_taken: actionsTaken,
      reasoning,
      confidence_score: confidenceScore,
    });
  } catch (error) {
    console.error("[Agent] Error:", error);
    return ApiResponse.error(res, "Failed to process message", 500);
  }
};

// normalizes prisma shipment to api response format
function normalize(shipment: any) {
  return {
    _id: shipment.id,
    tracking_id: shipment.trackingId,
    consumer_id: shipment.consumerId,
    consumer: shipment.consumer || undefined,
    status: shipment.status,
    priority: shipment.priority,
    origin: shipment.origin,
    destination: shipment.destination,
    current_location: shipment.currentLocation || null,
    carrier: shipment.carrier || null,
    warehouse: shipment.warehouse || null,
    estimated_delivery: shipment.estimatedDelivery,
    actual_delivery: shipment.actualDelivery || null,
    weight: shipment.weight,
    dimensions: shipment.dimensions || null,
    route_history: shipment.routeHistory || [],
    sla_deadline: shipment.slaDeadline,
    sla_breached: shipment.slaBreached,
    risk_score: shipment.riskScore,
    agent_notes: shipment.agentNotes || null,
    incidents: shipment.incidents?.map((inc: any) => ({
      _id: inc.id,
      incident_id: inc.incidentId,
      type: inc.type,
      severity: inc.severity,
      status: inc.status,
    })) || [],
    created_at: shipment.createdAt,
    updated_at: shipment.updatedAt,
  };
}
