# n8n Workflow Guide — Logistix Agentic Operations Layer

## Overview

This document describes the n8n workflows needed to complete the agentic logistics system. The backend fires webhooks at specific points in the shipment lifecycle. n8n receives these, runs reasoning/decision logic, and returns structured responses that the backend records and the UI surfaces.

There are **3 workflows** to build:

1. **Agent Webhook** — receives trigger events, reasons about them, returns actions
2. **Email Notification** — sends delay/SLA emails to consumers
3. **Escalation** — notifies human ops when confidence is low or SLA is breached

---

## Environment Variables (Backend `.env`)

```
WEBHOOK_AGENT_URL=https://<your-n8n-instance>/webhook/agent
WEBHOOK_SHIPMENT_UPDATE_URL=https://<your-n8n-instance>/webhook/shipment-update
WEBHOOK_EMAIL_URL=https://<your-n8n-instance>/webhook/email-notification
WEBHOOK_INCIDENT_URL=https://<your-n8n-instance>/webhook/incident
WEBHOOK_RESOLVE_INCIDENT_URL=https://<your-n8n-instance>/webhook/resolve-incident
```

---

## Workflow 1: Agent Webhook

**Webhook URL:** `POST /webhook/agent`

### When it fires

Every time a trigger is processed on a shipment (late pickup, carrier breakdown, weather disruption, etc.), the backend fires this webhook with the full shipment context.

### Incoming Payload

```json
{
  "trigger_type": "late_pickup",
  "caseId": 1,
  "trackingId": "SHP-CASE001",
  "shipmentId": "mongoid_here",
  "consumer": {
    "id": "consumer_mongo_id",
    "name": "Rahul Sharma",
    "email": "rahul@acmecorp.com"
  },
  "currentState": {
    "status": "delayed",
    "priority": "high",
    "delay": 120,
    "riskScore": 35,
    "slaBreached": false,
    "rerouted": false,
    "escalated": false,
    "carrier": { "id": "...", "name": "Delhivery Express", "code": "DXP", "reliabilityScore": 92 },
    "warehouse": { "id": "...", "name": "Delhi North Hub", "code": "DEL-N1", "status": "operational" },
    "finalEta": "2026-03-10T14:00:00.000Z",
    "value": 45000
  },
  "actions": {
    "carrierReassigned": true,
    "newCarrier": { "code": "XBS", "name": "XpressBees", "reliability": 90 },
    "warehouseRerouted": false,
    "newWarehouse": null,
    "emailTriggered": false,
    "slaBreachDetected": false
  },
  "origin": { "lat": 28.6139, "lng": 77.209, "city": "Delhi NCR", "region": "north" },
  "destination": { "lat": 19.076, "lng": 72.8777, "city": "Mumbai", "region": "west" },
  "deliveryAddress": "42, Andheri East, SVP Nagar, Mumbai, Maharashtra 400069",
  "recipientName": "Rahul Sharma",
  "recipientPhone": "+91 98765 43210",
  "timestamp": "2026-03-08T10:30:00.000Z"
}
```

### Expected Response (what n8n should return)

```json
{
  "agent_message": "Carrier DXP missed the 2hr pickup window. Reassigned to XpressBees (90% reliability). Monitoring for further delays.",
  "cards": [
    {
      "title": "Reassign Carrier",
      "description": "Switch to XpressBees for faster recovery",
      "action_type": "reroute",
      "payload": {
        "shipmentId": "mongoid_here",
        "newCarrier": "XBS",
        "reason": "Late pickup - carrier unresponsive"
      },
      "webhook_to_call": "http://localhost:5000/api/agent/reroute"
    },
    {
      "title": "Escalate to Ops",
      "description": "Flag for manual review",
      "action_type": "escalate",
      "payload": {
        "shipmentId": "mongoid_here",
        "reason": "Repeated carrier delays",
        "urgency": "high"
      },
      "webhook_to_call": "http://localhost:5000/api/agent/escalate"
    }
  ],
  "tools_used": ["risk_assessment", "carrier_lookup"],
  "actions_taken": ["carrier_reassignment"],
  "reasoning": "Delay exceeded 2hr threshold. DXP has had 2 incidents this week. XpressBees covers north+west regions with 90% reliability. Auto-reassigned per policy.",
  "confidence_score": 85
}
```

### n8n Flow Design

