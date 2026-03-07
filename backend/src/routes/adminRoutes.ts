import { Router } from "express";
import {
  getIncidents,
  getEscalatedIncidents,
  getIncidentById,
  getIncidentMessages,
  sendAdminMessage,
  escalateIncident,
  resolveIncident,
  updateIncidentSeverity,
  getDashboardStats,
} from "../controllers/adminController.js";

const router = Router();

// ops manager dashboard stats
router.get("/dashboard", getDashboardStats);

// get all incidents (filterable by status, severity, type)
router.get("/incidents", getIncidents);

// get escalated incidents only
router.get("/incidents/escalated", getEscalatedIncidents);

// get single incident detail
router.get("/incidents/:incidentId", getIncidentById);

// get messages for an incident chat (for polling)
router.get("/incidents/:incidentId/messages", getIncidentMessages);

// send message as ops manager on an incident
router.post("/incidents/:incidentId/message", sendAdminMessage);

// escalate incident
router.post("/incidents/:incidentId/escalate", escalateIncident);

// resolve incident
router.patch("/incidents/:incidentId/resolve", resolveIncident);

// update incident severity
router.patch("/incidents/:incidentId/severity", updateIncidentSeverity);

export default router;
