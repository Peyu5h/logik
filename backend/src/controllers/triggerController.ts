import { Request, Response } from "express";
import prisma from "../config/database.js";
import ApiResponse from "../utils/apiResponse.js";
import { config } from "../config/env.js";

const VALID_ISSUES = [
  "delay",
  "SLA_BREACH",
  "set_in_transit",
  "arrived_warehouse",
  "reset_demo",
  "resolve",
] as const;

type IssueType = (typeof VALID_ISSUES)[number];

// delay adds +2hrs each press, auto-escalation handled by thresholds
const DELAY_MINUTES = 120;

// risk added per delay press
const DELAY_RISK_DELTA = 20;

function logId(): string {
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}

function incidentId(): string {
  return `INC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
}

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

// fires n8n webhook
async function fireWebhook(payload: Record<string, unknown>) {
  const webhookUrl = config.webhook.agentUrl;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`[Trigger] Agent webhook returned ${res.status} at ${webhookUrl}`);
      return { status: res.status, response: null, error: `Webhook not responding (${res.status})` };
    }
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not json
    }
    console.log("[Trigger] Webhook fired:", res.status);
    return { status: res.status, response: parsed || text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Trigger] Agent webhook unreachable: ${msg}`);
    return { status: 0, response: null, error: `Webhook unreachable: ${msg}` };
  }
}

