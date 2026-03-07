import { Router } from "express";
import {
  getWarehouses,
  getWarehouseById,
  updateWarehouseStatus,
  getWarehouseInventory,
  updateInventory,
  getWarehouseStats,
  getCarriers,
  getAgentActions,
  evaluateAgentAction,
} from "../controllers/warehouseController.js";

const router = Router();

// warehouse stats overview
router.get("/stats", getWarehouseStats);

// get all carriers
router.get("/carriers", getCarriers);

// agent actions (learn loop)
router.get("/agent-actions", getAgentActions);
router.patch("/agent-actions/:actionId/evaluate", evaluateAgentAction);

// get all warehouses (filterable by region, status)
router.get("/", getWarehouses);

// get single warehouse with inventory + active shipments
router.get("/:warehouseId", getWarehouseById);

// update warehouse status / congestion
router.patch("/:warehouseId/status", updateWarehouseStatus);

// get inventory for a warehouse
router.get("/:warehouseId/inventory", getWarehouseInventory);

// update inventory item
router.patch("/inventory/:itemId", updateInventory);

export default router;
