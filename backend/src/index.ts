import express, { Application } from "express";
import cors from "cors";
import { config } from "./config/env.js";
import routes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import prisma from "./config/database.js";

const app: Application = express();

app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "working",
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

const checkDatabaseConnection = async () => {
  try {
    await prisma.$connect();
    console.log("✓ Database connected successfully");
  } catch (error) {
    console.error("✗ Database connection failed:", error);
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    await checkDatabaseConnection();

    app.listen(config.port, () => {
      console.log("Server Started Successfully");
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`URL: http://localhost:${config.port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

const gracefulShutdown = async () => {
  console.log("\n\nShutting down gracefully...");

  try {
    await prisma.$disconnect();
    console.log("✓ Database disconnected");
    process.exit(0);
  } catch (error) {
    console.error("✗ Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown();
});

startServer();

export default app;