// fires email notification webhook
async function fireEmailWebhook(payload: Record<string, unknown>) {
  const emailWebhookUrl =
    process.env.WEBHOOK_EMAIL_URL || config.webhook.shipmentUpdateUrl;
  try {
    const res = await fetch(emailWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email_notification", ...payload }),
    });
    if (!res.ok) {
      console.warn(`[Trigger] Email webhook returned ${res.status}`);
      return { status: res.status, error: `Email webhook not responding (${res.status})` };
    }
    console.log("[Trigger] Email webhook fired:", res.status);
    return { status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Trigger] Email webhook unreachable: ${msg}`);
    return { status: 0, error: `Email webhook unreachable` };
  }
}

// finds best available carrier
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

  const regionMatch = carriers.find((c) =>
    regions.some((r) => c.regions.includes(r))
  );
  return regionMatch || carriers[0] || null;
}

// finds next warehouse on route
async function findNextWarehouse(
  currentWarehouseId: string | null,
  destinationRegion: string
): Promise<{ id: string; name: string; code: string; location: any } | null> {
  const warehouses = await prisma.warehouse.findMany({
    where: {
      isActive: true,
      status: { in: ["operational", "degraded"] },
      congestionLevel: { in: ["low", "moderate"] },
      ...(currentWarehouseId ? { id: { not: currentWarehouseId } } : {}),
    },
    orderBy: { utilizationPct: "asc" },
  });

  const regionMatch = warehouses.find((w) =>
    w.regions.includes(destinationRegion)
  );
  return regionMatch || warehouses[0] || null;
}

// degrades carrier reliability after an incident
async function degradeCarrierReliability(carrierId: string, amount: number, reason: string) {
  try {
    const carrier = await prisma.carrier.findUnique({ where: { id: carrierId } });
    if (!carrier) return;

    const newScore = Math.max(0, Math.min(100, carrier.reliabilityScore - amount));
    const newFailureRate = Math.min(100, carrier.failureRate + amount * 0.1);

    await prisma.carrier.update({
      where: { id: carrierId },
      data: {
        reliabilityScore: newScore,
        failureRate: newFailureRate,
        lastIncident: new Date(),
      },
    });

    await createLog(
      "carrier_reliability_update",
      "trigger_engine",
      "medium",
      `Carrier ${carrier.code}: reliability ${carrier.reliabilityScore}% -> ${newScore}% (${reason})`,
      { carrierCode: carrier.code, oldScore: carrier.reliabilityScore, newScore, reason }
    );
  } catch (err) {
    console.warn("[Trigger] Failed to degrade carrier reliability:", err);
  }
}

// builds route summary from waypoints
function routeSummary(shipment: any): string[] {
  const waypoints: any[] = shipment.routeWaypoints || [];
  return [
    shipment.origin?.city,
    ...waypoints.sort((a: any, b: any) => a.order - b.order).map((wp: any) => wp.city),
    shipment.destination?.city,
  ].filter(Boolean);
}

// finds a shipment by caseId or mongo id with full includes
async function findShipment(shipmentId: string) {
  const caseIdNum = parseInt(shipmentId);
  const include = {
    carrier: true,
    warehouse: true,
    consumer: { select: { id: true, name: true, email: true } },
  };

  if (!isNaN(caseIdNum) && caseIdNum >= 1 && caseIdNum <= 10) {
    return prisma.shipment.findUnique({ where: { caseId: caseIdNum }, include });
  }
  return prisma.shipment.findUnique({ where: { id: shipmentId }, include });
}

// ─── main trigger handler ───
export const handleTrigger = async (req: Request, res: Response) => {
  try {
    const { shipmentId, issue } = req.params;

    if (!VALID_ISSUES.includes(issue as IssueType)) {
      return ApiResponse.error(
        res,
        `Invalid issue type. Valid: ${VALID_ISSUES.join(", ")}`,
        400
      );
    }

    const shipment = await findShipment(shipmentId);
    if (!shipment) {
      return ApiResponse.notFound(res, "Shipment not found");
    }

    const issueType = issue as IssueType;

    // dispatch to specific handlers
    switch (issueType) {
      case "resolve":
        return handleResolve(res, shipment);
      case "reset_demo":
        return handleResetDemo(res, shipment);
      case "set_in_transit":
        return handleSetInTransit(res, shipment);
      case "arrived_warehouse":
        return handleArrivedWarehouse(res, shipment);
      case "SLA_BREACH":
        return handleSlaBreach(res, shipment);
      case "delay":
        return handleDelay(res, shipment);
      default:
        return ApiResponse.error(res, "Unknown trigger", 400);
    }
  } catch (error) {
    console.error("[Trigger] Error:", error);
    return ApiResponse.error(res, "Failed to process trigger", 500);
  }
};

// ─── DELAY trigger (+2hrs each press, auto-escalates) ───
async function handleDelay(res: Response, shipment: any) {
  const now = new Date();
  const newDelay = shipment.delay + DELAY_MINUTES;
  const newRisk = Math.min(100, Math.max(0, shipment.riskScore + DELAY_RISK_DELTA));
  const newFinalEta = shipment.finalEta
    ? new Date(shipment.finalEta.getTime() + DELAY_MINUTES * 60 * 1000)
    : shipment.estimatedDelivery
      ? new Date(shipment.estimatedDelivery.getTime() + DELAY_MINUTES * 60 * 1000)
      : null;

  const slaBreached =
    shipment.slaBreached ||
    (shipment.slaDeadline && newFinalEta && newFinalEta > shipment.slaDeadline);

  let newStatus = shipment.status as string;
  if (shipment.status !== "delivered" && shipment.status !== "cancelled") {
    if (newDelay >= 120) newStatus = "delayed";
  }

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

  let carrierReassigned = false;
  let newCarrierInfo: any = null;
  let emailTriggered = false;
  let warehouseRerouted = false;
  let newWarehouseInfo: any = null;

  // degrade current carrier reliability on every delay
  if (shipment.carrierId) {
    await degradeCarrierReliability(shipment.carrierId, 3, `delay on case ${shipment.caseId} (+${newDelay}min total)`);
  }

  // ── threshold: 2hrs total → reassign carrier + send email ──
  if (newDelay >= 120 && shipment.delay < 120) {
    const destRegion = shipment.destination?.region || "";
    const bestCarrier = await findBestCarrier(shipment.carrierId, [destRegion]);
    if (bestCarrier) {
      updateData.previousCarrierId = shipment.carrierId;
      updateData.carrierId = bestCarrier.id;
      updateData.rerouted = true;
      updateData.agentNotes = `Carrier reassigned ${shipment.carrier?.code || "?"} -> ${bestCarrier.code} due to ${Math.round(newDelay / 60)}hr delay`;
      carrierReassigned = true;
      newCarrierInfo = bestCarrier;

      await createLog(
        "carrier_reassigned",
        "trigger_engine",
        "high",
        `Case ${shipment.caseId}: Carrier reassigned to ${bestCarrier.code} (reliability: ${bestCarrier.reliabilityScore}%) - ${Math.round(newDelay / 60)}hr delay`,
        { caseId: shipment.caseId, oldCarrier: shipment.carrier?.code, newCarrier: bestCarrier.code }
      );
    }

    // email consumer at 2hr threshold
    emailTriggered = true;
    await fireEmailWebhook({
      trigger: "delay_email_2hrs",
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      consumerEmail: shipment.consumer?.email,
      consumerName: shipment.consumer?.name,
      totalDelay: newDelay,
      currentStatus: newStatus,
      estimatedDelivery: newFinalEta?.toISOString(),
      message: `Your shipment ${shipment.trackingId} is delayed by ${Math.round(newDelay / 60)}hrs. We've reassigned your carrier for faster delivery.`,
    });

    await createLog(
      "email_notification",
      "notification_service",
      "high",
      `Case ${shipment.caseId}: Delay email sent to ${shipment.consumer?.email} - total delay ${Math.round(newDelay / 60)}hrs`,
      { caseId: shipment.caseId, consumerEmail: shipment.consumer?.email, delayMinutes: newDelay }
    );
  }

  // ── threshold: 6hrs → send follow-up email ──
  if (newDelay >= 360 && shipment.delay < 360) {
    if (!emailTriggered) {
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
        message: `Your shipment ${shipment.trackingId} is significantly delayed (${Math.round(newDelay / 60)}hrs). Our team is actively working on resolution.`,
      });
    }
  }

  // ── threshold: 10hrs → reroute warehouse ──
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

      // replace delayed warehouse in routeWaypoints
      const waypoints: any[] = (shipment as any).routeWaypoints || [];
      if (waypoints.length > 0) {
        const oldCode = shipment.warehouse?.code;
        const waypointIdx = waypoints.findIndex((wp: any) => wp.warehouseCode === oldCode);
        if (waypointIdx !== -1) {
          waypoints[waypointIdx] = {
            ...waypoints[waypointIdx],
            warehouseCode: nextWarehouse.code,
            warehouseName: nextWarehouse.name,
            city: nextWarehouse.location?.city || nextWarehouse.name,
            region: nextWarehouse.location?.region || destRegion,
            lat: nextWarehouse.location?.lat || waypoints[waypointIdx].lat,
            lng: nextWarehouse.location?.lng || waypoints[waypointIdx].lng,
            status: "rerouted",
          };
        } else {
          const maxOrder = Math.max(...waypoints.map((wp: any) => wp.order), 0);
          waypoints.push({
            warehouseCode: nextWarehouse.code,
            warehouseName: nextWarehouse.name,
            city: nextWarehouse.location?.city || nextWarehouse.name,
            region: nextWarehouse.location?.region || destRegion,
            lat: nextWarehouse.location?.lat || 0,
            lng: nextWarehouse.location?.lng || 0,
            order: maxOrder + 1,
            status: "rerouted",
          });
        }
        updateData.routeWaypoints = waypoints;
      }

      // also reassign carrier if not already done
      if (!carrierReassigned) {
        const bestCarrier = await findBestCarrier(shipment.carrierId, [destRegion]);
        if (bestCarrier) {
          updateData.previousCarrierId = shipment.carrierId;
          updateData.carrierId = bestCarrier.id;
          carrierReassigned = true;
          newCarrierInfo = bestCarrier;
        }
      }

      const routeStr = waypoints.sort((a: any, b: any) => a.order - b.order).map((wp: any) => wp.city).join(" -> ");
      updateData.agentNotes = `Critical delay (${Math.round(newDelay / 60)}hrs). Rerouted via ${routeStr} with ${newCarrierInfo?.code || "best available"} carrier.`;

      await createLog(
        "warehouse_reroute",
        "trigger_engine",
        "critical",
        `Case ${shipment.caseId}: Rerouted ${shipment.warehouse?.code} -> ${nextWarehouse.code}. ${Math.round(newDelay / 60)}hrs delay. Route: ${routeStr}`,
        { caseId: shipment.caseId, oldWarehouse: shipment.warehouse?.code, newWarehouse: nextWarehouse.code }
      );

      await fireEmailWebhook({
        trigger: "warehouse_reroute_10hrs",
        caseId: shipment.caseId,
        trackingId: shipment.trackingId,
        consumerEmail: shipment.consumer?.email,
        consumerName: shipment.consumer?.name,
        totalDelay: newDelay,
        newWarehouse: nextWarehouse.name,
        message: `Your shipment ${shipment.trackingId} has been rerouted through ${nextWarehouse.name} for faster delivery.`,
      });
    }
  }

  // sla breach auto-escalation
  if (slaBreached && !shipment.slaBreached) {
    updateData.escalated = true;
    await createLog("sla_breach", "sla_monitor", "critical",
      `Case ${shipment.caseId}: SLA BREACHED. Deadline: ${shipment.slaDeadline?.toISOString()}, ETA: ${newFinalEta?.toISOString()}`,
      { caseId: shipment.caseId }
    );
    await fireEmailWebhook({
      trigger: "sla_breach",
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      consumerEmail: shipment.consumer?.email,
      consumerName: shipment.consumer?.name,
      message: `Your shipment ${shipment.trackingId} has missed its SLA deadline. Our team has been notified.`,
    });
  }

  const updated = await prisma.shipment.update({
    where: { id: shipment.id },
    data: updateData,
    include: {
      carrier: { select: { id: true, name: true, code: true, reliabilityScore: true } },
      warehouse: { select: { id: true, name: true, code: true, status: true } },
      consumer: { select: { id: true, name: true, email: true } },
    },
  });

  await createLog(
    "trigger_delay",
    "trigger_engine",
    newDelay >= 360 ? "critical" : newDelay >= 120 ? "high" : "medium",
    `Case ${shipment.caseId}: Delay +${DELAY_MINUTES}min (total: ${newDelay}min). Risk: ${newRisk}%`,
    { caseId: shipment.caseId, delayAdded: DELAY_MINUTES, totalDelay: newDelay, riskScore: newRisk, carrierReassigned, emailTriggered, warehouseRerouted }
  );

  // create incident
  await prisma.incident.create({
    data: {
      incidentId: incidentId(),
      shipmentId: shipment.id,
      type: "delay",
      severity: (newDelay >= 360 ? "critical" : newDelay >= 240 ? "high" : "medium") as any,
      status: "open",
      title: `Case ${shipment.caseId}: DELAY +${Math.round(DELAY_MINUTES / 60)}HRS (total: ${Math.round(newDelay / 60)}hrs)`,
      description: buildDescription(shipment, newDelay, carrierReassigned, warehouseRerouted),
      riskScore: newRisk,
      isEscalated: newRisk >= 70 || Boolean(slaBreached),
      escalatedAt: newRisk >= 70 || slaBreached ? now : undefined,
    },
  });

  // fire n8n webhook
  const webhookPayload = buildWebhookPayload("delay", shipment, updated, {
    delay: newDelay, riskScore: newRisk, slaBreached, newFinalEta,
    carrierReassigned, newCarrierInfo, warehouseRerouted, newWarehouseInfo, emailTriggered,
  });
  const webhookResult = await fireWebhook(webhookPayload);

  // log agent action
  await prisma.agentAction.create({
    data: {
      actionId: `act-trigger-${Date.now().toString(36)}`,
      actionType: "trigger_response",
      targetType: "shipment",
      targetId: shipment.id,
      description: `Delay +${DELAY_MINUTES}min on Case ${shipment.caseId}. Total: ${newDelay}min.${carrierReassigned ? " Carrier reassigned." : ""}${emailTriggered ? " Email sent." : ""}${warehouseRerouted ? " Warehouse rerouted." : ""}`,
      confidence: 0.9,
      outcome: "executed",
      requiredHuman: newRisk >= 80,
      reasoning: buildReasoning(newDelay, carrierReassigned, warehouseRerouted, emailTriggered),
      metadata: webhookPayload as any,
    },
  });

  const route = routeSummary(updated);

  return ApiResponse.success(res, {
    trigger: "delay",
    caseId: shipment.caseId,
    trackingId: shipment.trackingId,
    changes: {
      delay: { previous: shipment.delay, added: DELAY_MINUTES, total: newDelay },
      riskScore: { previous: shipment.riskScore, new: newRisk },
      status: { previous: shipment.status, new: updated.status },
      priority: { previous: shipment.priority, new: updated.priority },
      finalEta: newFinalEta?.toISOString(),
      slaBreached: slaBreached || false,
    },
    actions: {
      carrierReassigned,
      newCarrier: newCarrierInfo ? { code: newCarrierInfo.code, name: newCarrierInfo.name } : null,
      warehouseRerouted,
      newWarehouse: newWarehouseInfo ? { code: newWarehouseInfo.code, name: newWarehouseInfo.name } : null,
      emailTriggered,
    },
    route,
    routeWaypoints: (updated as any).routeWaypoints || [],
    webhookResult,
  });
}

