import { Request, Response } from "express";
import prisma from "../config/database.js";
import ApiResponse from "../utils/apiResponse.js";
import { config } from "../config/env.js";

// valid trigger issue types
const VALID_ISSUES = [
  "warehouse_congestion",
  "carrier_breakdown",
  "late_pickup",
  "weather_disruption",
  "customs_hold",
  "inaccurate_ETA",
  "SLA_BREACH",
  "resolve",
] as const;

type IssueType = (typeof VALID_ISSUES)[number];

// delay config per issue type (minutes)
const ISSUE_DELAY_MAP: Record<string, number> = {
  warehouse_congestion: 180,
  carrier_breakdown: 240,
  late_pickup: 120,
  weather_disruption: 300,
  customs_hold: 360,
  inaccurate_ETA: 90,
  SLA_BREACH: 0,
  resolve: 0,
};

// risk score impact per issue
const ISSUE_RISK_MAP: Record<string, number> = {
  warehouse_congestion: 25,
  carrier_breakdown: 40,
  late_pickup: 20,
  weather_disruption: 35,
  customs_hold: 30,
  inaccurate_ETA: 15,
  SLA_BREACH: 50,
  resolve: -100,
};

// severity per issue
const ISSUE_SEVERITY_MAP: Record<string, string> = {
  warehouse_congestion: "high",
  carrier_breakdown: "critical",
  late_pickup: "medium",
  weather_disruption: "high",
  customs_hold: "high",
  inaccurate_ETA: "medium",
  SLA_BREACH: "critical",
  resolve: "low",
};

// generates a unique log id
function logId(): string {
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}

