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
    agentUrl: string;
    shipmentUpdateUrl: string;
    incidentUrl: string;
    resolveIncidentUrl: string;
  };
  pusher: {
    appId: string;
    key: string;
    secret: string;
    cluster: string;
  };
  mapbox: {
    accessToken: string;
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
    agentUrl: process.env.WEBHOOK_AGENT_URL || "https://mihirj.app.n8n.cloud/webhook/logistics-agent",
    shipmentUpdateUrl: process.env.WEBHOOK_SHIPMENT_UPDATE_URL || "https://mihirj.app.n8n.cloud/webhook/logistics-agent",
    incidentUrl: process.env.WEBHOOK_INCIDENT_URL || "https://mihirj.app.n8n.cloud/webhook/logistics-agent",
    resolveIncidentUrl: process.env.WEBHOOK_RESOLVE_INCIDENT_URL || "https://mihirj.app.n8n.cloud/webhook/logistics-agent",
  },
  pusher: {
    appId: process.env.PUSHER_APP_ID || "",
    key: process.env.PUSHER_KEY || "",
    secret: process.env.PUSHER_SECRET || "",
    cluster: process.env.PUSHER_CLUSTER || "ap2",
  },
  mapbox: {
    accessToken: process.env.MAPBOX_ACCESS_TOKEN || "",
  },
};

const requiredEnvVars = ["DATABASE_URL"];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export default config;
