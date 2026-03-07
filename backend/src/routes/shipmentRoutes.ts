import { Router } from "express";
import {
  getShipments,
  getShipmentById,
  createShipment,
  updateShipmentStatus,
  updateRiskScore,
  rerouteShipment,
  getShipmentStats,
  sendAgentMessage,
} from "../controllers/shipmentController.js";

const router = Router();

// shipment stats overview
router.get("/stats", getShipmentStats);

// get all shipments (filterable by consumer_id, status, priority, carrier_id, warehouse_id)
router.get("/", getShipments);

// get single shipment
router.get("/:shipmentId", getShipmentById);

// create new shipment
router.post("/", createShipment);

// update shipment status + location
router.patch("/:shipmentId/status", updateShipmentStatus);

// update risk score (agent endpoint)
router.patch("/:shipmentId/risk", updateRiskScore);

// reroute shipment to different carrier
router.post("/:shipmentId/reroute", rerouteShipment);

// send message to agent about a shipment
router.post("/agent", sendAgentMessage);

export default router;
