import { Router } from "express";
import {
  handleTrigger,
  getTriggerInfo,
  getTriggerHistory,
} from "../controllers/triggerController.js";

const router = Router();

// get available trigger types and thresholds
router.get("/info", getTriggerInfo);

// get trigger history for a shipment (by caseId or mongo id)
router.get("/history/:shipmentId", getTriggerHistory);

// fire a trigger for a shipment
// :shipmentId can be caseId (1,2,3) or mongo ObjectId
// :issue can be: warehouse_congestion, carrier_breakdown, late_pickup,
//   weather_disruption, customs_hold, inaccurate_ETA, SLA_BREACH, resolve
router.post("/:shipmentId/:issue", handleTrigger);

export default router;