// generates a unique incident id
function incidentId(): string {
  return `INC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
}

// creates a log entry
async function createLog(
  eventType: string,
  source: string,
  severity: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  return prisma.log.create({
    data: {
      logId: logId(),
      timestamp: new Date(),
      eventType,
      source,
      severity,
      message,
      metadata: (metadata as any) || null,
    },
  });
}

// fires n8n webhook with trigger context
async function fireWebhook(payload: Record<string, unknown>) {
  const webhookUrl = config.webhook.agentUrl;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log("[Trigger] Webhook fired:", res.status, text.substring(0, 200));
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not json
    }
    return { status: res.status, response: parsed || text };
  } catch (err) {
    console.error("[Trigger] Webhook error:", err);
    return { status: 0, response: null, error: String(err) };
  }
}

// fires email notification webhook
async function fireEmailWebhook(payload: Record<string, unknown>) {
  const emailWebhookUrl =
    process.env.WEBHOOK_EMAIL_URL ||
    config.webhook.shipmentUpdateUrl;
  try {
    const res = await fetch(emailWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email_notification", ...payload }),
    });
    console.log("[Trigger] Email webhook fired:", res.status);
    return { status: res.status };
  } catch (err) {
    console.error("[Trigger] Email webhook error:", err);
    return { status: 0, error: String(err) };
  }
}

// finds best available carrier for reroute
async function findBestCarrier(
  excludeCarrierId: string | null,
  regions: string[]
): Promise<{ id: string; name: string; code: string; reliabilityScore: number } | null> {
  const carriers = await prisma.carrier.findMany({
    where: {
      isActive: true,
      ...(excludeCarrierId ? { id: { not: excludeCarrierId } } : {}),
    },
    orderBy: { reliabilityScore: "desc" },
  });

  // prefer carrier that covers the required regions
  const regionMatch = carriers.find((c) =>
    regions.some((r) => c.regions.includes(r))
  );

  return regionMatch || carriers[0] || null;
}

// finds next warehouse on route
async function findNextWarehouse(
  currentWarehouseId: string | null,
  destinationRegion: string
): Promise<{ id: string; name: string; code: string } | null> {
  const warehouses = await prisma.warehouse.findMany({
    where: {
      isActive: true,
      status: { in: ["operational", "degraded"] },
      congestionLevel: { in: ["low", "moderate"] },
      ...(currentWarehouseId ? { id: { not: currentWarehouseId } } : {}),
    },
    orderBy: { utilizationPct: "asc" },
  });

  // prefer warehouse in destination region
  const regionMatch = warehouses.find((w) =>
    w.regions.includes(destinationRegion)
  );

  return regionMatch || warehouses[0] || null;
}

// handles trigger for a specific shipment and issue
export const handleTrigger = async (req: Request, res: Response) => {
  try {
    const { shipmentId, issue } = req.params;

    if (!VALID_ISSUES.includes(issue as IssueType)) {
      return ApiResponse.error(
        res,
        `Invalid issue type. Valid types: ${VALID_ISSUES.join(", ")}`,
        400
      );
    }

    // find shipment by caseId (integer) or mongo id
    let shipment;
    const caseIdNum = parseInt(shipmentId);
    if (!isNaN(caseIdNum) && caseIdNum >= 1 && caseIdNum <= 3) {
      shipment = await prisma.shipment.findUnique({
        where: { caseId: caseIdNum },
        include: {
          carrier: true,
          warehouse: true,
          consumer: { select: { id: true, name: true, email: true } },
        },
      });
    } else {
      shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
        include: {
          carrier: true,
          warehouse: true,
          consumer: { select: { id: true, name: true, email: true } },
        },
      });
    }

    if (!shipment) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    const issueType = issue as IssueType;
    const delayMinutes = ISSUE_DELAY_MAP[issueType] || 0;
    const riskDelta = ISSUE_RISK_MAP[issueType] || 0;
    const severity = ISSUE_SEVERITY_MAP[issueType] || "medium";
    const now = new Date();

    // handle resolve trigger
    if (issueType === "resolve") {
      return handleResolveTrigger(res, shipment);
    }

    // calculate new values
    const newDelay = shipment.delay + delayMinutes;
    const newRisk = Math.min(100, Math.max(0, shipment.riskScore + riskDelta));
    const newFinalEta = shipment.finalEta
      ? new Date(shipment.finalEta.getTime() + delayMinutes * 60 * 1000)
      : shipment.estimatedDelivery
        ? new Date(shipment.estimatedDelivery.getTime() + delayMinutes * 60 * 1000)
        : null;

    // check sla breach
    const slaBreached =
      shipment.slaBreached ||
      (shipment.slaDeadline && newFinalEta && newFinalEta > shipment.slaDeadline);

    // determine new status
    let newStatus = shipment.status as string;
    if ((issueType as string) !== "resolve" && shipment.status !== "delivered" && shipment.status !== "cancelled") {
      if (newDelay >= 120 || issueType === "carrier_breakdown" || issueType === "late_pickup") {
        newStatus = "delayed";
      }
    }

    // determine new priority based on accumulated delay
    let newPriority = shipment.priority as string;
    if (newDelay >= 360) {
      newPriority = "urgent";
    } else if (newDelay >= 240) {
      newPriority = "high";
    }

    const updateData: any = {
      delay: newDelay,
      riskScore: newRisk,
      finalEta: newFinalEta,
      estimatedDelivery: newFinalEta,
      slaBreached: slaBreached || false,
      status: newStatus,
      priority: newPriority,
      updatedAt: now,
    };

    // late pickup: if pending for 2+ hrs total delay, reassign carrier
    let carrierReassigned = false;
    let newCarrierInfo: any = null;

    if (issueType === "late_pickup" && newDelay >= 120 && shipment.status === "pending") {
      const destRegion = shipment.destination?.region || "";
      const bestCarrier = await findBestCarrier(shipment.carrierId, [destRegion]);
      if (bestCarrier) {
        updateData.previousCarrierId = shipment.carrierId;
        updateData.carrierId = bestCarrier.id;
        updateData.rerouted = true;
        updateData.agentNotes = `Carrier reassigned from ${shipment.carrier?.code || "unknown"} to ${bestCarrier.code} due to late pickup (${newDelay}min delay)`;
        carrierReassigned = true;
        newCarrierInfo = bestCarrier;

        await createLog(
          "carrier_reassigned",
          "trigger_engine",
          "high",
          `Case ${shipment.caseId}: Carrier reassigned to ${bestCarrier.code} (reliability: ${bestCarrier.reliabilityScore}%) due to late pickup`,
          { caseId: shipment.caseId, oldCarrier: shipment.carrier?.code, newCarrier: bestCarrier.code }
        );
      }
    }

    // carrier breakdown: immediate reassignment
    if (issueType === "carrier_breakdown") {
      const destRegion = shipment.destination?.region || "";
      const bestCarrier = await findBestCarrier(shipment.carrierId, [destRegion]);
      if (bestCarrier) {
        updateData.previousCarrierId = shipment.carrierId;
        updateData.carrierId = bestCarrier.id;
        updateData.rerouted = true;
        updateData.agentNotes = `Carrier ${shipment.carrier?.code || "unknown"} breakdown. Reassigned to ${bestCarrier.code}`;
        carrierReassigned = true;
        newCarrierInfo = bestCarrier;

        await createLog(
          "carrier_reassigned",
          "trigger_engine",
          "critical",
          `Case ${shipment.caseId}: Emergency reassignment to ${bestCarrier.code} due to carrier breakdown`,
          { caseId: shipment.caseId, oldCarrier: shipment.carrier?.code, newCarrier: bestCarrier.code }
        );
      }
    }

    // 6hrs total delay: trigger email notification
    let emailTriggered = false;
    if (newDelay >= 360 && shipment.delay < 360) {
      emailTriggered = true;
      await fireEmailWebhook({
        trigger: "delay_email_6hrs",
        caseId: shipment.caseId,
        trackingId: shipment.trackingId,
        consumerEmail: shipment.consumer?.email,
        consumerName: shipment.consumer?.name,
        totalDelay: newDelay,
        currentStatus: newStatus,
        estimatedDelivery: newFinalEta?.toISOString(),
        message: `Your shipment ${shipment.trackingId} is experiencing significant delays (${Math.round(newDelay / 60)}hrs). We are actively working to resolve this.`,
      });

      await createLog(
        "email_notification",
        "notification_service",
        "high",
        `Case ${shipment.caseId}: Delay email sent to ${shipment.consumer?.email} - total delay ${Math.round(newDelay / 60)}hrs`,
        { caseId: shipment.caseId, consumerEmail: shipment.consumer?.email, delayMinutes: newDelay }
      );
    }

    // 10hrs total delay: reroute to different warehouse + new carrier
    let warehouseRerouted = false;
    let newWarehouseInfo: any = null;
    if (newDelay >= 600 && shipment.delay < 600) {
      const destRegion = shipment.destination?.region || "";
      const nextWarehouse = await findNextWarehouse(shipment.warehouseId, destRegion);
      if (nextWarehouse) {
        updateData.nextWarehouseId = nextWarehouse.id;
        updateData.warehouseId = nextWarehouse.id;
        updateData.rerouted = true;
        updateData.escalated = true;
        warehouseRerouted = true;
        newWarehouseInfo = nextWarehouse;

        // also get best carrier for the new warehouse region
        if (!carrierReassigned) {
          const bestCarrier = await findBestCarrier(shipment.carrierId, [destRegion]);
          if (bestCarrier) {
            updateData.previousCarrierId = shipment.carrierId;
            updateData.carrierId = bestCarrier.id;
            carrierReassigned = true;
            newCarrierInfo = bestCarrier;
          }
        }

        updateData.agentNotes = `Critical delay (${Math.round(newDelay / 60)}hrs). Rerouted to ${nextWarehouse.name} with ${newCarrierInfo?.code || "best available"} carrier for priority delivery.`;

        await createLog(
          "warehouse_reroute",
          "trigger_engine",
          "critical",
          `Case ${shipment.caseId}: Rerouted to warehouse ${nextWarehouse.code} due to ${Math.round(newDelay / 60)}hrs delay. Priority delivery activated.`,
          {
            caseId: shipment.caseId,
            oldWarehouse: shipment.warehouse?.code,
            newWarehouse: nextWarehouse.code,
            newCarrier: newCarrierInfo?.code,
          }
        );

        // fire email for warehouse reroute
        await fireEmailWebhook({
          trigger: "warehouse_reroute_10hrs",
          caseId: shipment.caseId,
          trackingId: shipment.trackingId,
          consumerEmail: shipment.consumer?.email,
          consumerName: shipment.consumer?.name,
          totalDelay: newDelay,
          newWarehouse: nextWarehouse.name,
          message: `Your shipment ${shipment.trackingId} has been rerouted through ${nextWarehouse.name} for faster delivery. New estimated delivery has been updated.`,
        });
      }
    }

    // sla breach: auto-escalate and trigger email
    if (slaBreached && !shipment.slaBreached) {
      updateData.escalated = true;

      await createLog(
        "sla_breach",
        "sla_monitor",
        "critical",
        `Case ${shipment.caseId}: SLA BREACHED. Deadline was ${shipment.slaDeadline?.toISOString()}. Current ETA: ${newFinalEta?.toISOString()}`,
        { caseId: shipment.caseId, slaDeadline: shipment.slaDeadline, newEta: newFinalEta }
      );

      await fireEmailWebhook({
        trigger: "sla_breach",
        caseId: shipment.caseId,
        trackingId: shipment.trackingId,
        consumerEmail: shipment.consumer?.email,
        consumerName: shipment.consumer?.name,
        slaDeadline: shipment.slaDeadline?.toISOString(),
        estimatedDelivery: newFinalEta?.toISOString(),
        message: `Your shipment ${shipment.trackingId} has missed its SLA deadline. Our team has been notified and is prioritizing resolution.`,
      });
    }

    // explicit SLA_BREACH trigger
    if (issueType === "SLA_BREACH") {
      updateData.slaBreached = true;
      updateData.escalated = true;
      updateData.priority = "urgent" as any;

      if (!shipment.slaBreached) {
        await fireEmailWebhook({
          trigger: "sla_breach_manual",
          caseId: shipment.caseId,
          trackingId: shipment.trackingId,
          consumerEmail: shipment.consumer?.email,
          consumerName: shipment.consumer?.name,
          message: `SLA breach declared for shipment ${shipment.trackingId}. Immediate action required.`,
        });
      }
    }

    // update shipment
    const updated = await prisma.shipment.update({
      where: { id: shipment.id },
      data: updateData,
      include: {
        carrier: { select: { id: true, name: true, code: true, reliabilityScore: true } },
        warehouse: { select: { id: true, name: true, code: true, status: true } },
        consumer: { select: { id: true, name: true, email: true } },
      },
    });

    // create trigger log
    await createLog(
      `trigger_${issueType}`,
      "trigger_engine",
      severity,
      `Case ${shipment.caseId}: ${issueType.replace(/_/g, " ")} triggered. Delay +${delayMinutes}min (total: ${newDelay}min). Risk: ${newRisk}%`,
      {
        caseId: shipment.caseId,
        issue: issueType,
        delayAdded: delayMinutes,
        totalDelay: newDelay,
        riskScore: newRisk,
        carrierReassigned,
        emailTriggered,
        warehouseRerouted,
        slaBreached: slaBreached || false,
      }
    );

    // create incident record
    if (issueType as string !== "resolve") {
      const incidentType = mapIssueToIncidentType(issueType as IssueType) as any;
      await prisma.incident.create({
        data: {
          incidentId: incidentId(),
          shipmentId: shipment.id,
          type: incidentType,
          severity: (severity === "critical" ? "critical" : severity === "high" ? "high" : "medium") as any,
          status: "open",
          title: `Case ${shipment.caseId}: ${issueType.replace(/_/g, " ").toUpperCase()}`,
          description: buildIncidentDescription(issueType as IssueType, shipment, newDelay, carrierReassigned, warehouseRerouted),
          riskScore: newRisk,
          isEscalated: newRisk >= 70 || Boolean(slaBreached),
          escalatedAt: newRisk >= 70 || slaBreached ? now : undefined,
        },
      });
    }

    // fire n8n webhook with full context
    const webhookPayload = {
      trigger_type: issueType,
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      shipmentId: shipment.id,
      consumer: shipment.consumer,
      currentState: {
        status: updated.status,
        priority: updated.priority,
        delay: newDelay,
        riskScore: newRisk,
        slaBreached: slaBreached || false,
        rerouted: updated.rerouted,
        escalated: updated.escalated,
        carrier: updated.carrier,
        warehouse: updated.warehouse,
        finalEta: newFinalEta?.toISOString(),
        value: shipment.value,
      },
      actions: {
        carrierReassigned,
        newCarrier: newCarrierInfo
          ? { code: newCarrierInfo.code, name: newCarrierInfo.name, reliability: newCarrierInfo.reliabilityScore }
          : null,
        warehouseRerouted,
        newWarehouse: newWarehouseInfo
          ? { code: newWarehouseInfo.code, name: newWarehouseInfo.name }
          : null,
        emailTriggered,
        slaBreachDetected: slaBreached && !shipment.slaBreached,
      },
      origin: shipment.origin,
      destination: shipment.destination,
      deliveryAddress: shipment.deliveryAddress,
      recipientName: shipment.recipientName,
      recipientPhone: shipment.recipientPhone,
      timestamp: now.toISOString(),
    };

    const webhookResult = await fireWebhook(webhookPayload);

    // log agent action
    await prisma.agentAction.create({
      data: {
        actionId: `act-trigger-${Date.now().toString(36)}`,
        actionType: "trigger_response",
        targetType: "shipment",
        targetId: shipment.id,
        description: `Processed ${issueType} for Case ${shipment.caseId}. Delay: +${delayMinutes}min (total: ${newDelay}min)`,
        confidence: 0.9,
        outcome: "executed",
        requiredHuman: newRisk >= 80,
        reasoning: buildActionReasoning(issueType as IssueType, newDelay, carrierReassigned, warehouseRerouted, emailTriggered),
        metadata: webhookPayload as any,
      },
    });

    return ApiResponse.success(res, {
      trigger: issueType,
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      changes: {
        delay: { previous: shipment.delay, added: delayMinutes, total: newDelay },
        riskScore: { previous: shipment.riskScore, new: newRisk },
        status: { previous: shipment.status, new: updated.status },
        priority: { previous: shipment.priority, new: updated.priority },
        finalEta: newFinalEta?.toISOString(),
        slaBreached: slaBreached || false,
      },
      actions: {
        carrierReassigned,
        newCarrier: newCarrierInfo
          ? { code: newCarrierInfo.code, name: newCarrierInfo.name }
          : null,
        warehouseRerouted,
        newWarehouse: newWarehouseInfo
          ? { code: newWarehouseInfo.code, name: newWarehouseInfo.name }
          : null,
        emailTriggered,
      },
      webhookResult,
    });
  } catch (error) {
    console.error("[Trigger] Error:", error);
    return ApiResponse.error(res, "Failed to process trigger", 500);
  }
};

// resolves all active issues for a shipment
async function handleResolveTrigger(res: Response, shipment: any) {
  const now = new Date();

  const updateData: any = {
    riskScore: 0,
    delay: 0,
    finalEta: shipment.initialEta,
    estimatedDelivery: shipment.initialEta,
    status: shipment.status === "delayed" ? "in_transit" : shipment.status === "pending" ? "pending" : shipment.status,
    slaBreached: false,
    escalated: false,
    agentNotes: "All issues resolved. Shipment back on track.",
    updatedAt: now,
  };

  const updated = await prisma.shipment.update({
    where: { id: shipment.id },
    data: updateData,
    include: {
      carrier: { select: { id: true, name: true, code: true } },
      warehouse: { select: { id: true, name: true, code: true } },
    },
  });

  // resolve open incidents
  await prisma.incident.updateMany({
    where: { shipmentId: shipment.id, status: { in: ["open", "investigating", "in_progress", "escalated"] } },
    data: { status: "resolved", resolution: "Auto-resolved via trigger", updatedAt: now },
  });

  await createLog(
    "trigger_resolve",
    "trigger_engine",
    "low",
    `Case ${shipment.caseId}: All issues resolved. Delay reset, risk cleared, ETA restored.`,
    { caseId: shipment.caseId }
  );

  const webhookResult = await fireWebhook({
    trigger_type: "resolve",
    caseId: shipment.caseId,
    trackingId: shipment.trackingId,
    shipmentId: shipment.id,
    currentState: {
      status: updated.status,
      delay: 0,
      riskScore: 0,
      slaBreached: false,
    },
    timestamp: now.toISOString(),
  });

  return ApiResponse.success(res, {
    trigger: "resolve",
    caseId: shipment.caseId,
    trackingId: shipment.trackingId,
    message: "All issues resolved",
    webhookResult,
  });
}

// get all available triggers info
export const getTriggerInfo = async (_req: Request, res: Response) => {
  return ApiResponse.success(res, {
    triggers: VALID_ISSUES.map((issue) => ({
      id: issue,
      label: issue.replace(/_/g, " "),
      delayMinutes: ISSUE_DELAY_MAP[issue] || 0,
      riskImpact: ISSUE_RISK_MAP[issue] || 0,
      severity: ISSUE_SEVERITY_MAP[issue] || "medium",
    })),
    thresholds: {
      late_pickup_reassign_minutes: 120,
      email_notification_minutes: 360,
      warehouse_reroute_minutes: 600,
      sla_breach_auto_escalate: true,
    },
  });
};

// get trigger history for a shipment
export const getTriggerHistory = async (req: Request, res: Response) => {
  try {
    const { shipmentId } = req.params;

    let caseId: number | undefined;
    const parsed = parseInt(shipmentId);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 3) {
      caseId = parsed;
    }

    let shipment;
    if (caseId) {
      shipment = await prisma.shipment.findUnique({ where: { caseId } });
    } else {
      shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    }

    if (!shipment) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    const logs = await prisma.log.findMany({
      where: {
        eventType: { startsWith: "trigger_" },
        message: { contains: `Case ${shipment.caseId}` },
      },
      orderBy: { timestamp: "desc" },
      take: 50,
    });

    const incidents = await prisma.incident.findMany({
      where: { shipmentId: shipment.id },
      orderBy: { createdAt: "desc" },
    });

    return ApiResponse.success(res, {
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      currentState: {
        status: shipment.status,
        delay: shipment.delay,
        riskScore: shipment.riskScore,
        slaBreached: shipment.slaBreached,
        rerouted: shipment.rerouted,
        escalated: shipment.escalated,
      },
      triggerLogs: logs.map((l) => ({
        id: l.logId,
        timestamp: l.timestamp,
        event: l.eventType,
        severity: l.severity,
        message: l.message,
        metadata: l.metadata,
      })),
      incidents: incidents.map((i) => ({
        id: i.incidentId,
        type: i.type,
        severity: i.severity,
        status: i.status,
        title: i.title,
        description: i.description,
        createdAt: i.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Trigger] Error fetching history:", error);
    return ApiResponse.error(res, "Failed to fetch trigger history", 500);
  }
};

// maps issue type to incident model enum
function mapIssueToIncidentType(issue: IssueType): string {
  const map: Record<string, string> = {
    warehouse_congestion: "warehouse_congestion",
    carrier_breakdown: "carrier_failure",
    late_pickup: "delay",
    weather_disruption: "weather_disruption",
    customs_hold: "customs_hold",
    inaccurate_ETA: "eta_deviation",
    SLA_BREACH: "sla_breach",
  };
  return map[issue] || "delay";
}

// builds incident description
function buildIncidentDescription(
  issue: IssueType,
  shipment: any,
  totalDelay: number,
  carrierReassigned: boolean,
  warehouseRerouted: boolean
): string {
  const parts = [
    `Issue: ${issue.replace(/_/g, " ")}`,
    `Total delay: ${totalDelay} minutes (${(totalDelay / 60).toFixed(1)}hrs)`,
    `Risk score: ${Math.min(100, shipment.riskScore + (ISSUE_RISK_MAP[issue] || 0))}%`,
    `Route: ${shipment.origin?.city || "?"} -> ${shipment.destination?.city || "?"}`,
    `Carrier: ${shipment.carrier?.code || "unassigned"}`,
    `Value: INR ${shipment.value?.toLocaleString("en-IN") || "0"}`,
  ];

  if (carrierReassigned) parts.push("Action: Carrier reassigned automatically");
  if (warehouseRerouted) parts.push("Action: Rerouted to alternate warehouse");
  if (totalDelay >= 360) parts.push("Alert: Email notification sent to consumer");

  return parts.join(". ");
}

// builds action reasoning text
function buildActionReasoning(
  issue: IssueType,
  totalDelay: number,
  carrierReassigned: boolean,
  warehouseRerouted: boolean,
  emailTriggered: boolean
): string {
  const parts = [`Trigger: ${issue.replace(/_/g, " ")}`];

  if (totalDelay >= 600 && warehouseRerouted) {
    parts.push(
      `Delay exceeded 10hrs threshold (${(totalDelay / 60).toFixed(1)}hrs). Rerouted to nearest available warehouse with lower congestion.`
    );
  } else if (totalDelay >= 360 && emailTriggered) {
    parts.push(
      `Delay exceeded 6hrs threshold (${(totalDelay / 60).toFixed(1)}hrs). Consumer notification email triggered.`
    );
  } else if (totalDelay >= 120 && carrierReassigned) {
    parts.push(
      `Delay exceeded 2hrs threshold (${(totalDelay / 60).toFixed(1)}hrs). Carrier reassigned to best available option.`
    );
  }

  if (carrierReassigned && !warehouseRerouted) {
    parts.push("Carrier selection based on reliability score and regional coverage.");
  }

  return parts.join(" ");
}
