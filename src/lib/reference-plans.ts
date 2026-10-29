/**
 * MTN SME reference plans supplied by the account owner.
 *
 * These are USER-SUPPLIED REFERENCE PRICES, not live Alrahuz prices. They are
 * seeded with source = REFERENCE so the UI can label them honestly, and they
 * are never used to place a provider order until the provider's own plan IDs
 * and prices are confirmed and synced into DataPlan rows with source = PROVIDER.
 */

export type ReferencePlan = {
  network: string;
  dataType: string;
  planCode: string;
  name: string;
  sizeMb: number;
  validity: string;
  priceKobo: number;
  sortOrder: number;
};

function plan(
  slug: string,
  name: string,
  sizeMb: number,
  validity: string,
  naira: number,
  sortOrder: number,
): ReferencePlan {
  return {
    network: "MTN",
    dataType: "SME",
    planCode: `REF-MTN-SME-${slug}`,
    name,
    sizeMb,
    validity,
    priceKobo: naira * 100,
    sortOrder,
  };
}

export const MTN_SME_REFERENCE_PLANS: ReferencePlan[] = [
  plan("500MB-4D", "500 MB", 512, "4–5 days", 240, 10),
  plan("500MB-7D", "500 MB", 512, "7 days", 270, 20),
  plan("1GB-7D", "1 GB", 1024, "7 days", 395, 30),
  plan("1GB-30D-A", "1 GB", 1024, "20–30 days", 450, 40),
  plan("1GB-30D-B", "1 GB", 1024, "21–30 days", 500, 50),
  plan("2GB-30D", "2 GB", 2048, "21–30 days", 800, 60),
  plan("3GB-30D", "3 GB", 3072, "21–30 days", 1100, 70),
  plan("5GB-30D", "5 GB", 5120, "21–30 days", 1600, 80),
  plan("10GB-30D", "10 GB (5 GB × 2)", 10240, "21–30 days", 3000, 90),
  plan("15GB-30D", "15 GB (5 GB × 3)", 15360, "21–30 days", 4500, 100),
  plan("20GB-30D", "20 GB (5 GB × 4)", 20480, "21–30 days", 6000, 110),
];

export const NETWORKS = [
  { id: "MTN", name: "MTN", accent: "#FFCC00" },
  { id: "AIRTEL", name: "Airtel", accent: "#E40000" },
  { id: "GLO", name: "Glo", accent: "#00A651" },
  { id: "9MOBILE", name: "9mobile", accent: "#006B3F" },
] as const;

export type NetworkId = (typeof NETWORKS)[number]["id"];

/** Exact order requested for MTN data types. */
export const MTN_DATA_TYPES = [
  "SME",
  "SME2",
  "CORPORATE GIFTING",
  "GIFTING",
  "DATA COUPONS",
  "DATA SHARE",
] as const;

export function dataTypesFor(network: string): readonly string[] {
  return network === "MTN" ? MTN_DATA_TYPES : [];
}

export function isKnownNetwork(value: string): value is NetworkId {
  return NETWORKS.some((network) => network.id === value);
}
