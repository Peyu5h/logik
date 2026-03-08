import { Request, Response } from "express";
import prisma from "../config/database.js";
import ApiResponse from "../utils/apiResponse.js";

// agent observes all shipment states and recent logs
export const observe = async (_req: Request, res: Response) => {
  try {
    const shipments = await prisma.shipment.findMany({
      include: {
        carrier: { select: { id: true, name: true, code: true, reliabilityScore: true } },
        warehouse: { select: { id: true, name: true, code: true, status: true, congestionLevel: true } },
        consumer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const logs = await prisma.log.findMany({
      orderBy: { timestamp: "desc" },
      take: 20,
    });

    const incidents = await prisma.incident.findMany({
      where: { status: { in: ["open", "investigating", "in_progress", "escalated"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });



    const normalized = shipments.map((s) => ({
      _id: s.id,
      caseId: s.caseId,
      trackingId: s.trackingId,
      status: s.status,
      priority: s.priority,
      delay: s.delay,
      value: s.value,
      riskScore: s.riskScore,
      slaBreached: s.slaBreached,
      rerouted: s.rerouted,
      escalated: s.escalated,
      initialEta: s.initialEta,
      finalEta: s.finalEta,
      estimatedDelivery: s.estimatedDelivery,
      slaDeadline: s.slaDeadline,
      origin: s.origin,
      destination: s.destination,
      currentLocation: s.currentLocation,
      carrier: s.carrier,
      warehouse: s.warehouse,
      consumer: s.consumer,
      deliveryAddress: s.deliveryAddress,
      recipientName: s.recipientName,
      recipientPhone: s.recipientPhone,
      agentNotes: s.agentNotes,
      routeWaypoints: (s as any).routeWaypoints || [],
      updatedAt: s.updatedAt,
    }));

    const formattedLogs = logs.map((l) => ({
      id: l.logId,
      timestamp: l.timestamp,
      event: l.eventType,
      source: l.source,
      severity: l.severity,
      message: l.message,
    }));

    return ApiResponse.success(res, {
      shipments: normalized,
      recentLogs: formattedLogs,
      activeIncidents: incidents.length,
      observedAt: new Date(),
    });
  } catch (error) {
    console.error("[Agent] Observe error:", error);
    return ApiResponse.error(res, "Failed to observe shipments", 500);
  }
};

// risk assessment for a specific shipment
export const assessRisk = async (req: Request, res: Response) => {
  try {
    const { shipmentId } = req.params;

    let shipment;
    const caseIdNum = parseInt(shipmentId as string);
    if (!isNaN(caseIdNum) && caseIdNum >= 1 && caseIdNum <= 3) {
      shipment = await prisma.shipment.findUnique({
        where: { caseId: caseIdNum },
        include: {
          carrier: true,
          warehouse: true,
          incidents: { where: { status: { in: ["open", "investigating", "in_progress", "escalated"] } } },
        },
      });
    } else {
      shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId as string },
        include: {
          carrier: true,
          warehouse: true,
          incidents: { where: { status: { in: ["open", "investigating", "in_progress", "escalated"] } } },
        },
      });
    }

    if (!shipment) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    // calculate risk factors
    const factors: Array<{ factor: string; weight: number; score: number; detail: string }> = [];

    // delay risk
    if (shipment.delay > 0) {
      const delayScore = Math.min(40, (shipment.delay / 600) * 40);
      factors.push({
        factor: "delay",
        weight: 0.3,
        score: delayScore,
        detail: `${shipment.delay} minutes total delay (${(shipment.delay / 60).toFixed(1)}hrs)`,
      });
    }

    // sla risk
    if (shipment.slaDeadline) {
      const now = new Date();
      const eta = shipment.finalEta || shipment.estimatedDelivery;
      if (eta && shipment.slaDeadline) {
        const slaBuffer = (shipment.slaDeadline.getTime() - (eta as Date).getTime()) / (1000 * 60 * 60);
        if (slaBuffer < 0) {
          factors.push({ factor: "sla_breach", weight: 0.25, score: 35, detail: `SLA breached by ${Math.abs(slaBuffer).toFixed(1)}hrs` });
        } else if (slaBuffer < 4) {
          factors.push({ factor: "sla_proximity", weight: 0.25, score: 20, detail: `Only ${slaBuffer.toFixed(1)}hrs buffer before SLA deadline` });
        }
      }
    }

    // carrier reliability risk
    if (shipment.carrier) {
      const reliabilityRisk = Math.max(0, (100 - shipment.carrier.reliabilityScore) * 0.3);
      factors.push({
        factor: "carrier_reliability",
        weight: 0.2,
        score: reliabilityRisk,
        detail: `Carrier ${shipment.carrier.code} reliability: ${shipment.carrier.reliabilityScore}%`,
      });
    }

    // warehouse congestion risk
    if (shipment.warehouse) {
      const congestionMap: Record<string, number> = { low: 0, moderate: 10, high: 20, critical: 30 };
      const congestionRisk = congestionMap[shipment.warehouse.congestionLevel] || 0;
      if (congestionRisk > 0) {
        factors.push({
          factor: "warehouse_congestion",
          weight: 0.15,
          score: congestionRisk,
          detail: `Warehouse ${shipment.warehouse.code} congestion: ${shipment.warehouse.congestionLevel}`,
        });
      }
    }

    // active incidents risk
    if (shipment.incidents.length > 0) {
      const incidentRisk = Math.min(25, shipment.incidents.length * 10);
      factors.push({
        factor: "active_incidents",
        weight: 0.1,
        score: incidentRisk,
        detail: `${shipment.incidents.length} active incident(s)`,
      });
    }

    // value-based risk multiplier
    let valueMultiplier = 1.0;
    if (shipment.value > 100000) {
      valueMultiplier = 1.3;
      factors.push({ factor: "high_value", weight: 0, score: 0, detail: `High value shipment: INR ${shipment.value.toLocaleString("en-IN")}. Risk multiplied by 1.3x` });
    } else if (shipment.value > 50000) {
      valueMultiplier = 1.15;
      factors.push({ factor: "medium_value", weight: 0, score: 0, detail: `Medium-high value: INR ${shipment.value.toLocaleString("en-IN")}. Risk multiplied by 1.15x` });
    }

    const rawScore = factors.reduce((sum, f) => sum + f.score, 0);
    const computedRisk = Math.min(100, Math.round(rawScore * valueMultiplier));

    // recommendations
    const recommendations: string[] = [];
    if (computedRisk >= 70) {
      recommendations.push("Immediate intervention required. Consider rerouting to faster carrier.");
    }
    if (shipment.slaBreached) {
      recommendations.push("SLA already breached. Escalate to operations manager.");
    }
    if (shipment.delay >= 360 && !shipment.rerouted) {
      recommendations.push("Delay exceeds 6hrs. Recommend warehouse reroute for faster delivery.");
    }
    if (shipment.carrier && shipment.carrier.reliabilityScore < 80) {
      recommendations.push(`Carrier ${shipment.carrier.code} has low reliability. Consider reassignment.`);
    }
    if (computedRisk < 30) {
      recommendations.push("Low risk. Continue monitoring.");
    }

    return ApiResponse.success(res, {
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      currentRiskScore: shipment.riskScore,
      computedRiskScore: computedRisk,
      riskLevel: computedRisk >= 70 ? "critical" : computedRisk >= 40 ? "high" : computedRisk >= 20 ? "medium" : "low",
      factors,
      valueMultiplier,
      recommendations,
      shipmentState: {
        status: shipment.status,
        delay: shipment.delay,
        slaBreached: shipment.slaBreached,
        rerouted: shipment.rerouted,
        escalated: shipment.escalated,
      },
    });
  } catch (error) {
    console.error("[Agent] Risk assessment error:", error);
    return ApiResponse.error(res, "Failed to assess risk", 500);
  }
};

// reroutes shipment to new carrier
export const reroute = async (req: Request, res: Response) => {
  try {
    const { shipmentId, newCarrier, reason, autonomous } = req.body;

    if (!shipmentId) {
      return ApiResponse.error(res, "shipmentId is required", 400);
    }

    let shipment;
    const caseIdNum = parseInt(shipmentId);
    if (!isNaN(caseIdNum) && caseIdNum >= 1 && caseIdNum <= 3) {
      shipment = await prisma.shipment.findUnique({ where: { caseId: caseIdNum }, include: { carrier: true } });
    } else {
      shipment = await prisma.shipment.findUnique({ where: { id: shipmentId as string }, include: { carrier: true } });
    }

    if (!shipment) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    // find carrier by code
    let carrier: Awaited<ReturnType<typeof prisma.carrier.findFirst>> = null;
    if (newCarrier) {
      carrier = await prisma.carrier.findFirst({
        where: { code: newCarrier },
      });
    }

    // if no carrier specified, find best one
    if (!carrier) {
      carrier = await prisma.carrier.findFirst({
        where: {
          isActive: true,
          id: { not: shipment.carrierId || undefined },
        },
        orderBy: { reliabilityScore: "desc" },
      });
    }

    if (!carrier) {
      return ApiResponse.error(res, "No suitable carrier found", 400);
    }

    const oldCarrierCode = shipment.carrier?.code || "unassigned";

    const updated = await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        previousCarrierId: shipment.carrierId,
        carrierId: carrier.id,
        rerouted: true,
        agentNotes: reason || `Rerouted from ${oldCarrierCode} to ${carrier.code}`,
        updatedAt: new Date(),
      },
      include: {
        carrier: { select: { id: true, name: true, code: true, reliabilityScore: true } },
      },
    });

    await prisma.log.create({
      data: {
        logId: `log-reroute-${Date.now().toString(36)}`,
        timestamp: new Date(),
        eventType: "agent_reroute",
        source: "agent_engine",
        severity: "high",
        message: `Case ${shipment.caseId}: Rerouted from ${oldCarrierCode} to ${carrier.code}. Reason: ${reason || "agent decision"}`,
        metadata: { caseId: shipment.caseId, oldCarrier: oldCarrierCode, newCarrier: carrier.code, autonomous: autonomous || false } as any,
      },
    });

    await prisma.agentAction.create({
      data: {
        actionId: `act-reroute-${Date.now().toString(36)}`,
        actionType: "reroute",
        targetType: "shipment",
        targetId: shipment.id,
        description: `Rerouted Case ${shipment.caseId} from ${oldCarrierCode} to ${carrier.code}`,
        reasoning: reason || "Agent determined reroute is optimal",
        confidence: autonomous ? 0.85 : 0.95,
        outcome: "executed",
        requiredHuman: !autonomous,
      },
    });

    return ApiResponse.success(res, {
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      previousCarrier: oldCarrierCode,
      newCarrier: { code: carrier.code, name: carrier.name, reliability: carrier.reliabilityScore },
      rerouted: true,
    });
  } catch (error) {
    console.error("[Agent] Reroute error:", error);
    return ApiResponse.error(res, "Failed to reroute shipment", 500);
  }
};

