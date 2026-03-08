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
  getChats,
  getChatById,
  getChatMessages,
  sendChatMessage,
  getSupportTickets,
  getSupportTicketById,
  getSupportTicketMessages,
  createSupportTicket,
  sendTicketMessage,
  escalateTicketHandler,
  getAgentLogs,
  getAgentLogById,
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

// n8n agent chats collection endpoints
router.get("/chats", getChats);
router.get("/chats/:chatId", getChatById);
router.get("/chats/:chatId/messages", getChatMessages);
router.post("/chats/:chatId/message", sendChatMessage);

// support tickets (linked to n8n agent via webhook)
router.get("/tickets", getSupportTickets);
router.get("/tickets/:ticketId", getSupportTicketById);
router.get("/tickets/:ticketId/messages", getSupportTicketMessages);
router.post("/tickets", createSupportTicket);
router.post("/tickets/:ticketId/message", sendTicketMessage);
router.post("/tickets/:ticketId/escalate", escalateTicketHandler);

// agent execution logs (OODA loop)
router.get("/agent-logs", getAgentLogs);
router.get("/agent-logs/:logId", getAgentLogById);

export default router;
