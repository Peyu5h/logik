import { Router } from "express";
import {
  handleTrigger,
  getTriggerInfo,
  getTriggerHistory,
  updateCarrierReliability,
} from "../controllers/triggerController.js";

const router = Router();

// get available trigger types and thresholds
router.get("/info", getTriggerInfo);

// get trigger history for a shipment (by caseId or mongo id)
router.get("/history/:shipmentId", getTriggerHistory);

// update carrier reliability score
router.post("/carrier/:carrierCode/reliability", updateCarrierReliability);

// fire a trigger for a shipment
// :shipmentId can be caseId (1,2,3) or mongo ObjectId
// :issue can be: delay, SLA_BREACH, set_in_transit, arrived_warehouse, reset_demo, resolve
router.post("/:shipmentId/:issue", handleTrigger);

export default router;