// escalates a shipment
export const escalate = async (req: Request, res: Response) => {
  try {
    const { shipmentId, reason, urgency } = req.body;

    if (!shipmentId) {
      return ApiResponse.error(res, "shipmentId is required", 400);
    }

    let shipment;
    const caseIdNum = parseInt(shipmentId);
    if (!isNaN(caseIdNum) && caseIdNum >= 1 && caseIdNum <= 3) {
      shipment = await prisma.shipment.findUnique({ where: { caseId: caseIdNum } });
    } else {
      shipment = await prisma.shipment.findUnique({ where: { id: shipmentId as string } });
    }

    if (!shipment) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    const updated = await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        escalated: true,
        priority: urgency === "critical" ? "urgent" : shipment.priority === "medium" ? "high" : shipment.priority,
        agentNotes: reason || "Escalated by agent",
        updatedAt: new Date(),
      },
    });

    await prisma.log.create({
      data: {
        logId: `log-escalate-${Date.now().toString(36)}`,
        timestamp: new Date(),
        eventType: "agent_escalate",
        source: "agent_engine",
        severity: urgency === "critical" ? "critical" : "high",
        message: `Case ${shipment.caseId}: Escalated. Urgency: ${urgency || "high"}. Reason: ${reason || "agent decision"}`,
        metadata: { caseId: shipment.caseId, urgency, reason } as any,
      },
    });

    await prisma.agentAction.create({
      data: {
        actionId: `act-escalate-${Date.now().toString(36)}`,
        actionType: "escalate",
        targetType: "shipment",
        targetId: shipment.id,
        description: `Escalated Case ${shipment.caseId}. Urgency: ${urgency || "high"}`,
        reasoning: reason || "Risk threshold exceeded",
        confidence: 0.8,
        outcome: "executed",
        requiredHuman: true,
      },
    });

    return ApiResponse.success(res, {
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      escalated: true,
      urgency: urgency || "high",
      priority: updated.priority,
    });
  } catch (error) {
    console.error("[Agent] Escalate error:", error);
    return ApiResponse.error(res, "Failed to escalate shipment", 500);
  }
};

