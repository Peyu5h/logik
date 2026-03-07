import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // create admin user
  const adminPassword = await bcrypt.hash("12345678", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@gmail.com" },
    update: {
      password: adminPassword,
      role: "admin",
    },
    create: {
      email: "admin@gmail.com",
      password: adminPassword,
      name: "Admin User",
      role: "admin",
    },
  });
  console.log("✓ Admin user created:", admin.email);

  // create test user
  const userPassword = await bcrypt.hash("12345678", 10);
  const user = await prisma.user.upsert({
    where: { email: "mihirgrand@gmail.com" },
    update: {
      password: userPassword,
      role: "user",
    },
    create: {
      email: "mihirgrand@gmail.com",
      password: userPassword,
      name: "Test User",
      role: "user",
    },
  });
  console.log("✓ Test user created:", user.email);

  console.log("\nSeeding complete!");
  console.log("\nQuick login credentials:");
  console.log("  Admin: admin@gmail.com / 12345678");
  console.log("  User:  mihirgrand@gmail.com / 12345678");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
