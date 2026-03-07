import { Router } from "express";
import {
  observe,
  assessRisk,
  reroute,
  escalate,
  reprioritize,
  updateEta,
  createAgentLog,
  carrierReliability,
  updateShipmentStatus,
  getShipmentByCaseId,
  updateCarrier,
} from "../controllers/agentController.js";

const router = Router();

// agent observes all shipment states + recent logs
router.get("/observe", observe);

// get shipment by caseId (1, 2, 3)
router.get("/shipment/:caseId", getShipmentByCaseId);

// risk assessment for a specific shipment
router.get("/risk/:shipmentId", assessRisk);

// carrier reliability check
router.get("/carrier/:carrier/reliability", carrierReliability);

// reroute shipment to new carrier
router.post("/reroute", reroute);

// escalate a shipment
router.post("/escalate", escalate);

// reprioritize a shipment
router.post("/reprioritize", reprioritize);

// update eta for a shipment
router.post("/update-eta", updateEta);

// update shipment status
router.post("/update-status", updateShipmentStatus);

// update carrier details (for n8n agent)
router.post("/carrier/:carrierCode/update", updateCarrier);

// agent creates a log entry
router.post("/log", createAgentLog);

export default router;