// ─── SLA BREACH trigger ───
async function handleSlaBreach(res: Response, shipment: any) {
  const now = new Date();
  const updateData: any = {
    slaBreached: true,
    escalated: true,
    priority: "urgent" as any,
    updatedAt: now,
  };

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

  if (shipment.carrierId) {
    await degradeCarrierReliability(shipment.carrierId, 5, `SLA breach on case ${shipment.caseId}`);
  }

  const updated = await prisma.shipment.update({
    where: { id: shipment.id },
    data: updateData,
    include: {
      carrier: { select: { id: true, name: true, code: true, reliabilityScore: true } },
      warehouse: { select: { id: true, name: true, code: true, status: true } },
      consumer: { select: { id: true, name: true, email: true } },
    },
  });

  await createLog("trigger_sla_breach", "trigger_engine", "critical",
    `Case ${shipment.caseId}: SLA breach declared. Priority set to urgent.`,
    { caseId: shipment.caseId }
  );

  await prisma.incident.create({
    data: {
      incidentId: incidentId(),
      shipmentId: shipment.id,
      type: "sla_breach",
      severity: "critical",
      status: "open",
      title: `Case ${shipment.caseId}: SLA BREACH`,
      description: `SLA breach on shipment ${shipment.trackingId}. Auto-escalated to urgent priority.`,
      riskScore: shipment.riskScore,
      isEscalated: true,
      escalatedAt: now,
    },
  });

  const webhookPayload = buildWebhookPayload("SLA_BREACH", shipment, updated, {
    delay: shipment.delay, riskScore: shipment.riskScore, slaBreached: true, newFinalEta: shipment.finalEta,
    carrierReassigned: false, newCarrierInfo: null, warehouseRerouted: false, newWarehouseInfo: null, emailTriggered: true,
  });
  await fireWebhook(webhookPayload);

  return ApiResponse.success(res, {
    trigger: "SLA_BREACH",
    caseId: shipment.caseId,
    trackingId: shipment.trackingId,
    changes: { slaBreached: true, escalated: true, priority: "urgent" },
    route: routeSummary(updated),
  });
}

