import { Router } from "express";
import authRoutes from "./authRoutes.js";
import adminRoutes from "./adminRoutes.js";
import logsRoutes from "./logsRoutes.js";
import shipmentRoutes from "./shipmentRoutes.js";
import warehouseRoutes from "./warehouseRoutes.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "API is healthy",
    timestamp: new Date().toISOString(),
  });
});

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/logs", logsRoutes);
router.use("/shipments", shipmentRoutes);
router.use("/warehouses", warehouseRoutes);

export default router;
