// Seeds service availability, MTN SME reference plans and a first announcement.
// Run with: node prisma/seed.mjs   (after `prisma generate` / `db push`)
// Safe to run repeatedly: every write is an upsert.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SERVICES = [
  ["data", "Data", "PROVIDER_CONFIG_REQUIRED"],
  ["airtime", "Airtime", "PROVIDER_CONFIG_REQUIRED"],
  ["cable", "Cable TV", "PROVIDER_CONFIG_REQUIRED"],
  ["electricity", "Electricity", "PROVIDER_CONFIG_REQUIRED"],
  ["data-card", "Data Card", "COMING_SOON"],
  ["bonus-to-wallet", "Bonus to Wallet", "COMING_SOON"],
  ["recharge-to-cash", "Recharge to Cash", "COMING_SOON"],
  ["recharge-pin", "Recharge PIN", "COMING_SOON"],
  ["education-pin", "Education PIN", "COMING_SOON"],
  ["affiliate", "Affiliate Website", "COMING_SOON"],
  ["referrals", "My Referrals", "ENABLED"],
  ["more", "More Services", "ENABLED"],
  ["cac", "CAC Services", "COMING_SOON"],
  ["nin", "NIN Services", "COMING_SOON"],
  ["bvn", "BVN Services", "COMING_SOON"],
  ["crypto", "Crypto Services", "COMING_SOON"],
];

// Account-owner supplied MTN SME reference prices (naira). NOT live provider prices.
const MTN_SME = [
  ["500MB-4D", "500 MB", 512, "4–5 days", 240],
  ["500MB-7D", "500 MB", 512, "7 days", 270],
  ["1GB-7D", "1 GB", 1024, "7 days", 395],
  ["1GB-30D-A", "1 GB", 1024, "20–30 days", 450],
  ["1GB-30D-B", "1 GB", 1024, "21–30 days", 500],
  ["2GB-30D", "2 GB", 2048, "21–30 days", 800],
  ["3GB-30D", "3 GB", 3072, "21–30 days", 1100],
  ["5GB-30D", "5 GB", 5120, "21–30 days", 1600],
  ["10GB-30D", "10 GB (5 GB × 2)", 10240, "21–30 days", 3000],
  ["15GB-30D", "15 GB (5 GB × 3)", 15360, "21–30 days", 4500],
  ["20GB-30D", "20 GB (5 GB × 4)", 20480, "21–30 days", 6000],
];

async function main() {
  for (const [index, [key, name, status]] of SERVICES.entries()) {
    await prisma.serviceAvailability.upsert({
      where: { key },
      create: { key, name, status, sortOrder: index * 10 },
      update: { name, sortOrder: index * 10 },
    });
  }

  for (const [index, [slug, name, sizeMb, validity, naira]] of MTN_SME.entries()) {
    const planCode = `REF-MTN-SME-${slug}`;
    await prisma.dataPlan.upsert({
      where: { network_dataType_planCode: { network: "MTN", dataType: "SME", planCode } },
      create: {
        network: "MTN",
        dataType: "SME",
        planCode,
        name,
        sizeMb,
        validity,
        priceKobo: naira * 100,
        source: "REFERENCE",
        sortOrder: (index + 1) * 10,
      },
      update: { name, sizeMb, validity, priceKobo: naira * 100 },
    });
  }

  const existing = await prisma.announcement.findFirst({ where: { title: "Welcome to DP Data Sub" } });
  if (!existing) {
    await prisma.announcement.create({
      data: {
        title: "Welcome to DP Data Sub",
        body: "Your wallet is live. Data and airtime go on sale as soon as the provider integration is verified — we will announce it here.",
      },
    });
  }

  const counts = {
    services: await prisma.serviceAvailability.count(),
    plans: await prisma.dataPlan.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
