import { Request, Response } from "express";
import prisma from "../config/database.js";
import ApiResponse from "../utils/apiResponse.js";

// get all warehouses
export const getWarehouses = async (req: Request, res: Response) => {
  try {
    const { region, status } = req.query;

    const where: any = {};
    if (region && typeof region === "string") where.regions = { has: region };
    if (status && typeof status === "string") where.status = status;

    const warehouses = await prisma.warehouse.findMany({
      where,
      include: {
        _count: { select: { shipments: true, inventoryItems: true } },
      },
      orderBy: { name: "asc" },
    });

    const normalized = warehouses.map((wh) => ({
      _id: wh.id,
      name: wh.name,
      code: wh.code,
      location: wh.location,
      capacity: wh.capacity,
      current_load: wh.currentLoad,
      utilization_pct: wh.utilizationPct,
      throughput_rate: wh.throughputRate,
      status: wh.status,
      congestion_level: wh.congestionLevel,
      avg_process_time: wh.avgProcessTime,
      regions: wh.regions,
      is_active: wh.isActive,
      shipment_count: wh._count.shipments,
      inventory_count: wh._count.inventoryItems,
      created_at: wh.createdAt,
      updated_at: wh.updatedAt,
    }));

    return ApiResponse.success(res, { warehouses: normalized, total: normalized.length });
  } catch (error) {
    console.error("[Warehouses] Error fetching warehouses:", error);
    return ApiResponse.error(res, "Failed to fetch warehouses", 500);
  }
};

// get single warehouse with inventory
export const getWarehouseById = async (req: Request, res: Response) => {
  try {
    const { warehouseId } = req.params;

    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      include: {
        inventoryItems: { orderBy: { name: "asc" } },
        shipments: {
          where: { status: { in: ["at_warehouse", "pending"] } },
          select: {
            id: true,
            trackingId: true,
            status: true,
            priority: true,
            riskScore: true,
            estimatedDelivery: true,
          },
          orderBy: { riskScore: "desc" },
          take: 20,
        },
      },
    });

    if (!warehouse) {
      return ApiResponse.notFound(res, "Warehouse not found");
    }

    const normalized = {
      _id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code,
      location: warehouse.location,
      capacity: warehouse.capacity,
      current_load: warehouse.currentLoad,
      utilization_pct: warehouse.utilizationPct,
      throughput_rate: warehouse.throughputRate,
      status: warehouse.status,
      congestion_level: warehouse.congestionLevel,
      avg_process_time: warehouse.avgProcessTime,
      regions: warehouse.regions,
      is_active: warehouse.isActive,
      inventory: warehouse.inventoryItems.map((item) => ({
        _id: item.id,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        reserved: item.reserved,
        available: item.quantity - item.reserved,
        reorder_point: item.reorderPoint,
        low_stock: item.quantity - item.reserved <= item.reorderPoint,
        last_restocked: item.lastRestocked,
      })),
      active_shipments: warehouse.shipments.map((s) => ({
        _id: s.id,
        tracking_id: s.trackingId,
        status: s.status,
        priority: s.priority,
        risk_score: s.riskScore,
        estimated_delivery: s.estimatedDelivery,
      })),
      created_at: warehouse.createdAt,
      updated_at: warehouse.updatedAt,
    };

    return ApiResponse.success(res, { warehouse: normalized });
  } catch (error) {
    console.error("[Warehouses] Error fetching warehouse:", error);
    return ApiResponse.error(res, "Failed to fetch warehouse", 500);
  }
};

// update warehouse status and congestion
export const updateWarehouseStatus = async (req: Request, res: Response) => {
  try {
    const { warehouseId } = req.params;
    const { status, congestion_level, current_load, throughput_rate } = req.body;

    const updateData: any = {};
    if (status) updateData.status = status;
    if (congestion_level) updateData.congestionLevel = congestion_level;
    if (current_load !== undefined) {
      updateData.currentLoad = current_load;
      const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
      if (wh) {
        updateData.utilizationPct = Math.round((current_load / wh.capacity) * 1000) / 10;
      }
    }
    if (throughput_rate !== undefined) updateData.throughputRate = throughput_rate;

    const warehouse = await prisma.warehouse.update({
      where: { id: warehouseId },
      data: updateData,
    });

    console.log("[Warehouses] Status updated:", warehouse.code, "->", status || warehouse.status);
    return ApiResponse.success(res, {
      _id: warehouse.id,
      code: warehouse.code,
      status: warehouse.status,
      congestion_level: warehouse.congestionLevel,
      utilization_pct: warehouse.utilizationPct,
    });
  } catch (error) {
    console.error("[Warehouses] Error updating status:", error);
    return ApiResponse.error(res, "Failed to update warehouse status", 500);
  }
};

// get inventory for a warehouse
export const getWarehouseInventory = async (req: Request, res: Response) => {
  try {
    const { warehouseId } = req.params;
    const { low_stock } = req.query;

    const where: any = { warehouseId };

    const items = await prisma.inventoryItem.findMany({
      where,
      orderBy: { name: "asc" },
    });

    let inventory = items.map((item) => ({
      _id: item.id,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      reserved: item.reserved,
      available: item.quantity - item.reserved,
      reorder_point: item.reorderPoint,
      low_stock: item.quantity - item.reserved <= item.reorderPoint,
      last_restocked: item.lastRestocked,
      warehouse_id: item.warehouseId,
    }));

    if (low_stock === "true") {
      inventory = inventory.filter((i) => i.low_stock);
    }

    return ApiResponse.success(res, { inventory, total: inventory.length });
  } catch (error) {
    console.error("[Warehouses] Error fetching inventory:", error);
    return ApiResponse.error(res, "Failed to fetch inventory", 500);
  }
};

