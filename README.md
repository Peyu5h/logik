# Logik - AI-Powered Logistics Platform

- Frontend: https://logikk.vercel.app
- Backend: https://logik-eight.vercel.app

## What is this

Logik is a logistics operations platform that uses an AI agent to handle shipment disruptions autonomously. When things go wrong (delays, warehouse congestion, carrier failures), the system detects the issue, reasons through it using an OODA loop, and takes action - rerouting shipments, swapping carriers, notifying consumers - without human intervention.

The core of the system is a custom TensorFlow model trained on 14k samples that picks the best carrier for each shipment. It hits 93.66% accuracy on carrier selection, factoring in reliability scores, regional coverage, and real-time performance data.

## How it works

There are 7 trigger functions that simulate real logistics failures:

- MissedPickupFunction - pickup agent doesn't show
- ETAslippingFunction - ETA delays quietly
- CarrierCollapseFunction - carrier goes dark
- HubCongestionFunction - warehouse hits capacity
- CascadingDelayFunction - delays cascade across shipments
- CarrierDegradeFunction - carrier reliability dropping
- WrongDeliveryFunction - package at wrong address

When a trigger fires, the agent observes the situation, reasons about root cause, decides on an action, acts on it, and logs what it learned. Everything flows through n8n workflows that orchestrate the agent's decision-making and tool calls.

## Features

- Real-time shipment tracking on an interactive map with live carrier/warehouse status
- OODA-loop agent that processes triggers and takes autonomous actions (reroute, reprioritize, escalate, notify)
- Multi-hop route visualization with warehouse waypoints and congestion detection
- Admin ops panel with system logs, trigger controls, and shipment state management
- Consumer support chat backed by n8n agent with automatic escalation to human support
- Agent execution logs showing full reasoning chain for every decision
- Carrier reliability scoring that degrades on incidents and recovers over time
- SLA monitoring with auto-escalation when deadlines are breached

## Tech Stack

- Frontend: Next.js 15, Tailwind v4, Shadcn/ui, Mapbox GL, React Query, Jotai
- Backend: Express 5, Prisma ORM, MongoDB, Zod validation
- AI/ML: Custom TensorFlow model (carrier selection), n8n workflows (agent orchestration)
- Infra: Vercel (frontend), Vercel (backend)

## Project structure

```
src/                    # Next.js frontend
  app/(main)/admin/     # ops manager pages (logs, map, support, agent-logs)
  app/(main)/support/   # consumer support chat
  app/(main)/track/     # shipment tracking
  components/agent/     # chat UI, message rendering
  hooks/                # React Query hooks
  lib/                  # types, utils

backend/
  src/controllers/      # route handlers
    triggerController    # all 7 trigger functions + reset
    adminController      # incidents, chats, tickets, agent logs
    agentController      # agent observation endpoints
  prisma/
    schema.prisma        # full data model
    seed.ts              # demo data (3 shipments, 5 carriers, 10 warehouses)
```