// reprioritizes a shipment
export const reprioritize = async (req: Request, res: Response) => {
  try {
    const { shipmentId, newPriority, reason } = req.body;

    if (!shipmentId || !newPriority) {
      return ApiResponse.error(res, "shipmentId and newPriority are required", 400);
    }

    const validPriorities = ["low", "medium", "high", "urgent"];
    if (!validPriorities.includes(newPriority)) {
      return ApiResponse.error(res, `Invalid priority. Valid: ${validPriorities.join(", ")}`, 400);
    }

    let shipment;
    const caseIdNum = parseInt(shipmentId);
    if (!isNaN(caseIdNum) && caseIdNum >= 1 && caseIdNum <= 3) {
      shipment = await prisma.shipment.findUnique({ where: { caseId: caseIdNum } });
    } else {
      shipment = await prisma.shipment.findUnique({ where: { id: shipmentId as string } });
    }

    if (!shipment) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    const oldPriority = shipment.priority;

    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        priority: newPriority,
        agentNotes: reason || `Priority changed from ${oldPriority} to ${newPriority}`,
        updatedAt: new Date(),
      },
    });

    await prisma.log.create({
      data: {
        logId: `log-reprioritize-${Date.now().toString(36)}`,
        timestamp: new Date(),
        eventType: "agent_reprioritize",
        source: "agent_engine",
        severity: "medium",
        message: `Case ${shipment.caseId}: Priority changed ${oldPriority} -> ${newPriority}. Reason: ${reason || "agent decision"}`,
        metadata: { caseId: shipment.caseId, oldPriority, newPriority } as any,
      },
    });

    await prisma.agentAction.create({
      data: {
        actionId: `act-reprioritize-${Date.now().toString(36)}`,
        actionType: "reprioritize",
        targetType: "shipment",
        targetId: shipment.id,
        description: `Reprioritized Case ${shipment.caseId}: ${oldPriority} -> ${newPriority}`,
        reasoning: reason || "Priority adjustment based on current state",
        confidence: 0.9,
        outcome: "executed",
        requiredHuman: false,
      },
    });

    return ApiResponse.success(res, {
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      previousPriority: oldPriority,
      newPriority,
    });
  } catch (error) {
    console.error("[Agent] Reprioritize error:", error);
    return ApiResponse.error(res, "Failed to reprioritize shipment", 500);
  }
};