// update inventory item quantity
export const updateInventory = async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { quantity, reserved } = req.body;

    const updateData: any = {};
    if (quantity !== undefined) updateData.quantity = quantity;
    if (reserved !== undefined) updateData.reserved = reserved;

    const item = await prisma.inventoryItem.update({
      where: { id: itemId },
      data: updateData,
    });

    return ApiResponse.success(res, {
      _id: item.id,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      reserved: item.reserved,
      available: item.quantity - item.reserved,
    });
  } catch (error) {
    console.error("[Warehouses] Error updating inventory:", error);
    return ApiResponse.error(res, "Failed to update inventory", 500);
  }
};

// get warehouse stats overview
export const getWarehouseStats = async (req: Request, res: Response) => {
  try {
    const warehouses = await prisma.warehouse.findMany({
      include: {
        _count: { select: { shipments: true } },
      },
    });

    const totalCapacity = warehouses.reduce((sum, wh) => sum + wh.capacity, 0);
    const totalLoad = warehouses.reduce((sum, wh) => sum + wh.currentLoad, 0);
    const congested = warehouses.filter((wh) => wh.congestionLevel === "high" || wh.congestionLevel === "critical").length;
    const degraded = warehouses.filter((wh) => wh.status !== "operational").length;

    const avgUtilization = warehouses.length > 0
      ? Math.round(warehouses.reduce((sum, wh) => sum + wh.utilizationPct, 0) / warehouses.length * 10) / 10
      : 0;

    const avgProcessTime = warehouses.length > 0
      ? Math.round(warehouses.reduce((sum, wh) => sum + wh.avgProcessTime, 0) / warehouses.length * 10) / 10
      : 0;

    // low stock items across all warehouses
    const lowStockItems = await prisma.inventoryItem.findMany({
      where: {
        quantity: { lte: 15 },
      },
      include: {
        warehouse: { select: { name: true, code: true } },
      },
    });

    const lowStockCount = lowStockItems.filter(
      (item) => item.quantity - item.reserved <= item.reorderPoint
    ).length;

    return ApiResponse.success(res, {
      stats: {
        total_warehouses: warehouses.length,
        total_capacity: totalCapacity,
        total_load: totalLoad,
        avg_utilization: avgUtilization,
        avg_process_time: avgProcessTime,
        congested_count: congested,
        degraded_count: degraded,
        low_stock_items: lowStockCount,
      },
    });
  } catch (error) {
    console.error("[Warehouses] Error fetching stats:", error);
    return ApiResponse.error(res, "Failed to fetch warehouse stats", 500);
  }
};

// get all carriers
export const getCarriers = async (req: Request, res: Response) => {
  try {
    const { region } = req.query;

    const where: any = { isActive: true };
    if (region && typeof region === "string") where.regions = { has: region };

    const carriers = await prisma.carrier.findMany({
      where,
      include: {
        _count: { select: { shipments: true } },
      },
      orderBy: { reliabilityScore: "desc" },
    });

    const normalized = carriers.map((c) => ({
      _id: c.id,
      name: c.name,
      code: c.code,
      reliability_score: c.reliabilityScore,
      avg_delivery_time: c.avgDeliveryTime,
      active_shipments: c._count.shipments,
      total_deliveries: c.totalDeliveries,
      on_time_rate: c.onTimeRate,
      failure_rate: c.failureRate,
      regions: c.regions,
      is_active: c.isActive,
      last_incident: c.lastIncident,
    }));

    return ApiResponse.success(res, { carriers: normalized, total: normalized.length });
  } catch (error) {
    console.error("[Carriers] Error fetching carriers:", error);
    return ApiResponse.error(res, "Failed to fetch carriers", 500);
  }
};

// get agent actions (for learn loop display)
export const getAgentActions = async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const take = parseInt(limit as string) || 20;

    const actions = await prisma.agentAction.findMany({
      orderBy: { executedAt: "desc" },
      take,
    });

    const normalized = actions.map((a) => ({
      _id: a.id,
      action_id: a.actionId,
      action_type: a.actionType,
      target_type: a.targetType,
      target_id: a.targetId,
      description: a.description,
      reasoning: a.reasoning,
      confidence: a.confidence,
      outcome: a.outcome,
      was_correct: a.wasCorrect,
      required_human: a.requiredHuman,
      executed_at: a.executedAt,
      evaluated_at: a.evaluatedAt,
      metadata: a.metadata,
    }));

    return ApiResponse.success(res, { actions: normalized, total: normalized.length });
  } catch (error) {
    console.error("[AgentActions] Error fetching actions:", error);
    return ApiResponse.error(res, "Failed to fetch agent actions", 500);
  }
};

// evaluate agent action outcome (learn loop)
export const evaluateAgentAction = async (req: Request, res: Response) => {
  try {
    const { actionId } = req.params;
    const { was_correct, outcome } = req.body;

    if (was_correct === undefined) {
      return ApiResponse.error(res, "was_correct is required", 400);
    }

    const action = await prisma.agentAction.update({
      where: { actionId },
      data: {
        wasCorrect: was_correct,
        outcome: outcome || (was_correct ? "success" : "incorrect"),
        evaluatedAt: new Date(),
      },
    });

    console.log("[AgentActions] Evaluated:", actionId, "correct:", was_correct);
    return ApiResponse.success(res, {
      action_id: action.actionId,
      was_correct: action.wasCorrect,
      outcome: action.outcome,
    });
  } catch (error) {
    console.error("[AgentActions] Error evaluating action:", error);
    return ApiResponse.error(res, "Failed to evaluate agent action", 500);
  }
};