```
[Webhook Trigger]
    │
    ▼
[Set Variables] — extract trigger_type, caseId, delay, riskScore, value
    │
    ▼
[Switch Node] — branch on trigger_type
    │
    ├── late_pickup ──────────► [Compose late pickup response]
    ├── carrier_breakdown ────► [Compose breakdown response]
    ├── warehouse_congestion ─► [Compose congestion response]
    ├── weather_disruption ───► [Compose weather response]
    ├── customs_hold ─────────► [Compose customs response]
    ├── inaccurate_ETA ───────► [Compose ETA response]
    ├── SLA_BREACH ───────────► [Compose SLA breach response + trigger email]
    └── resolve ──────────────► [Compose resolution response]
    │
    ▼
[Optional: LLM Node] — pass context to GPT/Claude for human-readable reasoning
    │
    ▼
[Respond to Webhook] — return JSON response
```

### Node Details

#### Switch Node conditions

| Trigger Type         | Key Decision                                      |
|----------------------|---------------------------------------------------|
| late_pickup          | If delay >= 120min: recommend carrier reassign     |
| carrier_breakdown    | Always recommend emergency reassign + email        |
| warehouse_congestion | If delay >= 180min: recommend warehouse reroute    |
| weather_disruption   | Monitor only, suggest ETA update                   |
| customs_hold         | Flag for human review, update ETA                  |
| inaccurate_ETA       | Recalculate and suggest correction                 |
| SLA_BREACH           | Auto-escalate + email + flag human                 |
| resolve              | Confirm resolution, close incidents                |

#### Optional LLM Node

If you want human-readable reasoning, add an OpenAI/Anthropic node:

**System prompt:**
```
You are a logistics operations AI. Given a shipment trigger event, provide:
1. A brief summary of what happened (1-2 sentences)
2. What actions were taken automatically
3. What the ops team should watch for next
Keep responses under 100 words. Be direct and factual.
```

**User prompt template:**
```
Trigger: {{$json.trigger_type}}
Case: {{$json.caseId}} ({{$json.trackingId}})
Route: {{$json.origin.city}} → {{$json.destination.city}}
Delay: {{$json.currentState.delay}} minutes
Risk: {{$json.currentState.riskScore}}%
Value: INR {{$json.currentState.value}}
Carrier reassigned: {{$json.actions.carrierReassigned}}
SLA breached: {{$json.currentState.slaBreached}}
```

---

## Workflow 2: Email Notification

**Webhook URL:** `POST /webhook/email-notification`

### When it fires

The backend fires this when:
- Total delay reaches 6 hours (360 minutes) — consumer delay notification
- SLA is breached — SLA breach notification
- Warehouse reroute at 10 hours — reroute notification

### Incoming Payload

```json
{
  "type": "email_notification",
  "trigger": "delay_6hrs",
  "caseId": 1,
  "trackingId": "SHP-CASE001",
  "consumerEmail": "rahul@acmecorp.com",
  "consumerName": "Rahul Sharma",
  "totalDelay": 360,
  "currentStatus": "delayed",
  "estimatedDelivery": "2026-03-10T20:00:00.000Z",
  "message": "Your shipment SHP-CASE001 is delayed by 6 hours. New estimated delivery: Mar 10, 8:00 PM."
}
```

#### Trigger variants

| `trigger` field              | Context                                           |
|------------------------------|---------------------------------------------------|
| `delay_6hrs`                 | 6hr threshold crossed, first consumer notification |
| `sla_breach`                 | SLA deadline missed, escalation email              |
| `warehouse_reroute_10hrs`    | 10hr threshold, rerouted to new warehouse          |
| `carrier_breakdown_email`    | Carrier broke down, reassignment email             |

### n8n Flow Design

```
[Webhook Trigger]
    │
    ▼
[Switch Node] — branch on trigger field
    │
    ├── delay_6hrs ───────────► [Send delay notification email]
    ├── sla_breach ───────────► [Send SLA breach email]
    ├── warehouse_reroute ────► [Send reroute email]
    └── carrier_breakdown ────► [Send carrier change email]
    │
    ▼
[Email Send Node] — Gmail / SendGrid / SMTP
    │
    ▼
[Respond to Webhook] — return { status: "sent", emailId: "..." }
```

### Email Templates

