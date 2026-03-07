import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding logistics database...");

  // create admin (operations manager)
  const adminPassword = await bcrypt.hash("12345678", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@logistix.com" },
    update: {
      password: adminPassword,
      role: "admin",
      name: "Aditya Sharma",
    },
    create: {
      email: "admin@logistix.com",
      password: adminPassword,
      name: "Aditya Sharma",
      role: "admin",
    },
  });
  console.log("+ Admin (ops manager) created:", admin.email);

  // create consumer users
  const userPassword = await bcrypt.hash("12345678", 10);
  const consumer1 = await prisma.user.upsert({
    where: { email: "rahul@acmecorp.com" },
    update: { password: userPassword, role: "consumer" },
    create: {
      email: "rahul@acmecorp.com",
      password: userPassword,
      name: "Rahul Verma",
      role: "consumer",
    },
  });
  console.log("+ Consumer created:", consumer1.email);

  const consumer2 = await prisma.user.upsert({
    where: { email: "priya@globaltrade.in" },
    update: { password: userPassword, role: "consumer" },
    create: {
      email: "priya@globaltrade.in",
      password: userPassword,
      name: "Priya Nair",
      role: "consumer",
    },
  });
  console.log("+ Consumer created:", consumer2.email);

  // create carriers
  const carriers = await Promise.all([
    prisma.carrier.upsert({
      where: { code: "BFL" },
      update: {},
      create: {
        name: "BlueDart Freight Lines",
        code: "BFL",
        reliabilityScore: 87,
        avgDeliveryTime: 3.2,
        activeShipments: 42,
        totalDeliveries: 12840,
        onTimeRate: 91.5,
        failureRate: 1.8,
        regions: ["north", "west", "central"],
        isActive: true,
      },
    }),
    prisma.carrier.upsert({
      where: { code: "DXP" },
      update: {},
      create: {
        name: "Delhivery Express",
        code: "DXP",
        reliabilityScore: 92,
        avgDeliveryTime: 2.8,
        activeShipments: 67,
        totalDeliveries: 28450,
        onTimeRate: 94.2,
        failureRate: 1.1,
        regions: ["north", "south", "east", "west", "central"],
        isActive: true,
      },
    }),
    prisma.carrier.upsert({
      where: { code: "EKL" },
      update: {},
      create: {
        name: "Ekart Logistics",
        code: "EKL",
        reliabilityScore: 78,
        avgDeliveryTime: 4.1,
        activeShipments: 31,
        totalDeliveries: 9200,
        onTimeRate: 82.7,
        failureRate: 3.4,
        regions: ["south", "east"],
        isActive: true,
      },
    }),
    prisma.carrier.upsert({
      where: { code: "XBS" },
      update: {},
      create: {
        name: "XpressBees",
        code: "XBS",
        reliabilityScore: 84,
        avgDeliveryTime: 3.5,
        activeShipments: 55,
        totalDeliveries: 18700,
        onTimeRate: 88.9,
        failureRate: 2.2,
        regions: ["north", "south", "west"],
        isActive: true,
      },
    }),
    prisma.carrier.upsert({
      where: { code: "SFX" },
      update: {},
      create: {
        name: "Shadowfax",
        code: "SFX",
        reliabilityScore: 71,
        avgDeliveryTime: 5.0,
        activeShipments: 18,
        totalDeliveries: 4300,
        onTimeRate: 76.3,
        failureRate: 4.8,
        regions: ["north", "central"],
        isActive: true,
      },
    }),
  ]);
  console.log(`+ ${carriers.length} carriers created`);

  // create warehouses
  const warehouses = await Promise.all([
    prisma.warehouse.upsert({
      where: { code: "WH-DEL-01" },
      update: {},
      create: {
        name: "Delhi Hub",
        code: "WH-DEL-01",
        location: { lat: 28.6139, lng: 77.209, address: "Sector 18, Gurgaon", city: "Delhi NCR", region: "north" },
        capacity: 2000,
        currentLoad: 1340,
        utilizationPct: 67,
        throughputRate: 180,
        status: "operational",
        congestionLevel: "moderate",
        avgProcessTime: 1.8,
        regions: ["north", "central"],
        isActive: true,
      },
    }),
    prisma.warehouse.upsert({
      where: { code: "WH-MUM-01" },
      update: {},
      create: {
        name: "Mumbai Central",
        code: "WH-MUM-01",
        location: { lat: 19.076, lng: 72.8777, address: "Bhiwandi, Thane", city: "Mumbai", region: "west" },
        capacity: 3000,
        currentLoad: 2610,
        utilizationPct: 87,
        throughputRate: 220,
        status: "congested",
        congestionLevel: "high",
        avgProcessTime: 3.2,
        regions: ["west"],
        isActive: true,
      },
    }),
    prisma.warehouse.upsert({
      where: { code: "WH-BLR-01" },
      update: {},
      create: {
        name: "Bangalore South",
        code: "WH-BLR-01",
        location: { lat: 12.9716, lng: 77.5946, address: "Electronic City", city: "Bangalore", region: "south" },
        capacity: 1500,
        currentLoad: 720,
        utilizationPct: 48,
        throughputRate: 150,
        status: "operational",
        congestionLevel: "low",
        avgProcessTime: 1.5,
        regions: ["south"],
        isActive: true,
      },
    }),
    prisma.warehouse.upsert({
      where: { code: "WH-KOL-01" },
      update: {},
      create: {
        name: "Kolkata East",
        code: "WH-KOL-01",
        location: { lat: 22.5726, lng: 88.3639, address: "Salt Lake Sector V", city: "Kolkata", region: "east" },
        capacity: 1200,
        currentLoad: 980,
        utilizationPct: 81.7,
        throughputRate: 110,
        status: "degraded",
        congestionLevel: "high",
        avgProcessTime: 2.9,
        regions: ["east"],
        isActive: true,
      },
    }),
    prisma.warehouse.upsert({
      where: { code: "WH-HYD-01" },
      update: {},
      create: {
        name: "Hyderabad Central",
        code: "WH-HYD-01",
        location: { lat: 17.385, lng: 78.4867, address: "Shamshabad", city: "Hyderabad", region: "south" },
        capacity: 1800,
        currentLoad: 540,
        utilizationPct: 30,
        throughputRate: 160,
        status: "operational",
        congestionLevel: "low",
        avgProcessTime: 1.4,
        regions: ["south", "central"],
        isActive: true,
      },
    }),
  ]);
  console.log(`+ ${warehouses.length} warehouses created`);

  // create inventory items
  const inventoryItems = [];
  const skus = [
    { sku: "ELEC-PHONE-001", name: "Smartphone X Pro" },
    { sku: "ELEC-LAPTOP-002", name: "Laptop UltraSlim 15" },
    { sku: "FASH-SHOE-003", name: "Running Shoes V3" },
    { sku: "HOME-FURN-004", name: "Ergonomic Office Chair" },
    { sku: "FOOD-DRY-005", name: "Premium Dry Fruits Pack" },
  ];

  for (const wh of warehouses) {
    for (const item of skus) {
      const qty = Math.floor(Math.random() * 200) + 10;
      const reserved = Math.floor(qty * (Math.random() * 0.3));
      inventoryItems.push(
        prisma.inventoryItem.upsert({
          where: { sku_warehouseId: { sku: item.sku, warehouseId: wh.id } },
          update: {},
          create: {
            sku: item.sku,
            name: item.name,
            quantity: qty,
            reserved,
            reorderPoint: 15,
            warehouseId: wh.id,
            lastRestocked: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          },
        })
      );
    }
  }
  await Promise.all(inventoryItems);
  console.log(`+ ${inventoryItems.length} inventory items created`);

  // helper to generate tracking ids
  function trackingId(): string {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `SHP-${ts}-${rand}`;
  }

  function hoursAgo(h: number): Date {
    return new Date(Date.now() - h * 60 * 60 * 1000);
  }

  function hoursFromNow(h: number): Date {
    return new Date(Date.now() + h * 60 * 60 * 1000);
  }

  // create shipments across various statuses
  const shipmentData = [
    {
      trackingId: trackingId(),
      consumerId: consumer1.id,
      status: "in_transit" as const,
      priority: "high" as const,
      origin: { lat: 28.6139, lng: 77.209, address: "Sector 18, Gurgaon", city: "Delhi NCR", region: "north" },
      destination: { lat: 19.076, lng: 72.8777, address: "Andheri East", city: "Mumbai", region: "west" },
      currentLocation: { lat: 23.2599, lng: 77.4126, address: "In transit via Bhopal", city: "Bhopal", region: "central" },
      carrierId: carriers[1].id,
      warehouseId: warehouses[0].id,
      estimatedDelivery: hoursFromNow(18),
      weight: 2.5,
      dimensions: { length: 30, width: 20, height: 15, unit: "cm" },
      routeHistory: [
        { lat: 28.6139, lng: 77.209, label: "Picked up - Delhi Hub", timestamp: hoursAgo(12), status: "picked_up" },
        { lat: 26.8467, lng: 80.9462, label: "Departed Delhi", timestamp: hoursAgo(10), status: "in_transit" },
        { lat: 23.2599, lng: 77.4126, label: "Bhopal checkpoint", timestamp: hoursAgo(4), status: "in_transit" },
      ],
      slaDeadline: hoursFromNow(24),
      slaBreached: false,
      riskScore: 15,
    },
    {
      trackingId: trackingId(),
      consumerId: consumer1.id,
      status: "delayed" as const,
      priority: "urgent" as const,
      origin: { lat: 19.076, lng: 72.8777, address: "Bhiwandi, Thane", city: "Mumbai", region: "west" },
      destination: { lat: 12.9716, lng: 77.5946, address: "HSR Layout", city: "Bangalore", region: "south" },
      currentLocation: { lat: 15.3173, lng: 75.7139, address: "Stuck at Hubli hub", city: "Hubli", region: "south" },
      carrierId: carriers[2].id,
      warehouseId: warehouses[1].id,
      estimatedDelivery: hoursAgo(6),
      weight: 8.2,
      dimensions: { length: 60, width: 40, height: 30, unit: "cm" },
      routeHistory: [
        { lat: 19.076, lng: 72.8777, label: "Picked up - Mumbai Central", timestamp: hoursAgo(48), status: "picked_up" },
        { lat: 17.385, lng: 78.4867, label: "Hyderabad transit", timestamp: hoursAgo(30), status: "in_transit" },
        { lat: 15.3173, lng: 75.7139, label: "Delayed at Hubli - carrier issue", timestamp: hoursAgo(18), status: "delayed" },
      ],
      slaDeadline: hoursAgo(6),
      slaBreached: true,
      riskScore: 82,
      agentNotes: "Carrier EKL reported vehicle breakdown near Hubli. Rerouting recommended.",
    },
    {
      trackingId: trackingId(),
      consumerId: consumer2.id,
      status: "at_warehouse" as const,
      priority: "medium" as const,
      origin: { lat: 22.5726, lng: 88.3639, address: "Park Street", city: "Kolkata", region: "east" },
      destination: { lat: 28.6139, lng: 77.209, address: "Connaught Place", city: "Delhi NCR", region: "north" },
      currentLocation: { lat: 22.5726, lng: 88.3639, address: "Salt Lake Sector V", city: "Kolkata", region: "east" },
      carrierId: carriers[0].id,
      warehouseId: warehouses[3].id,
      estimatedDelivery: hoursFromNow(36),
      weight: 1.2,
      routeHistory: [
        { lat: 22.5726, lng: 88.3639, label: "Arrived at Kolkata East warehouse", timestamp: hoursAgo(8), status: "at_warehouse" },
      ],
      slaDeadline: hoursFromNow(48),
      slaBreached: false,
      riskScore: 45,
      agentNotes: "Kolkata warehouse degraded. Processing time elevated.",
    },
    {
      trackingId: trackingId(),
      consumerId: consumer2.id,
      status: "out_for_delivery" as const,
      priority: "high" as const,
      origin: { lat: 12.9716, lng: 77.5946, address: "Electronic City", city: "Bangalore", region: "south" },
      destination: { lat: 13.0827, lng: 80.2707, address: "T Nagar", city: "Chennai", region: "south" },
      currentLocation: { lat: 12.9352, lng: 79.1327, address: "Near Vellore", city: "Vellore", region: "south" },
      carrierId: carriers[3].id,
      warehouseId: warehouses[2].id,
      estimatedDelivery: hoursFromNow(4),
      weight: 0.5,
      routeHistory: [
        { lat: 12.9716, lng: 77.5946, label: "Dispatched from Bangalore South", timestamp: hoursAgo(6), status: "picked_up" },
        { lat: 12.9352, lng: 79.1327, label: "Vellore checkpoint", timestamp: hoursAgo(2), status: "in_transit" },
        { lat: 12.9352, lng: 79.1327, label: "Out for delivery", timestamp: hoursAgo(1), status: "out_for_delivery" },
      ],
      slaDeadline: hoursFromNow(8),
      slaBreached: false,
      riskScore: 8,
    },
    {
      trackingId: trackingId(),
      consumerId: consumer1.id,
      status: "delivered" as const,
      priority: "low" as const,
      origin: { lat: 17.385, lng: 78.4867, address: "Shamshabad", city: "Hyderabad", region: "south" },
      destination: { lat: 12.9716, lng: 77.5946, address: "Koramangala", city: "Bangalore", region: "south" },
      currentLocation: { lat: 12.9716, lng: 77.5946, address: "Koramangala", city: "Bangalore", region: "south" },
      carrierId: carriers[1].id,
      warehouseId: warehouses[4].id,
      estimatedDelivery: hoursAgo(2),
      actualDelivery: hoursAgo(3),
      weight: 3.0,
      routeHistory: [
        { lat: 17.385, lng: 78.4867, label: "Picked up - Hyderabad", timestamp: hoursAgo(28), status: "picked_up" },
        { lat: 15.3173, lng: 75.7139, label: "Hubli transit", timestamp: hoursAgo(18), status: "in_transit" },
        { lat: 12.9716, lng: 77.5946, label: "Delivered", timestamp: hoursAgo(3), status: "delivered" },
      ],
      slaDeadline: hoursAgo(1),
      slaBreached: false,
      riskScore: 0,
    },
    {
      trackingId: trackingId(),
      consumerId: consumer2.id,
      status: "pending" as const,
      priority: "medium" as const,
      origin: { lat: 28.6139, lng: 77.209, address: "Sector 62, Noida", city: "Delhi NCR", region: "north" },
      destination: { lat: 22.5726, lng: 88.3639, address: "New Town", city: "Kolkata", region: "east" },
      weight: 4.7,
      dimensions: { length: 45, width: 35, height: 25, unit: "cm" },
      routeHistory: [],
      slaDeadline: hoursFromNow(72),
      slaBreached: false,
      riskScore: 5,
    },
    {
      trackingId: trackingId(),
      consumerId: consumer1.id,
      status: "in_transit" as const,
      priority: "medium" as const,
      origin: { lat: 19.076, lng: 72.8777, address: "Bhiwandi", city: "Mumbai", region: "west" },
      destination: { lat: 17.385, lng: 78.4867, address: "Hitech City", city: "Hyderabad", region: "south" },
      currentLocation: { lat: 17.68, lng: 75.3, address: "Near Solapur", city: "Solapur", region: "west" },
      carrierId: carriers[0].id,
      warehouseId: warehouses[1].id,
      estimatedDelivery: hoursFromNow(10),
      weight: 1.8,
      routeHistory: [
        { lat: 19.076, lng: 72.8777, label: "Picked up - Mumbai Central", timestamp: hoursAgo(16), status: "picked_up" },
        { lat: 18.52, lng: 73.85, label: "Pune checkpoint", timestamp: hoursAgo(10), status: "in_transit" },
        { lat: 17.68, lng: 75.3, label: "Near Solapur", timestamp: hoursAgo(5), status: "in_transit" },
      ],
      slaDeadline: hoursFromNow(14),
      slaBreached: false,
      riskScore: 22,
    },
    {
      trackingId: trackingId(),
      consumerId: consumer2.id,
      status: "delayed" as const,
      priority: "high" as const,
      origin: { lat: 12.9716, lng: 77.5946, address: "Whitefield", city: "Bangalore", region: "south" },
      destination: { lat: 28.6139, lng: 77.209, address: "Rajouri Garden", city: "Delhi NCR", region: "north" },
      currentLocation: { lat: 17.385, lng: 78.4867, address: "Hyderabad hub", city: "Hyderabad", region: "south" },
      carrierId: carriers[4].id,
      warehouseId: warehouses[2].id,
      estimatedDelivery: hoursAgo(12),
      weight: 6.0,
      routeHistory: [
        { lat: 12.9716, lng: 77.5946, label: "Picked up", timestamp: hoursAgo(72), status: "picked_up" },
        { lat: 17.385, lng: 78.4867, label: "Hyderabad hub - delayed", timestamp: hoursAgo(36), status: "delayed" },
      ],
      slaDeadline: hoursAgo(12),
      slaBreached: true,
      riskScore: 91,
      agentNotes: "Carrier SFX low reliability in this corridor. Recommend rerouting via DXP.",
    },
  ];

  for (const data of shipmentData) {
    await prisma.shipment.create({ data });
  }
  console.log(`+ ${shipmentData.length} shipments created`);

  // create some incidents
  const allShipments = await prisma.shipment.findMany({
    where: { status: { in: ["delayed", "at_warehouse"] } },
  });

  let incidentCount = 0;
  for (const s of allShipments) {
    const incId = `INC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const isDelayed = s.status === "delayed";

    await prisma.incident.create({
      data: {
        incidentId: incId,
        shipmentId: s.id,
        type: isDelayed ? "delay" : "warehouse_congestion",
        severity: s.riskScore > 80 ? "critical" : s.riskScore > 40 ? "high" : "medium",
        status: "open",
        title: isDelayed
          ? `Shipment ${s.trackingId} delayed - SLA at risk`
          : `Shipment ${s.trackingId} processing delayed at warehouse`,
        description: isDelayed
          ? `Shipment has breached estimated delivery time. Current risk score: ${s.riskScore}`
          : `Warehouse congestion causing processing delays. Risk score: ${s.riskScore}`,
        riskScore: s.riskScore,
        isEscalated: s.riskScore > 80,
        escalatedAt: s.riskScore > 80 ? new Date() : undefined,
      },
    });
    incidentCount++;
  }
  console.log(`+ ${incidentCount} incidents created`);

  // create sample logs
  const logEntries = [
    { logId: "log-001", eventType: "shipment.created", source: "shipment-service", severity: "low", message: "New shipment created and queued for pickup" },
    { logId: "log-002", eventType: "shipment.picked_up", source: "carrier-integration", severity: "low", message: "Shipment picked up by carrier DXP" },
    { logId: "log-003", eventType: "eta.deviation", source: "tracking-engine", severity: "medium", message: "ETA deviation detected: +4h on Mumbai-Bangalore corridor" },
    { logId: "log-004", eventType: "warehouse.congestion", source: "warehouse-monitor", severity: "high", message: "Mumbai Central warehouse utilization at 87% - congestion alert" },
    { logId: "log-005", eventType: "carrier.degradation", source: "carrier-monitor", severity: "high", message: "Carrier SFX on-time rate dropped below 80% threshold" },
    { logId: "log-006", eventType: "sla.breach", source: "sla-monitor", severity: "critical", message: "SLA breached for shipment - delivery overdue by 6 hours" },
    { logId: "log-007", eventType: "agent.decision", source: "agent-engine", severity: "medium", message: "Agent recommended rerouting via alternate carrier DXP" },
    { logId: "log-008", eventType: "inventory.low", source: "inventory-service", severity: "medium", message: "SKU ELEC-PHONE-001 below reorder point at Kolkata East" },
    { logId: "log-009", eventType: "shipment.delivered", source: "delivery-service", severity: "low", message: "Shipment delivered successfully - 1h ahead of schedule" },
    { logId: "log-010", eventType: "agent.escalation", source: "agent-engine", severity: "high", message: "Agent escalated incident to human operator - confidence below threshold" },
  ];

  for (let i = 0; i < logEntries.length; i++) {
    const entry = logEntries[i];
    await prisma.log.upsert({
      where: { logId: entry.logId },
      update: {},
      create: {
        ...entry,
        timestamp: new Date(Date.now() - (logEntries.length - i) * 15 * 60 * 1000),
      },
    });
  }
  console.log(`+ ${logEntries.length} log entries created`);

  // create sample agent actions for learn loop
  const agentActions = [
    {
      actionId: "act-001",
      actionType: "reroute",
      targetType: "shipment",
      targetId: allShipments[0]?.id || "unknown",
      description: "Rerouted shipment from carrier EKL to DXP due to vehicle breakdown",
      reasoning: "Carrier EKL reliability score dropped to 71. Alternative carrier DXP has 94.2% on-time rate in this corridor.",
      confidence: 0.87,
      outcome: "pending",
      requiredHuman: false,
    },
    {
      actionId: "act-002",
      actionType: "escalate",
      targetType: "incident",
      targetId: "manual",
      description: "Escalated SLA breach to operations manager for approval",
      reasoning: "Risk score 91 exceeds autonomous action threshold of 85. Multiple cascading factors detected.",
      confidence: 0.62,
      outcome: "awaiting_approval",
      requiredHuman: true,
    },
    {
      actionId: "act-003",
      actionType: "reprioritize",
      targetType: "shipment",
      targetId: allShipments[1]?.id || "unknown",
      description: "Elevated shipment priority to urgent based on SLA proximity",
      reasoning: "Shipment within 6h of SLA deadline with 45% risk score. Warehouse processing elevated.",
      confidence: 0.91,
      outcome: "executed",
      wasCorrect: true,
      requiredHuman: false,
    },
  ];

  for (const action of agentActions) {
    await prisma.agentAction.upsert({
      where: { actionId: action.actionId },
      update: {},
      create: action,
    });
  }
  console.log(`+ ${agentActions.length} agent actions created`);

  console.log("\nSeeding complete!");
  console.log("\nLogin credentials:");
  console.log("  Ops Manager: admin@logistix.com / 12345678");
  console.log("  Consumer 1:  rahul@acmecorp.com / 12345678");
  console.log("  Consumer 2:  priya@globaltrade.in / 12345678");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