// ─── SET IN TRANSIT trigger ───
async function handleSetInTransit(res: Response, shipment: any) {
  const now = new Date();

  if (shipment.status === "delivered" || shipment.status === "cancelled") {
    return ApiResponse.error(res, `Cannot set in_transit: shipment is ${shipment.status}`, 400);
  }

  const waypoints: any[] = (shipment as any).routeWaypoints || [];
  // mark the first waypoint as departed
  if (waypoints.length > 0) {
    const firstPending = waypoints
      .sort((a: any, b: any) => a.order - b.order)
      .find((wp: any) => wp.status === "pending");
    if (firstPending) {
      firstPending.status = "in_transit";
      firstPending.departedAt = now;
    }
  }

  const updateData: any = {
    status: "in_transit",
    updatedAt: now,
    routeWaypoints: waypoints,
    agentNotes: `Shipment dispatched. In transit from ${shipment.origin?.city || "origin"}.`,
  };

  // if pending with no delay, boost carrier reliability slightly
  if (shipment.status === "pending" && shipment.delay === 0 && shipment.carrierId) {
    try {
      const carrier = await prisma.carrier.findUnique({ where: { id: shipment.carrierId } });
      if (carrier) {
        await prisma.carrier.update({
          where: { id: carrier.id },
          data: { reliabilityScore: Math.min(100, carrier.reliabilityScore + 1) },
        });
      }
    } catch { /* silent */ }
  }

  const updated = await prisma.shipment.update({
    where: { id: shipment.id },
    data: updateData,
    include: {
      carrier: { select: { id: true, name: true, code: true, reliabilityScore: true } },
      warehouse: { select: { id: true, name: true, code: true, status: true } },
      consumer: { select: { id: true, name: true, email: true } },
    },
  });

  await createLog("trigger_set_in_transit", "trigger_engine", "low",
    `Case ${shipment.caseId}: Status changed ${shipment.status} -> in_transit. Shipment dispatched.`,
    { caseId: shipment.caseId, previousStatus: shipment.status }
  );

  const webhookPayload = buildWebhookPayload("set_in_transit", shipment, updated, {
    delay: shipment.delay, riskScore: shipment.riskScore, slaBreached: shipment.slaBreached, newFinalEta: shipment.finalEta,
    carrierReassigned: false, newCarrierInfo: null, warehouseRerouted: false, newWarehouseInfo: null, emailTriggered: false,
  });
  await fireWebhook(webhookPayload);

  return ApiResponse.success(res, {
    trigger: "set_in_transit",
    caseId: shipment.caseId,
    trackingId: shipment.trackingId,
    changes: { status: { previous: shipment.status, new: "in_transit" } },
    route: routeSummary(updated),
    routeWaypoints: waypoints,
  });
}

