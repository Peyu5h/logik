import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("seeding database...");

  // users
  const adminPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@logistix.com" },
    update: { password: adminPassword, role: "admin", name: "Ops Manager" },
    create: {
      email: "admin@logistix.com",
      password: adminPassword,
      name: "Ops Manager",
      role: "admin",
    },
  });
  console.log("+ admin user:", admin.email);

  const userPassword = await bcrypt.hash("user123", 10);

  // primary consumer - mihirgrand@yahoo.com
  const consumer1 = await prisma.user.upsert({
    where: { email: "mihirgrand@yahoo.com" },
    update: { password: userPassword, role: "consumer", name: "Mihir" },
    create: {
      email: "mihirgrand@yahoo.com",
      password: userPassword,
      name: "Mihir",
      role: "consumer",
    },
  });

  // also link by known id if it already exists in db
  try {
    await prisma.user.update({
      where: { id: "69ac991c0eeb0737ecff3419" },
      data: { email: "mihirgrand@yahoo.com", name: "Mihir", password: userPassword, role: "consumer" },
    });
  } catch {
    // user with that id may not exist yet, that's fine
  }

  // legacy aliases kept for backward compat
  const consumer1Legacy = await prisma.user.upsert({
    where: { email: "rahul@acmecorp.com" },
    update: { password: userPassword, role: "consumer", name: "Rahul Sharma" },
    create: {
      email: "rahul@acmecorp.com",
      password: userPassword,
      name: "Rahul Sharma",
      role: "consumer",
    },
  });

  const consumer2 = await prisma.user.upsert({
    where: { email: "priya@example.com" },
    update: { password: userPassword, role: "consumer" },
    create: {
      email: "priya@example.com",
      password: userPassword,
      name: "Priya Patel",
      role: "consumer",
    },
  });
  console.log("+ consumers: mihirgrand@yahoo.com (primary), rahul@acmecorp.com, priya@example.com");

  // carriers
  const carriers = [
    await prisma.carrier.upsert({
      where: { code: "DXP" },
      update: {},
      create: {
        name: "Delhivery Express",
        code: "DXP",
        reliabilityScore: 92,
        avgDeliveryTime: 48,
        activeShipments: 0,
        totalDeliveries: 2840,
        onTimeRate: 94,
        failureRate: 1.5,
        regions: ["north", "west", "central"],
        isActive: true,
      },
    }),
    await prisma.carrier.upsert({
      where: { code: "BFX" },
      update: {},
      create: {
        name: "BlueDart FastX",
        code: "BFX",
        reliabilityScore: 88,
        avgDeliveryTime: 36,
        activeShipments: 0,
        totalDeliveries: 4120,
        onTimeRate: 91,
        failureRate: 2.1,
        regions: ["north", "south", "west", "east"],
        isActive: true,
      },
    }),
    await prisma.carrier.upsert({
      where: { code: "EKL" },
      update: {},
      create: {
        name: "Ecom Kart Logistics",
        code: "EKL",
        reliabilityScore: 78,
        avgDeliveryTime: 60,
        activeShipments: 0,
        totalDeliveries: 1560,
        onTimeRate: 82,
        failureRate: 4.5,
        regions: ["south", "west"],
        isActive: true,
      },
    }),
    await prisma.carrier.upsert({
      where: { code: "SFX" },
      update: {},
      create: {
        name: "Shadowfax",
        code: "SFX",
        reliabilityScore: 85,
        avgDeliveryTime: 42,
        activeShipments: 0,
        totalDeliveries: 3200,
        onTimeRate: 89,
        failureRate: 2.8,
        regions: ["south", "east", "central"],
        isActive: true,
      },
    }),
    await prisma.carrier.upsert({
      where: { code: "XBS" },
      update: {},
      create: {
        name: "XpressBees",
        code: "XBS",
        reliabilityScore: 90,
        avgDeliveryTime: 44,
        activeShipments: 0,
        totalDeliveries: 5600,
        onTimeRate: 93,
        failureRate: 1.8,
        regions: ["north", "south", "west", "east", "central"],
        isActive: true,
      },
    }),
  ];
  console.log(`+ ${carriers.length} carriers`);

  // warehouses
  const warehouses = [
    await prisma.warehouse.upsert({
      where: { code: "DEL-N1" },
      update: {},
      create: {
        name: "Delhi North Hub",
        code: "DEL-N1",
        location: { lat: 28.6139, lng: 77.209, address: "Sector 18, Gurgaon", city: "Delhi NCR", region: "north" },
        capacity: 1200,
        currentLoad: 340,
        utilizationPct: 28.3,
        throughputRate: 150,
        status: "operational",
        congestionLevel: "low",
        avgProcessTime: 1.5,
        regions: ["north", "central"],
        isActive: true,
      },
    }),
    await prisma.warehouse.upsert({
      where: { code: "MUM-W1" },
      update: {},
      create: {
        name: "Mumbai Central Hub",
        code: "MUM-W1",
        location: { lat: 19.076, lng: 72.8777, address: "Bhiwandi, Thane", city: "Mumbai", region: "west" },
        capacity: 1500,
        currentLoad: 890,
        utilizationPct: 59.3,
        throughputRate: 180,
        status: "operational",
        congestionLevel: "moderate",
        avgProcessTime: 2.0,
        regions: ["west", "central"],
        isActive: true,
      },
    }),
    await prisma.warehouse.upsert({
      where: { code: "BLR-S1" },
      update: {},
      create: {
        name: "Bangalore South Hub",
        code: "BLR-S1",
        location: { lat: 12.9716, lng: 77.5946, address: "Electronic City", city: "Bangalore", region: "south" },
        capacity: 1000,
        currentLoad: 420,
        utilizationPct: 42.0,
        throughputRate: 120,
        status: "operational",
        congestionLevel: "low",
        avgProcessTime: 1.8,
        regions: ["south"],
        isActive: true,
      },
    }),
    await prisma.warehouse.upsert({
      where: { code: "KOL-E1" },
      update: {},
      create: {
        name: "Kolkata East Hub",
        code: "KOL-E1",
        location: { lat: 22.5726, lng: 88.3639, address: "Salt Lake Sector V", city: "Kolkata", region: "east" },
        capacity: 800,
        currentLoad: 560,
        utilizationPct: 70.0,
        throughputRate: 90,
        status: "operational",
        congestionLevel: "moderate",
        avgProcessTime: 2.5,
        regions: ["east"],
        isActive: true,
      },
    }),
    await prisma.warehouse.upsert({
      where: { code: "HYD-S2" },
      update: {},
      create: {
        name: "Hyderabad South Hub",
        code: "HYD-S2",
        location: { lat: 17.385, lng: 78.4867, address: "Shamshabad", city: "Hyderabad", region: "south" },
        capacity: 900,
        currentLoad: 310,
        utilizationPct: 34.4,
        throughputRate: 110,
        status: "operational",
        congestionLevel: "low",
        avgProcessTime: 1.6,
        regions: ["south", "central"],
        isActive: true,
      },
    }),
    await prisma.warehouse.upsert({
      where: { code: "GZB-N2" },
      update: {},
      create: {
        name: "Ghaziabad North Hub",
        code: "GZB-N2",
        location: { lat: 28.6692, lng: 77.4538, address: "Sahibabad Industrial Area", city: "Ghaziabad", region: "north" },
        capacity: 1000,
        currentLoad: 180,
        utilizationPct: 18.0,
        throughputRate: 130,
        status: "operational",
        congestionLevel: "low",
        avgProcessTime: 1.4,
        regions: ["north", "central"],
        isActive: true,
      },
    }),
  ];
  console.log(`+ ${warehouses.length} warehouses`);

  // inventory
  const skus = [
    { sku: "ELEC-001", name: "Wireless Earbuds" },
    { sku: "ELEC-002", name: "Phone Charger 65W" },
    { sku: "FASH-001", name: "Running Shoes" },
    { sku: "HOME-001", name: "LED Desk Lamp" },
    { sku: "HOME-002", name: "Water Purifier Filter" },
  ];

  for (const wh of warehouses) {
    for (const item of skus) {
      const qty = Math.floor(Math.random() * 80) + 20;
      const reserved = Math.floor(Math.random() * (qty / 3));
      await prisma.inventoryItem.upsert({
        where: { sku_warehouseId: { sku: item.sku, warehouseId: wh.id } },
        update: {},
        create: {
          sku: item.sku,
          name: item.name,
          quantity: qty,
          reserved,
          reorderPoint: 10,
          warehouseId: wh.id,
          lastRestocked: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        },
      });
    }
  }
  console.log("+ inventory items seeded");

  // clear existing shipments so we get clean caseIds
  await prisma.incident.deleteMany({});
  await prisma.chatHistory.deleteMany({});
  await prisma.shipment.deleteMany({});
  console.log("- cleared old shipments/incidents");

  // helpers
  function hoursFromNow(h: number): Date {
    return new Date(Date.now() + h * 60 * 60 * 1000);
  }

  // 3 predetermined demo shipments - all start as pending
  const now = new Date();

  // case 1: delhi to mumbai, high priority, high value electronics
  const shipment1 = await prisma.shipment.create({
    data: {
      caseId: 1,
      trackingId: "SHP-CASE001",
      consumerId: consumer1.id, // mihirgrand@yahoo.com
      status: "pending",
      priority: "high",
      origin: {
        lat: 28.6139,
        lng: 77.209,
        address: "Sector 18, Gurgaon",
        city: "Delhi NCR",
        region: "north",
      },
      destination: {
        lat: 19.076,
        lng: 72.8777,
        address: "42, Andheri East, SVP Nagar",
        city: "Mumbai",
        region: "west",
      },
      carrierId: carriers[0].id, // DXP
      warehouseId: warehouses[0].id, // DEL-N1
      initialEta: hoursFromNow(36),
      finalEta: hoursFromNow(36),
      estimatedDelivery: hoursFromNow(36),
      delay: 0,
      value: 45000.0,
      weight: 2.5,
      dimensions: { length: 30, width: 20, height: 15, unit: "cm" },
      routeHistory: [],
      routeWaypoints: [
        { warehouseCode: "DEL-N1", warehouseName: "Delhi North Hub", city: "Delhi NCR", region: "north", lat: 28.6139, lng: 77.209, order: 1, status: "pending" },
        { warehouseCode: "HYD-S2", warehouseName: "Hyderabad South Hub", city: "Hyderabad", region: "south", lat: 17.385, lng: 78.4867, order: 2, status: "pending" },
        { warehouseCode: "MUM-W1", warehouseName: "Mumbai Central Hub", city: "Mumbai", region: "west", lat: 19.076, lng: 72.8777, order: 3, status: "pending" },
      ],
      slaDeadline: hoursFromNow(48),
      slaBreached: false,
      rerouted: false,
      escalated: false,
      riskScore: 0,
      deliveryAddress: "42, Andheri East, SVP Nagar, Mumbai, Maharashtra 400069",
      recipientName: "Mihir",
      recipientPhone: "+91 98765 43210",
    },
  });
  console.log("+ shipment case 1:", shipment1.trackingId);

  // case 2: mumbai to bangalore, urgent priority, fragile/expensive
  const shipment2 = await prisma.shipment.create({
    data: {
      caseId: 2,
      trackingId: "SHP-CASE002",
      consumerId: consumer1.id, // mihirgrand@yahoo.com
      status: "pending",
      priority: "urgent",
      origin: {
        lat: 19.076,
        lng: 72.8777,
        address: "Bhiwandi, Thane",
        city: "Mumbai",
        region: "west",
      },
      destination: {
        lat: 12.9716,
        lng: 77.5946,
        address: "123, HSR Layout, Sector 7",
        city: "Bangalore",
        region: "south",
      },
      carrierId: carriers[1].id, // BFX
      warehouseId: warehouses[1].id, // MUM-W1
      initialEta: hoursFromNow(28),
      finalEta: hoursFromNow(28),
      estimatedDelivery: hoursFromNow(28),
      delay: 0,
      value: 125000.0,
      weight: 8.2,
      dimensions: { length: 60, width: 40, height: 30, unit: "cm" },
      routeHistory: [],
      routeWaypoints: [
        { warehouseCode: "MUM-W1", warehouseName: "Mumbai Central Hub", city: "Mumbai", region: "west", lat: 19.076, lng: 72.8777, order: 1, status: "pending" },
        { warehouseCode: "HYD-S2", warehouseName: "Hyderabad South Hub", city: "Hyderabad", region: "south", lat: 17.385, lng: 78.4867, order: 2, status: "pending" },
        { warehouseCode: "BLR-S1", warehouseName: "Bangalore South Hub", city: "Bangalore", region: "south", lat: 12.9716, lng: 77.5946, order: 3, status: "pending" },
      ],
      slaDeadline: hoursFromNow(36),
      slaBreached: false,
      rerouted: false,
      escalated: false,
      riskScore: 0,
      deliveryAddress: "123, HSR Layout, Sector 7, Bangalore, Karnataka 560102",
      recipientName: "Mihir",
      recipientPhone: "+91 98765 43210",
    },
  });
  console.log("+ shipment case 2:", shipment2.trackingId);

  // case 3: kolkata to delhi, medium priority, standard package
  const shipment3 = await prisma.shipment.create({
    data: {
      caseId: 3,
      trackingId: "SHP-CASE003",
      consumerId: consumer1.id, // mihirgrand@yahoo.com - all demo shipments assigned to primary user
      status: "pending",
      priority: "medium",
      origin: {
        lat: 22.5726,
        lng: 88.3639,
        address: "Park Street, Kolkata",
        city: "Kolkata",
        region: "east",
      },
      destination: {
        lat: 28.6139,
        lng: 77.209,
        address: "B-204, Connaught Place",
        city: "Delhi NCR",
        region: "north",
      },
      carrierId: carriers[3].id, // SFX
      warehouseId: warehouses[3].id, // KOL-E1
      initialEta: hoursFromNow(52),
      finalEta: hoursFromNow(52),
      estimatedDelivery: hoursFromNow(52),
      delay: 0,
      value: 8500.0,
      weight: 1.2,
      dimensions: { length: 25, width: 15, height: 10, unit: "cm" },
      routeHistory: [],
      routeWaypoints: [
        { warehouseCode: "KOL-E1", warehouseName: "Kolkata East Hub", city: "Kolkata", region: "east", lat: 22.5726, lng: 88.3639, order: 1, status: "pending" },
        { warehouseCode: "HYD-S2", warehouseName: "Hyderabad South Hub", city: "Hyderabad", region: "south", lat: 17.385, lng: 78.4867, order: 2, status: "pending" },
        { warehouseCode: "DEL-N1", warehouseName: "Delhi North Hub", city: "Delhi NCR", region: "north", lat: 28.6139, lng: 77.209, order: 3, status: "pending" },
      ],
      slaDeadline: hoursFromNow(72),
      slaBreached: false,
      rerouted: false,
      escalated: false,
      riskScore: 0,
      deliveryAddress: "B-204, Connaught Place, New Delhi, Delhi 110001",
      recipientName: "Mihir",
      recipientPhone: "+91 98765 43210",
    },
  });
  console.log("+ shipment case 3:", shipment3.trackingId);

  // seed some initial logs
  const logEntries = [
    { logId: "log-seed-001", eventType: "system_start", source: "platform", severity: "low", message: "Logistics platform initialized. 3 demo shipments ready." },
    { logId: "log-seed-002", eventType: "shipment_created", source: "shipment_service", severity: "low", message: `Case 1 created: ${shipment1.trackingId} Delhi->Mumbai (INR 45,000)` },
    { logId: "log-seed-003", eventType: "shipment_created", source: "shipment_service", severity: "low", message: `Case 2 created: ${shipment2.trackingId} Mumbai->Bangalore (INR 1,25,000)` },
    { logId: "log-seed-004", eventType: "shipment_created", source: "shipment_service", severity: "low", message: `Case 3 created: ${shipment3.trackingId} Kolkata->Delhi (INR 8,500)` },
    { logId: "log-seed-005", eventType: "carrier_assigned", source: "carrier_gateway", severity: "low", message: `DXP assigned to Case 1, BFX assigned to Case 2, SFX assigned to Case 3` },
  ];

  for (const entry of logEntries) {
    await prisma.log.upsert({
      where: { logId: entry.logId },
      update: {},
      create: { ...entry, timestamp: new Date() },
    });
  }
  console.log(`+ ${logEntries.length} seed logs`);

  // seed agent actions
  const agentActions = [
    {
      actionId: "act-seed-001",
      actionType: "observe",
      targetType: "system",
      targetId: "all",
      description: "Initial system observation - all shipments pending",
      reasoning: "System startup check, verifying all 3 demo shipments are in pending state",
      confidence: 1.0,
      outcome: "success",
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
  console.log(`+ ${agentActions.length} agent actions`);

  // link all demo shipments to mihirgrand@yahoo.com by id if that user exists
  try {
    const mihir = await prisma.user.findUnique({ where: { email: "mihirgrand@yahoo.com" } });
    if (mihir) {
      await prisma.shipment.updateMany({
        where: { caseId: { in: [1, 2, 3] } },
        data: { consumerId: mihir.id },
      });
      console.log(`+ linked all 3 demo shipments to ${mihir.email} (${mihir.id})`);
    }
  } catch {
    // silent
  }

  console.log("\nseed complete.");
  console.log("demo shipments (multi-route, all assigned to mihirgrand@yahoo.com):");
  console.log("  case 1: SHP-CASE001 | Delhi -> Hyderabad -> Mumbai         | INR 45,000   | high   | carrier: DXP");
  console.log("  case 2: SHP-CASE002 | Mumbai -> Hyderabad -> Bangalore     | INR 1,25,000 | urgent | carrier: BFX");
  console.log("  case 3: SHP-CASE003 | Kolkata -> Hyderabad -> Delhi        | INR 8,500    | medium | carrier: SFX");
  console.log("\nlogin:");
  console.log("  admin:    admin@logistix.com / admin123");
  console.log("  consumer: mihirgrand@yahoo.com / user123 (primary - all shipments)");
  console.log("  consumer: rahul@acmecorp.com / user123 (legacy)");
  console.log("  consumer: priya@example.com / user123");
}

main()
  .catch((e) => {
    console.error("seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
