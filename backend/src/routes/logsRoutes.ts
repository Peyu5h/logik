import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();


// get logs with pagination
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 0;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = page * limit;

    const [logs, total] = await Promise.all([
      prisma.log.findMany({
        orderBy: { timestamp: "desc" },
        skip,
        take: limit,
      }),
      prisma.log.count(),
    ]);

    const formattedLogs = logs.map((log: any) => ({
      id: log.logId,
      timestamp: log.timestamp.toISOString(),
      event_type: log.eventType,
      source: log.source,
      severity: log.severity,
      message: log.message,
      trace_id: log.traceId,
      metadata: log.metadata || null,
    }));

    res.json({
      success: true,
      data: {
        logs: formattedLogs,
        total,
        page,
        limit,
        hasMore: skip + logs.length < total,
      },
    });
  } catch (error) {
    console.error("Failed to fetch logs:", error);
    res.status(500).json({
      success: false,
      error: [{ message: "Failed to fetch logs" }],
    });
  }
});

// create a new log
router.post("/", async (req, res) => {
  try {
    const { id, timestamp, event_type, source, severity, message, trace_id, metadata } =
      req.body;

    const log = await prisma.log.create({
      data: {
        logId: id,
        timestamp: new Date(timestamp),
        eventType: event_type,
        source,
        severity,
        message,
        traceId: trace_id,
        metadata: metadata || null,
      },
    });

    res.json({
      success: true,
      data: {
        id: log.logId,
        timestamp: log.timestamp.toISOString(),
        event_type: log.eventType,
        source: log.source,
        severity: log.severity,
        message: log.message,
        trace_id: log.traceId,
        metadata: (log as any).metadata || null,
      },
    });
  } catch (error) {
    console.error("Failed to create log:", error);
    res.status(500).json({
      success: false,
      error: [{ message: "Failed to create log" }],
    });
  }
});

// clear all logs
router.delete("/", async (req, res) => {
  try {
    await prisma.log.deleteMany({});
    res.json({
      success: true,
      message: "All logs cleared",
    });
  } catch (error) {
    console.error("Failed to clear logs:", error);
    res.status(500).json({
      success: false,
      error: [{ message: "Failed to clear logs" }],
    });
  }
});

// get single log by id
router.get("/:id", async (req, res) => {
  try {
    const log = await prisma.log.findUnique({
      where: { logId: req.params.id },
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        error: [{ message: "Log not found" }],
      });
    }

    return res.json({
      success: true,
      data: {
        id: log.logId,
        timestamp: log.timestamp.toISOString(),
        event_type: log.eventType,
        source: log.source,
        severity: log.severity,
        message: log.message,
        trace_id: log.traceId,
        metadata: (log as any).metadata || null,
      },
    });
  } catch (error) {
    console.error("Failed to fetch log:", error);
    return res.status(500).json({
      success: false,
      error: [{ message: "Failed to fetch log" }],
    });
  }
});

export default router;