// ─── ARRIVED AT WAREHOUSE trigger ───
// advances to next waypoint warehouse. if delay is high, reassigns carrier
async function handleArrivedWarehouse(res: Response, shipment: any) {
  const now = new Date();

  const waypoints: any[] = [...((shipment as any).routeWaypoints || [])].sort((a: any, b: any) => a.order - b.order);

  if (waypoints.length === 0) {
    return ApiResponse.error(res, "No waypoints defined for this shipment", 400);
  }

  // find the next pending/in_transit waypoint to mark as arrived
  const currentWp = waypoints.find((wp: any) => wp.status === "pending" || wp.status === "in_transit");
  if (!currentWp) {
    // all waypoints completed, mark out_for_delivery
    const updateData: any = {
      status: "out_for_delivery",
      updatedAt: now,
      agentNotes: `All warehouse stops completed. Out for final delivery to ${shipment.destination?.city || "destination"}.`,
    };

    const updated = await prisma.shipment.update({
      where: { id: shipment.id },
      data: updateData,
      include: {
        carrier: { select: { id: true, name: true, code: true, reliabilityScore: true } },
        warehouse: { select: { id: true, name: true, code: true, status: true } },
        consumer: { select: { id: true, name: true, email: true } },
      },
    });

    await createLog("trigger_out_for_delivery", "trigger_engine", "low",
      `Case ${shipment.caseId}: All waypoints completed. Out for delivery.`,
      { caseId: shipment.caseId }
    );

    const webhookPayload = buildWebhookPayload("arrived_warehouse", shipment, updated, {
      delay: shipment.delay, riskScore: shipment.riskScore, slaBreached: shipment.slaBreached, newFinalEta: shipment.finalEta,
      carrierReassigned: false, newCarrierInfo: null, warehouseRerouted: false, newWarehouseInfo: null, emailTriggered: false,
    });
    await fireWebhook(webhookPayload);

    return ApiResponse.success(res, {
      trigger: "arrived_warehouse",
      caseId: shipment.caseId,
      trackingId: shipment.trackingId,
      changes: { status: { previous: shipment.status, new: "out_for_delivery" } },
      message: "All waypoints completed. Out for delivery.",
      route: routeSummary(updated),
      routeWaypoints: waypoints,
    });
  }

  // mark current waypoint as completed
  currentWp.status = "completed";
  currentWp.arrivedAt = now;

  // find the warehouse by code to set as current warehouse
  const warehouseRecord = await prisma.warehouse.findFirst({ where: { code: currentWp.warehouseCode } });

  // find next waypoint
  const nextWp = waypoints.find((wp: any) => wp.status === "pending" || wp.status === "in_transit");

  let carrierReassigned = false;
  let newCarrierInfo: any = null;
  let newStatus = "at_warehouse";

  // if delay is significant, swap carrier for the next leg
  if (shipment.delay >= 120) {
    const destRegion = shipment.destination?.region || "";
    const bestCarrier = await findBestCarrier(shipment.carrierId, [destRegion, currentWp.region]);
    if (bestCarrier && bestCarrier.id !== shipment.carrierId) {
      carrierReassigned = true;
      newCarrierInfo = bestCarrier;

      if (shipment.carrierId) {
        await degradeCarrierReliability(shipment.carrierId, 2, `swapped at ${currentWp.warehouseCode} due to delay`);
      }

      await createLog("carrier_reassigned", "trigger_engine", "high",
        `Case ${shipment.caseId}: Carrier swapped ${shipment.carrier?.code} -> ${bestCarrier.code} at ${currentWp.warehouseCode} (delay: ${Math.round(shipment.delay / 60)}hrs)`,
        { caseId: shipment.caseId, oldCarrier: shipment.carrier?.code, newCarrier: bestCarrier.code, warehouseCode: currentWp.warehouseCode }
      );
    }
  }

  if (nextWp) {
    nextWp.status = "in_transit";
    newStatus = "in_transit";
  }

  const updateData: any = {
    status: newStatus,
    routeWaypoints: waypoints,
    updatedAt: now,
    ...(warehouseRecord ? { warehouseId: warehouseRecord.id } : {}),
    ...(carrierReassigned && newCarrierInfo ? {
      previousCarrierId: shipment.carrierId,
      carrierId: newCarrierInfo.id,
    } : {}),
    currentLocation: {
      lat: currentWp.lat,
      lng: currentWp.lng,
      address: currentWp.warehouseName,
      city: currentWp.city,
      region: currentWp.region,
    },
    agentNotes: `Arrived at ${currentWp.warehouseName} (${currentWp.city}).${nextWp ? ` Next: ${nextWp.warehouseName}.` : " Final stop before delivery."}${carrierReassigned ? ` Carrier swapped to ${newCarrierInfo?.code}.` : ""}`,
  };

  const updated = await prisma.shipment.update({
    where: { id: shipment.id },
    data: updateData,
    include: {
      carrier: { select: { id: true, name: true, code: true, reliabilityScore: true } },
      warehouse: { select: { id: true, name: true, code: true, status: true } },
      consumer: { select: { id: true, name: true, email: true } },
    },
  });

  await createLog("trigger_arrived_warehouse", "trigger_engine", "low",
    `Case ${shipment.caseId}: Arrived at ${currentWp.warehouseCode} (${currentWp.city}).${nextWp ? ` Next stop: ${nextWp.warehouseCode}.` : " All stops completed."}${carrierReassigned ? ` Carrier -> ${newCarrierInfo?.code}.` : ""}`,
    { caseId: shipment.caseId, warehouse: currentWp.warehouseCode, nextWarehouse: nextWp?.warehouseCode, carrierReassigned }
  );

  const webhookPayload = buildWebhookPayload("arrived_warehouse", shipment, updated, {
    delay: shipment.delay, riskScore: shipment.riskScore, slaBreached: shipment.slaBreached, newFinalEta: shipment.finalEta,
    carrierReassigned, newCarrierInfo, warehouseRerouted: false, newWarehouseInfo: null, emailTriggered: false,
  });
  await fireWebhook(webhookPayload);

  return ApiResponse.success(res, {
    trigger: "arrived_warehouse",
    caseId: shipment.caseId,
    trackingId: shipment.trackingId,
    arrivedAt: { code: currentWp.warehouseCode, city: currentWp.city },
    nextStop: nextWp ? { code: nextWp.warehouseCode, city: nextWp.city } : null,
    changes: {
      status: { previous: shipment.status, new: newStatus },
      carrierReassigned,
      newCarrier: newCarrierInfo ? { code: newCarrierInfo.code, name: newCarrierInfo.name } : null,
    },
    route: routeSummary(updated),
    routeWaypoints: waypoints,
  });
}