**Delay notification:**
```
Subject: Shipment {{trackingId}} — Delivery Delayed

Hi {{consumerName}},

Your shipment {{trackingId}} has been delayed.

Current delay: {{totalDelay / 60}} hours
New estimated delivery: {{estimatedDelivery}}

We're actively working to get your package delivered as quickly as possible.
Track your shipment: https://logistix.app/track/{{trackingId}}

— Logistix Team
```

**SLA breach:**
```
Subject: Shipment {{trackingId}} — SLA Deadline Missed

Hi {{consumerName}},

We regret to inform you that your shipment {{trackingId}} has missed its
guaranteed delivery window.

Our operations team has been notified and is prioritizing your delivery.
You will receive a follow-up within 2 hours.

Track your shipment: https://logistix.app/track/{{trackingId}}

— Logistix Team
```

---

## Workflow 3: Escalation (Optional)

**Webhook URL:** `POST /webhook/incident`

### When it fires

The backend creates incidents for every trigger. This webhook notifies ops.

### Incoming Payload

Same as the agent webhook payload (see Workflow 1).

### n8n Flow Design

```
[Webhook Trigger]
    │
    ▼
[IF Node] — check if riskScore >= 70 OR slaBreached OR value >= 100000
    │
    ├── YES ► [Send Slack / Email to Ops Team]
    │          │
    │          ▼
    │         [Create Ticket in Jira / Linear / Notion]
    │
    └── NO ─► [Log only, no action]
    │
    ▼
[Respond to Webhook]
```

---

## Backend Agent API Endpoints (for n8n to call back)

These are the endpoints n8n workflows can call to take actions on shipments:

| Method | Endpoint                              | Purpose                        | Key Params                                    |
|--------|---------------------------------------|--------------------------------|-----------------------------------------------|
| GET    | `/api/agent/observe`                  | Get all shipment states        | —                                             |
| GET    | `/api/agent/shipment/:caseId`         | Get one shipment by case ID    | caseId: 1, 2, or 3                            |
| GET    | `/api/agent/risk/:shipmentId`         | Risk assessment                | shipmentId (mongo ID or caseId)               |
| GET    | `/api/agent/carrier/:code/reliability`| Carrier reliability metrics    | carrier code (DXP, BFX, etc.)                 |
| POST   | `/api/agent/reroute`                  | Reassign carrier               | `{ shipmentId, newCarrier, reason }`          |
| POST   | `/api/agent/escalate`                 | Escalate shipment              | `{ shipmentId, reason, urgency }`             |
| POST   | `/api/agent/reprioritize`             | Change priority                | `{ shipmentId, newPriority, reason }`         |
| POST   | `/api/agent/update-eta`               | Update ETA                     | `{ shipmentId, newEtaMs, reason }`            |
| POST   | `/api/agent/update-status`            | Update shipment status         | `{ shipmentId, status, currentLocation }`     |
| POST   | `/api/agent/log`                      | Create agent log entry         | `{ type, message, data }`                     |

### Example: n8n calling reroute

In n8n, add an HTTP Request node:

- **Method:** POST
- **URL:** `http://localhost:5000/api/agent/reroute`
- **Body (JSON):**
```json
{
  "shipmentId": "{{$json.shipmentId}}",
  "newCarrier": "XBS",
  "reason": "Auto-reroute due to carrier breakdown. Confidence: 92%.",
  "autonomous": true
}
```

---

## Demo Shipments Reference

| Case | Tracking ID  | Route                 | Value      | Priority | Carrier | Warehouse |
|------|--------------|-----------------------|------------|----------|---------|-----------|
| 1    | SHP-CASE001  | Delhi NCR → Mumbai    | INR 45,000 | high     | DXP     | DEL-N1    |
| 2    | SHP-CASE002  | Mumbai → Bangalore    | INR 1,25,000| urgent  | BFX     | MUM-W1    |
| 3    | SHP-CASE003  | Kolkata → Delhi NCR   | INR 8,500  | medium   | SFX     | KOL-E1    |

### Consumers

| Email               | Name          | Shipments  |
|---------------------|---------------|------------|
| rahul@acmecorp.com  | Rahul Sharma  | Case 1, 2  |
| priya@example.com   | Priya Patel   | Case 3     |

### Carriers

| Code | Name                | Reliability | Regions                    |
|------|---------------------|-------------|----------------------------|
| DXP  | Delhivery Express   | 92%         | north, west, central       |
| BFX  | BlueDart FastX      | 88%         | north, south, west, east   |
| EKL  | Ecom Kart Logistics | 78%         | south, west                |
| SFX  | Shadowfax           | 85%         | south, east, central       |
| XBS  | XpressBees          | 90%         | north, south, west, east, central |

