import dotenv from "dotenv";

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  database: {
    url: string;
  };
  cors: {
    origin: string;
  };
  webhook: {
    ticketUrl: string;
    resolveTicketUrl: string;
  };
}

export const config: Config = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  database: {
    url: process.env.DATABASE_URL || "",
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
  },
  webhook: {
    ticketUrl: process.env.WEBHOOK_TICKET_URL || "https://abstruse.app.n8n.cloud/webhook/ticket",
    resolveTicketUrl: process.env.WEBHOOK_RESOLVE_TICKET_URL || "https://abstruse.app.n8n.cloud/webhook/resolve-ticket",
  },
};

const requiredEnvVars = ["DATABASE_URL"];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export default config;
