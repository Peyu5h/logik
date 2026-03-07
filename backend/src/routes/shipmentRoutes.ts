import { Router, Request, Response } from "express";
import prisma from "../config/database.js";
import ApiResponse from "../utils/apiResponse.js";
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

// link demo shipments (caseId 1,2,3) to a consumer by email or userId
router.post("/link-demo", async (req: Request, res: Response) => {
  try {
    const { email, userId } = req.body;
    if (!email && !userId) {
      return ApiResponse.error(res, "email or userId is required", 400);
    }

    let consumer;
    if (userId) {
      try {
        consumer = await prisma.user.findUnique({ where: { id: userId } });
      } catch {
        // invalid objectid format
      }
    }
    if (!consumer && email) {
      consumer = await prisma.user.findUnique({ where: { email } });
    }

    if (!consumer) {
      return ApiResponse.error(res, `No user found with ${userId ? `id ${userId}` : `email ${email}`}`, 404);
    }

    const result = await prisma.shipment.updateMany({
      where: { caseId: { in: [1, 2, 3] } },
      data: { consumerId: consumer.id },
    });

    return ApiResponse.success(res, {
      linked: result.count,
      consumerId: consumer.id,
      email: consumer.email,
    });
  } catch (error) {
    console.error("[Shipments] link-demo error:", error);
    return ApiResponse.error(res, "Failed to link demo shipments", 500);
  }
});

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