---

## Auto-Action Thresholds

These are enforced by the backend trigger controller, not n8n. n8n receives the results.

| Delay Threshold | Automatic Action                       |
|-----------------|----------------------------------------|
| 2 hours (120m)  | Carrier reassigned to best available   |
| 6 hours (360m)  | Email notification sent to consumer    |
| 10 hours (600m) | Warehouse reroute + new carrier        |
| SLA breach      | Auto-escalate + email notification     |

---

## Trigger Types and Their Effects

| Trigger               | Delay Added | Risk Delta | Severity | Auto Actions              |
|-----------------------|-------------|------------|----------|---------------------------|
| late_pickup           | +120 min    | +15        | medium   | Carrier reassign at 2hr   |
| carrier_breakdown     | +240 min    | +30        | critical | Emergency reassign        |
| warehouse_congestion  | +180 min    | +20        | high     | —                         |
| weather_disruption    | +300 min    | +25        | high     | —                         |
| customs_hold          | +360 min    | +20        | high     | Email at 6hr threshold    |
| inaccurate_ETA        | +90 min     | +10        | medium   | —                         |
| SLA_BREACH            | +480 min    | +40        | critical | Escalate + email          |
| resolve               | reset to 0  | reset to 0 | low      | Clear all flags           |

---

## Step-by-Step Setup

### 1. Create n8n instance

Use [n8n.io cloud](https://n8n.io) or self-host with Docker:

```bash
docker run -it --rm --name n8n -p 5678:5678 n8nio/n8n
```

### 2. Create Workflow 1 (Agent Webhook)

1. Add a **Webhook** node, set path to `/agent`, method POST
2. Add a **Set** node to extract key fields from the body
3. Add a **Switch** node branching on `trigger_type`
4. For each branch, add a **Set** node that builds the response JSON
5. (Optional) Add an **OpenAI** node for reasoning text
6. Add a **Respond to Webhook** node returning the built JSON
7. Activate the workflow

### 3. Create Workflow 2 (Email Notification)

1. Add a **Webhook** node, path `/email-notification`, method POST
2. Add a **Switch** node on the `trigger` field
3. For each branch, add a **Send Email** node (Gmail, SendGrid, or SMTP)
4. Add a **Respond to Webhook** node returning `{ status: "sent" }`
5. Activate the workflow

### 4. Update backend .env

Set the webhook URLs from your n8n instance:

```env
WEBHOOK_AGENT_URL=https://your-n8n.app.n8n.cloud/webhook/agent
WEBHOOK_SHIPMENT_UPDATE_URL=https://your-n8n.app.n8n.cloud/webhook/shipment-update
WEBHOOK_EMAIL_URL=https://your-n8n.app.n8n.cloud/webhook/email-notification
```

### 5. Link demo shipments to your consumer

If the demo shipments are not showing for your consumer account, call:

```bash
curl -X POST http://localhost:5000/api/shipments/link-demo \
  -H "Content-Type: application/json" \
  -d '{ "email": "rahul@acmecorp.com" }'
```

This links all 3 demo shipments (caseId 1, 2, 3) to the consumer account.

### 6. Test the flow

1. Log in as admin (`admin@logistix.com` / `admin123`)
2. Go to Logs page
3. Select a case (1, 2, or 3) in the trigger panel
4. Fire a trigger (e.g., Late Pickup)
5. Check n8n execution history for the webhook call
6. Check backend logs for the response

---

## What to Pass Me Next

To continue building out the system, provide:

1. **n8n instance URL** — so I can configure the webhook URLs in `.env`
2. **Email provider choice** — Gmail, SendGrid, Resend, or SMTP credentials for the email workflow
3. **LLM preference** — OpenAI, Anthropic, or local model for the reasoning node
4. **Slack/Discord webhook** (optional) — for the escalation workflow
5. **Any custom business rules** — specific thresholds, carrier preferences, region-based routing logic

### Build priorities (recommended order)

1. Get Workflow 1 (Agent Webhook) working with a simple static response first
2. Add Workflow 2 (Email) with a real email provider
3. Add LLM reasoning to Workflow 1
4. Add Workflow 3 (Escalation) with Slack/email
5. Add feedback loop — agent evaluates its own actions and adjusts confidence