// updates eta for a shipment
export const updateEta = async (req: Request, res: Response) => {
  try {
    const { shipmentId, newEtaMs, reason } = req.body;

    if (!shipmentId || !newEtaMs) {
      return ApiResponse.error(res, "shipmentId and newEtaMs are required", 400);
    }

    let shipment;
    const caseIdNum = parseInt(shipmentId);
    if (!isNaN(caseIdNum) && caseIdNum >= 1 && caseIdNum <= 3) {
      shipment = await prisma.shipment.findUnique({ where: { caseId: caseIdNum } });
    } else {
      shipment = await prisma.shipment.findUnique({ where: { id: shipmentId as string } });
    }

    if (!shipment) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    const newEta = new Date(newEtaMs);
    const oldEta = shipment.finalEta || shipment.estimatedDelivery;

    // recalculate delay
    let newDelay = shipment.delay;
    if (shipment.initialEta) {
      const diffMs = newEta.getTime() - shipment.initialEta.getTime();
      newDelay = Math.max(0, Math.round(diffMs / (1000 * 60)));
    }

    // check sla
    const slaBreached = shipment.slaDeadline ? newEta > shipment.slaDeadline : false;

    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        finalEta: newEta,
        estimatedDelivery: newEta,
        delay: newDelay,
        slaBreached: slaBreached || shipment.slaBreached,
        agentNotes: reason || `ETA updated to ${newEta.toISOString()}`,
        updatedAt: new Date(),
      },
    });

    await prisma.log.create({
      data: {
        logId: `log-eta-${Date.now().toString(36)}`,
        timestamp: new Date(),
        eventType: "agent_update_eta",
        source: "agent_engine",
        severity: slaBreached ? "critical" : "medium",
        message: `Case ${shipment.caseId}: ETA updated. Old: ${oldEta?.toISOString() || "none"}. New: ${newEta.toISOString()}. Delay: ${newDelay}min`,
        metadata: { caseId: shipment.caseId, oldEta: oldEta?.toISOString(), newEta: newEta.toISOString(), newDelay } as any,
      },
    });

    return ApiResponse.success(res, {
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      previousEta: oldEta?.toISOString() || null,
      newEta: newEta.toISOString(),
      delay: newDelay,
      slaBreached: slaBreached || shipment.slaBreached,
    });
  } catch (error) {
    console.error("[Agent] Update ETA error:", error);
    return ApiResponse.error(res, "Failed to update ETA", 500);
  }
};