// ─── RESOLVE trigger ───
async function handleResolve(res: Response, shipment: any) {
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

  await prisma.incident.updateMany({
    where: { shipmentId: shipment.id, status: { in: ["open", "investigating", "in_progress", "escalated"] } },
    data: { status: "resolved", resolution: "Auto-resolved via trigger", updatedAt: now },
  });

  await createLog("trigger_resolve", "trigger_engine", "low",
    `Case ${shipment.caseId}: All issues resolved. Delay reset, risk cleared, ETA restored.`,
    { caseId: shipment.caseId }
  );

  const webhookResult = await fireWebhook({
    trigger_type: "resolve",
    caseId: shipment.caseId,
    trackingId: shipment.trackingId,
    shipmentId: shipment.id,
    currentState: { status: updated.status, delay: 0, riskScore: 0, slaBreached: false },
    timestamp: now.toISOString(),
  });

  return ApiResponse.success(res, {
    trigger: "resolve",
    caseId: shipment.caseId,
    trackingId: shipment.trackingId,
    message: "All issues resolved",
    route: routeSummary(updated),
    webhookResult,
  });
}

// ─── RESET DEMO trigger ───
// resets a shipment to pristine seed state
async function handleResetDemo(res: Response, shipment: any) {
  const now = new Date();

  // original seed waypoints per case
  const SEED_WAYPOINTS: Record<number, any[]> = {
    1: [
      { warehouseCode: "DEL-N1", warehouseName: "Delhi North Hub", city: "Delhi NCR", region: "north", lat: 28.6139, lng: 77.209, order: 1, status: "pending" },
      { warehouseCode: "HYD-S2", warehouseName: "Hyderabad South Hub", city: "Hyderabad", region: "south", lat: 17.385, lng: 78.4867, order: 2, status: "pending" },
      { warehouseCode: "MUM-W1", warehouseName: "Mumbai Central Hub", city: "Mumbai", region: "west", lat: 19.076, lng: 72.8777, order: 3, status: "pending" },
    ],
    2: [
      { warehouseCode: "MUM-W1", warehouseName: "Mumbai Central Hub", city: "Mumbai", region: "west", lat: 19.076, lng: 72.8777, order: 1, status: "pending" },
      { warehouseCode: "HYD-S2", warehouseName: "Hyderabad South Hub", city: "Hyderabad", region: "south", lat: 17.385, lng: 78.4867, order: 2, status: "pending" },
      { warehouseCode: "BLR-S1", warehouseName: "Bangalore South Hub", city: "Bangalore", region: "south", lat: 12.9716, lng: 77.5946, order: 3, status: "pending" },
    ],
    3: [
      { warehouseCode: "KOL-E1", warehouseName: "Kolkata East Hub", city: "Kolkata", region: "east", lat: 22.5726, lng: 88.3639, order: 1, status: "pending" },
      { warehouseCode: "HYD-S2", warehouseName: "Hyderabad South Hub", city: "Hyderabad", region: "south", lat: 17.385, lng: 78.4867, order: 2, status: "pending" },
      { warehouseCode: "DEL-N1", warehouseName: "Delhi North Hub", city: "Delhi NCR", region: "north", lat: 28.6139, lng: 77.209, order: 3, status: "pending" },
    ],
  };

  // original carrier codes
  const SEED_CARRIER_CODES: Record<number, string> = { 1: "DXP", 2: "BFX", 3: "SFX" };
  // original warehouse codes
  const SEED_WAREHOUSE_CODES: Record<number, string> = { 1: "DEL-N1", 2: "MUM-W1", 3: "KOL-E1" };

  const caseId = shipment.caseId;

  // look up original carrier & warehouse
  const originalCarrier = await prisma.carrier.findFirst({ where: { code: SEED_CARRIER_CODES[caseId] || "DXP" } });
  const originalWarehouse = await prisma.warehouse.findFirst({ where: { code: SEED_WAREHOUSE_CODES[caseId] || "DEL-N1" } });

  const hoursFromNow = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000);
  const etaHours: Record<number, number> = { 1: 36, 2: 28, 3: 52 };
  const slaHours: Record<number, number> = { 1: 48, 2: 36, 3: 72 };

  const updateData: any = {
    status: "pending",
    priority: caseId === 2 ? "urgent" : caseId === 1 ? "high" : "medium",
    delay: 0,
    riskScore: 0,
    slaBreached: false,
    rerouted: false,
    escalated: false,
    initialEta: hoursFromNow(etaHours[caseId] || 36),
    finalEta: hoursFromNow(etaHours[caseId] || 36),
    estimatedDelivery: hoursFromNow(etaHours[caseId] || 36),
    actualDelivery: null,
    slaDeadline: hoursFromNow(slaHours[caseId] || 48),
    currentLocation: null,
    previousCarrierId: null,
    nextWarehouseId: null,
    agentNotes: null,
    routeHistory: [],
    routeWaypoints: SEED_WAYPOINTS[caseId] || SEED_WAYPOINTS[1],
    updatedAt: now,
    ...(originalCarrier ? { carrierId: originalCarrier.id } : {}),
    ...(originalWarehouse ? { warehouseId: originalWarehouse.id } : {}),
  };

  const updated = await prisma.shipment.update({
    where: { id: shipment.id },
    data: updateData,
    include: {
      carrier: { select: { id: true, name: true, code: true } },
      warehouse: { select: { id: true, name: true, code: true } },
    },
  });

  // resolve all open incidents
  await prisma.incident.updateMany({
    where: { shipmentId: shipment.id, status: { in: ["open", "investigating", "in_progress", "escalated"] } },
    data: { status: "resolved", resolution: "Reset to demo state", updatedAt: now },
  });

  // reset carrier reliability scores to seed defaults
  const carrierDefaults: Record<string, { reliabilityScore: number; failureRate: number }> = {
    DXP: { reliabilityScore: 92, failureRate: 1.5 },
    BFX: { reliabilityScore: 88, failureRate: 2.1 },
    EKL: { reliabilityScore: 78, failureRate: 4.5 },
    SFX: { reliabilityScore: 85, failureRate: 2.8 },
    XBS: { reliabilityScore: 90, failureRate: 1.8 },
  };
  for (const [code, vals] of Object.entries(carrierDefaults)) {
    await prisma.carrier.updateMany({
      where: { code },
      data: { reliabilityScore: vals.reliabilityScore, failureRate: vals.failureRate, lastIncident: null },
    });
  }

  await createLog("trigger_reset_demo", "trigger_engine", "low",
    `Case ${shipment.caseId}: Reset to demo default state. All delays/incidents cleared, carriers restored.`,
    { caseId: shipment.caseId }
  );

  const webhookResult = await fireWebhook({
    trigger_type: "reset_demo",
    caseId: shipment.caseId,
    trackingId: shipment.trackingId,
    shipmentId: shipment.id,
    currentState: { status: "pending", delay: 0, riskScore: 0, slaBreached: false },
    timestamp: now.toISOString(),
  });

  return ApiResponse.success(res, {
    trigger: "reset_demo",
    caseId: shipment.caseId,
    trackingId: shipment.trackingId,
    message: `Case ${caseId} reset to default demo state`,
    route: routeSummary(updated),
    routeWaypoints: updateData.routeWaypoints,
    webhookResult,
  });
}