// agent creates a log entry
export const createAgentLog = async (req: Request, res: Response) => {
  try {
    const { type, message, data } = req.body;

    if (!type || !message) {
      return ApiResponse.error(res, "type and message are required", 400);
    }

    const log = await prisma.log.create({
      data: {
        logId: `log-agent-${Date.now().toString(36)}`,
        timestamp: new Date(),
        eventType: type,
        source: "agent_engine",
        severity: data?.severity || "low",
        message,
        metadata: data || null,
      },
    });

    return ApiResponse.success(res, {
      id: log.logId,
      timestamp: log.timestamp,
      event: log.eventType,
      message: log.message,
    });
  } catch (error) {
    console.error("[Agent] Log error:", error);
    return ApiResponse.error(res, "Failed to create agent log", 500);
  }
};

// checks carrier reliability
export const carrierReliability = async (req: Request, res: Response) => {
  try {
    const { carrier: carrierCode } = req.params;

    const carrier = await prisma.carrier.findFirst({
      where: { code: carrierCode as string },
    });

    if (!carrier) {
      return ApiResponse.notFound(res, "Carrier not found");
    }

    const shipments = await prisma.shipment.findMany({
      where: { carrierId: carrier.id },
      select: {
        id: true,
        caseId: true,
        trackingId: true,
        status: true,
        delay: true,
        slaBreached: true,
        riskScore: true,
      } as any,
    });

    const delayed = shipments.filter((s: any) => s.status === "delayed");
    const delivered = shipments.filter((s: any) => s.status === "delivered");
    const breached = shipments.filter((s: any) => s.slaBreached);
    const avgDelay = shipments.length > 0
      ? Math.round(shipments.reduce((sum: number, s: any) => sum + (s.delay || 0), 0) / shipments.length)
      : 0;
    const avgRisk = shipments.length > 0
      ? Math.round(shipments.reduce((sum: number, s: any) => sum + (s.riskScore || 0), 0) / shipments.length)
      : 0;

    return ApiResponse.success(res, {
      carrier: {
        code: carrier.code,
        name: carrier.name,
        reliabilityScore: carrier.reliabilityScore,
        onTimeRate: carrier.onTimeRate,
        failureRate: carrier.failureRate,
        avgDeliveryTime: carrier.avgDeliveryTime,
        regions: carrier.regions,
      },
      currentShipments: {
        total: shipments.length,
        delayed: delayed.length,
        delivered: delivered.length,
        slaBreached: breached.length,
        avgDelay,
        avgRisk,
      },
      shipments: shipments.map((s) => ({
        caseId: s.caseId,
        trackingId: s.trackingId,
        status: s.status,
        delay: s.delay,
        slaBreached: s.slaBreached,
        riskScore: s.riskScore,
      })),
    });
  } catch (error) {
    console.error("[Agent] Carrier reliability error:", error);
    return ApiResponse.error(res, "Failed to fetch carrier reliability", 500);
  }
};