// ─── shared helpers ───

function buildWebhookPayload(triggerType: string, shipment: any, updated: any, ctx: any) {
  return {
    trigger_type: triggerType,
    caseId: shipment.caseId,
    trackingId: shipment.trackingId,
    shipmentId: shipment.id,
    consumer: shipment.consumer,
    currentState: {
      status: updated.status,
      priority: updated.priority,
      delay: ctx.delay,
      riskScore: ctx.riskScore,
      slaBreached: ctx.slaBreached || false,
      rerouted: updated.rerouted,
      escalated: updated.escalated,
      carrier: updated.carrier,
      warehouse: updated.warehouse,
      finalEta: ctx.newFinalEta instanceof Date ? ctx.newFinalEta.toISOString() : ctx.newFinalEta,
      value: shipment.value,
    },
    actions: {
      carrierReassigned: ctx.carrierReassigned,
      newCarrier: ctx.newCarrierInfo
        ? { code: ctx.newCarrierInfo.code, name: ctx.newCarrierInfo.name, reliability: ctx.newCarrierInfo.reliabilityScore }
        : null,
      warehouseRerouted: ctx.warehouseRerouted,
      newWarehouse: ctx.newWarehouseInfo
        ? { code: ctx.newWarehouseInfo.code, name: ctx.newWarehouseInfo.name }
        : null,
      emailTriggered: ctx.emailTriggered,
      slaBreachDetected: ctx.slaBreached && !shipment.slaBreached,
    },
    origin: shipment.origin,
    destination: shipment.destination,
    routeWaypoints: (updated as any).routeWaypoints || (shipment as any).routeWaypoints || [],
    route: routeSummary(updated),
    deliveryAddress: shipment.deliveryAddress,
    recipientName: shipment.recipientName,
    recipientPhone: shipment.recipientPhone,
    timestamp: new Date().toISOString(),
  };
}