// update shipment status (for agent to move shipments through flow)
// resolves shipment by caseId, trackingId, or mongo ObjectId
async function resolveShipment(shipmentId: string) {
  const caseIdNum = parseInt(shipmentId);
  if (!isNaN(caseIdNum) && caseIdNum >= 1 && caseIdNum <= 999) {
    return prisma.shipment.findUnique({ where: { caseId: caseIdNum }, include: { carrier: true, consumer: { select: { id: true, name: true, email: true } } } });
  }
  if (shipmentId.startsWith("SHP-")) {
    return prisma.shipment.findUnique({ where: { trackingId: shipmentId }, include: { carrier: true, consumer: { select: { id: true, name: true, email: true } } } });
  }
  try {
    return await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { carrier: true, consumer: { select: { id: true, name: true, email: true } } } });
  } catch {
    return null;
  }
}

// fires email webhook for status changes
async function fireStatusEmailWebhook(payload: Record<string, unknown>) {
  const emailWebhookUrl =
    process.env.WEBHOOK_EMAIL_URL || process.env.WEBHOOK_SHIPMENT_UPDATE_URL || "https://mihirj.app.n8n.cloud/webhook/logistics-agent";
  try {
    const res = await fetch(emailWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email_notification", ...payload }),
    });
    if (!res.ok) {
      console.warn(`[Agent] Email webhook returned ${res.status}`);
      return { status: res.status, error: `Email webhook error (${res.status})` };
    }
    console.log("[Agent] Email webhook fired:", res.status);
    return { status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Agent] Email webhook unreachable: ${msg}`);
    return { status: 0, error: msg };
  }
}

export const updateShipmentStatus = async (req: Request, res: Response) => {
  try {
    const { shipmentId, status, currentLocation, agentNotes } = req.body;

    if (!shipmentId || !status) {
      return ApiResponse.error(res, "shipmentId and status are required", 400);
    }

    const shipment = await resolveShipment(shipmentId);

    if (!shipment) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (currentLocation) {
      updateData.currentLocation = currentLocation;
      updateData.routeHistory = {
        push: {
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          label: currentLocation.address || status,
          timestamp: new Date(),
          status,
        },
      };
    }

    if (agentNotes) {
      updateData.agentNotes = agentNotes;
    }

    if (status === "delivered") {
      updateData.actualDelivery = new Date();
    }

    const updated = await prisma.shipment.update({
      where: { id: shipment.id },
      data: updateData,
    });

    await prisma.log.create({
      data: {
        logId: `log-status-${Date.now().toString(36)}`,
        timestamp: new Date(),
        eventType: "agent_status_update",
        source: "agent_engine",
        severity: status === "delayed" ? "high" : "low",
        message: `Case ${shipment.caseId}: Status changed ${shipment.status} -> ${status}`,
        metadata: { caseId: shipment.caseId, oldStatus: shipment.status, newStatus: status } as any,
      },
    });

    // trigger email on delayed/lost/cancelled status
    let emailResult: any = null;
    if (["delayed", "lost", "cancelled"].includes(status) && shipment.consumer?.email) {
      emailResult = await fireStatusEmailWebhook({
        trigger: `status_change_${status}`,
        caseId: shipment.caseId,
        trackingId: shipment.trackingId,
        consumerEmail: shipment.consumer.email,
        consumerName: shipment.consumer.name,
        previousStatus: shipment.status,
        newStatus: status,
        currentLocation: currentLocation || null,
        message: `Your shipment ${shipment.trackingId} status has changed to ${status}.${status === "delayed" ? " Our team is working on resolving this." : ""}`,
      });

      await prisma.log.create({
        data: {
          logId: `log-email-${Date.now().toString(36)}`,
          timestamp: new Date(),
          eventType: "email_notification",
          source: "agent_engine",
          severity: "medium",
          message: `Case ${shipment.caseId}: Email sent to ${shipment.consumer.email} for status change to ${status}`,
          metadata: { caseId: shipment.caseId, consumerEmail: shipment.consumer.email, status } as any,
        },
      });
    }

    return ApiResponse.success(res, {
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      previousStatus: shipment.status,
      newStatus: status,
      emailTriggered: emailResult !== null,
    });
  } catch (error) {
    console.error("[Agent] Status update error:", error);
    return ApiResponse.error(res, "Failed to update shipment status", 500);
  }
};

// get shipment by caseid
export const getShipmentByCaseId = async (req: Request, res: Response) => {
  try {
    const caseIdNum = parseInt(req.params.caseId as string);

    if (isNaN(caseIdNum)) {
      return ApiResponse.error(res, "Invalid caseId", 400);
    }

    const shipment = await prisma.shipment.findUnique({
      where: { caseId: caseIdNum },
      include: {
        carrier: true,
        warehouse: true,
        consumer: { select: { id: true, name: true, email: true } },
        incidents: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!shipment) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    return ApiResponse.success(res, {
      _id: shipment.id,
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      status: shipment.status,
      priority: shipment.priority,
      delay: shipment.delay,
      value: shipment.value,
      riskScore: shipment.riskScore,
      slaBreached: shipment.slaBreached,
      rerouted: shipment.rerouted,
      escalated: shipment.escalated,
      initialEta: shipment.initialEta,
      finalEta: shipment.finalEta,
      estimatedDelivery: shipment.estimatedDelivery,
      actualDelivery: shipment.actualDelivery,
      slaDeadline: shipment.slaDeadline,
      origin: shipment.origin,
      destination: shipment.destination,
      currentLocation: shipment.currentLocation,
      carrier: shipment.carrier ? {
        _id: shipment.carrier.id,
        name: shipment.carrier.name,
        code: shipment.carrier.code,
        reliabilityScore: shipment.carrier.reliabilityScore,
      } : null,
      warehouse: shipment.warehouse ? {
        _id: shipment.warehouse.id,
        name: shipment.warehouse.name,
        code: shipment.warehouse.code,
        status: shipment.warehouse.status,
        congestionLevel: shipment.warehouse.congestionLevel,
      } : null,
      consumer: shipment.consumer,
      deliveryAddress: shipment.deliveryAddress,
      recipientName: shipment.recipientName,
      recipientPhone: shipment.recipientPhone,
      routeHistory: shipment.routeHistory,
      routeWaypoints: shipment.routeWaypoints || [],
      route: [
        shipment.origin?.city,
        ...(shipment.routeWaypoints || [])
          .sort((a: any, b: any) => a.order - b.order)
          .map((wp: any) => wp.city),
        shipment.destination?.city,
      ].filter(Boolean),
      agentNotes: shipment.agentNotes,
      incidents: shipment.incidents.map((i) => ({
        _id: i.id,
        incidentId: i.incidentId,
        type: i.type,
        severity: i.severity,
        status: i.status,
        title: i.title,
      })),
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt,
    });
  } catch (error) {
    console.error("[Agent] Get shipment by caseId error:", error);
    return ApiResponse.error(res, "Failed to fetch shipment", 500);
  }
};

// update carrier details (exposed for n8n agent)
// accepts carrierCode from params, body, or query for max compatibility
// n8n may send GET with query params or POST with body
export const updateCarrier = async (req: Request, res: Response) => {
  try {
    // merge body + query so both GET?key=val and POST {body} work
    const fields: any = { ...req.query, ...req.body };

    // resolve carrier code: route param > body/query field
    const carrierCode =
      req.params.carrierCode ||
      fields.carrierCode ||
      fields.carrier_code ||
      fields.code;

    if (!carrierCode) {
      return ApiResponse.error(
        res,
        "carrierCode is required (as URL param, query param, or body field)",
        400,
      );
    }

    const carrier = await prisma.carrier.findUnique({ where: { code: String(carrierCode) } });
    if (!carrier) {
      return ApiResponse.notFound(res, `Carrier with code ${carrierCode} not found`);
    }

    // coerce types — n8n GET sends everything as strings
    const toNum = (v: unknown): number | undefined => {
      if (v === undefined || v === null || v === "") return undefined;
      const n = Number(v);
      return isNaN(n) ? undefined : n;
    };

    const toBool = (v: unknown): boolean | undefined => {
      if (v === undefined || v === null || v === "") return undefined;
      if (typeof v === "boolean") return v;
      if (v === "true" || v === "1") return true;
      if (v === "false" || v === "0") return false;
      return undefined;
    };

    // parse regions — may arrive as JSON string from n8n
    let parsedRegions: string[] | undefined;
    if (fields.regions !== undefined) {
      if (Array.isArray(fields.regions)) {
        parsedRegions = fields.regions;
      } else if (typeof fields.regions === "string") {
        try {
          const parsed = JSON.parse(fields.regions);
          if (Array.isArray(parsed)) parsedRegions = parsed;
        } catch {
          // comma-separated fallback
          parsedRegions = fields.regions.split(",").map((s: string) => s.trim()).filter(Boolean);
        }
      }
    }

    const updateData: any = { updatedAt: new Date() };
    if (fields.name !== undefined && fields.name !== "") updateData.name = String(fields.name);
    const rs = toNum(fields.reliabilityScore);
    if (rs !== undefined) updateData.reliabilityScore = Math.max(0, Math.min(100, rs));
    const adt = toNum(fields.avgDeliveryTime);
    if (adt !== undefined) updateData.avgDeliveryTime = adt;
    const otr = toNum(fields.onTimeRate);
    if (otr !== undefined) updateData.onTimeRate = Math.max(0, Math.min(100, otr));
    const fr = toNum(fields.failureRate);
    if (fr !== undefined) updateData.failureRate = Math.max(0, Math.min(100, fr));
    if (parsedRegions !== undefined) updateData.regions = parsedRegions;
    const ia = toBool(fields.isActive);
    if (ia !== undefined) updateData.isActive = ia;

    if (Object.keys(updateData).length <= 1) {
      return ApiResponse.error(res, "No updatable fields provided", 400);
    }

    const updated = await prisma.carrier.update({
      where: { id: carrier.id },
      data: updateData,
    });

    await prisma.log.create({
      data: {
        logId: `log-carrier-${Date.now().toString(36)}`,
        timestamp: new Date(),
        eventType: "carrier_update",
        source: "agent_engine",
        severity: "medium",
        message: `Carrier ${carrierCode} updated by agent. Fields: ${Object.keys(updateData).filter(k => k !== "updatedAt").join(", ")}`,
        metadata: { carrierCode, changes: updateData } as any,
      },
    });

    return ApiResponse.success(res, {
      carrier: {
        code: updated.code,
        name: updated.name,
        reliabilityScore: updated.reliabilityScore,
        avgDeliveryTime: updated.avgDeliveryTime,
        onTimeRate: updated.onTimeRate,
        failureRate: updated.failureRate,
        regions: updated.regions,
        isActive: updated.isActive,
      },
      previous: {
        name: carrier.name,
        reliabilityScore: carrier.reliabilityScore,
        avgDeliveryTime: carrier.avgDeliveryTime,
        onTimeRate: carrier.onTimeRate,
        failureRate: carrier.failureRate,
        regions: carrier.regions,
        isActive: carrier.isActive,
      },
    });
  } catch (error) {
    console.error("[Agent] Update carrier error:", error);
    return ApiResponse.error(res, "Failed to update carrier", 500);
  }
};