function buildDescription(shipment: any, totalDelay: number, carrierReassigned: boolean, warehouseRerouted: boolean): string {
  const route = routeSummary(shipment);
  const parts = [
    `Delay: ${totalDelay}min (${(totalDelay / 60).toFixed(1)}hrs)`,
    `Risk: ${Math.min(100, shipment.riskScore + DELAY_RISK_DELTA)}%`,
    `Route: ${route.join(" -> ")}`,
    `Carrier: ${shipment.carrier?.code || "unassigned"}`,
    `Value: INR ${shipment.value?.toLocaleString("en-IN") || "0"}`,
  ];
  if (carrierReassigned) parts.push("Carrier reassigned");
  if (warehouseRerouted) parts.push("Warehouse rerouted");
  if (totalDelay >= 120) parts.push("Email sent to consumer");
  return parts.join(". ");
}

function buildReasoning(totalDelay: number, carrierReassigned: boolean, warehouseRerouted: boolean, emailTriggered: boolean): string {
  const parts = ["Trigger: delay +2hrs"];
  if (totalDelay >= 600 && warehouseRerouted) {
    parts.push(`Delay exceeded 10hrs (${(totalDelay / 60).toFixed(1)}hrs). Rerouted to alternate warehouse.`);
  } else if (totalDelay >= 360) {
    parts.push(`Delay exceeded 6hrs (${(totalDelay / 60).toFixed(1)}hrs). Follow-up email sent.`);
  } else if (totalDelay >= 120 && carrierReassigned) {
    parts.push(`Delay reached 2hrs. Carrier reassigned, email sent to consumer.`);
  }
  if (carrierReassigned && !warehouseRerouted) {
    parts.push("Carrier selected by reliability score and regional coverage.");
  }
  return parts.join(" ");
}

// ─── info & history endpoints ───

export const getTriggerInfo = async (_req: Request, res: Response) => {
  return ApiResponse.success(res, {
    triggers: VALID_ISSUES.map((issue) => ({
      id: issue,
      label: issue.replace(/_/g, " "),
    })),
    thresholds: {
      delay_per_press_minutes: DELAY_MINUTES,
      carrier_reassign_minutes: 120,
      email_notification_minutes: 120,
      followup_email_minutes: 360,
      warehouse_reroute_minutes: 600,
      sla_breach_auto_escalate: true,
    },
  });
};

export const getTriggerHistory = async (req: Request, res: Response) => {
  try {
    const { shipmentId } = req.params;

    const shipment = await findShipment(shipmentId);
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
      route: routeSummary(shipment),
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

// ─── carrier reliability update endpoint ───
export const updateCarrierReliability = async (req: Request, res: Response) => {
  try {
    const { carrierCode } = req.params;
    const { reliabilityScore, failureRate, reason } = req.body;

    const carrier = await prisma.carrier.findFirst({ where: { code: carrierCode } });
    if (!carrier) {
      return ApiResponse.notFound(res, "Carrier not found");
    }

    const updateData: any = {};
    if (reliabilityScore !== undefined) {
      updateData.reliabilityScore = Math.max(0, Math.min(100, reliabilityScore));
    }
    if (failureRate !== undefined) {
      updateData.failureRate = Math.max(0, Math.min(100, failureRate));
    }

    if (Object.keys(updateData).length === 0) {
      return ApiResponse.error(res, "Provide reliabilityScore or failureRate", 400);
    }

    const updated = await prisma.carrier.update({
      where: { id: carrier.id },
      data: updateData,
    });

    await createLog("carrier_reliability_manual_update", "admin_panel", "medium",
      `Carrier ${carrier.code}: reliability updated to ${updated.reliabilityScore}%${reason ? ` (${reason})` : ""}`,
      { carrierCode: carrier.code, oldScore: carrier.reliabilityScore, newScore: updated.reliabilityScore, reason }
    );

    return ApiResponse.success(res, {
      carrier: {
        code: updated.code,
        name: updated.name,
        reliabilityScore: updated.reliabilityScore,
        failureRate: updated.failureRate,
      },
      previous: {
        reliabilityScore: carrier.reliabilityScore,
        failureRate: carrier.failureRate,
      },
    });
  } catch (error) {
    console.error("[Trigger] Carrier reliability update error:", error);
    return ApiResponse.error(res, "Failed to update carrier reliability", 500);
  }
};
