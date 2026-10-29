import type { ServiceStatus } from "@prisma/client";

export type ServiceKey =
  | "data"
  | "airtime"
  | "cable"
  | "electricity"
  | "data-card"
  | "bonus-to-wallet"
  | "recharge-to-cash"
  | "recharge-pin"
  | "education-pin"
  | "affiliate"
  | "referrals"
  | "more"
  | "cac"
  | "nin"
  | "bvn"
  | "crypto";

export type CatalogEntry = {
  key: ServiceKey;
  name: string;
  short: string;
  href: string;
  description: string;
  group: "core" | "growth" | "identity";
  icon: string;
  defaultStatus: ServiceStatus;
  /** What the account owner still has to supply/verify before this can go live. */
  requirement: string;
};

/**
 * Service catalogue. "PROVIDER_CONFIG_REQUIRED" is an honest state: the screen
 * exists, explains what is missing, and cannot place a transaction.
 */
export const SERVICE_CATALOG: CatalogEntry[] = [
  {
    key: "data",
    name: "Data",
    short: "Data",
    href: "/data",
    description: "MTN, Airtel, Glo and 9mobile data bundles.",
    group: "core",
    icon: "data",
    defaultStatus: "PROVIDER_CONFIG_REQUIRED",
    requirement:
      "Alrahuz base URL, API key and the confirmed data endpoint contract (plan identifiers + live prices).",
  },
  {
    key: "airtime",
    name: "Airtime",
    short: "Airtime",
    href: "/services/airtime",
    description: "Instant airtime top-up on all Nigerian networks.",
    group: "core",
    icon: "airtime",
    defaultStatus: "PROVIDER_CONFIG_REQUIRED",
    requirement:
      "A documented Alrahuz airtime endpoint. No airtime endpoint has been confirmed for this account.",
  },
  {
    key: "cable",
    name: "Cable TV",
    short: "Cable",
    href: "/services/cable",
    description: "DSTV, GOtv and Startimes subscriptions.",
    group: "core",
    icon: "cable",
    defaultStatus: "PROVIDER_CONFIG_REQUIRED",
    requirement: "A documented Alrahuz cable endpoint plus a supported smartcard validation route.",
  },
  {
    key: "electricity",
    name: "Electricity",
    short: "Power",
    href: "/services/electricity",
    description: "Prepaid and postpaid meter tokens.",
    group: "core",
    icon: "electricity",
    defaultStatus: "PROVIDER_CONFIG_REQUIRED",
    requirement: "A documented Alrahuz electricity endpoint and a meter validation route.",
  },
  {
    key: "data-card",
    name: "Data Card",
    short: "Data Card",
    href: "/services/data-card",
    description: "Physical and virtual data cards.",
    group: "growth",
    icon: "card",
    defaultStatus: "COMING_SOON",
    requirement: "Supplier agreement plus an inventory API. Nothing is sold until stock is real.",
  },
  {
    key: "bonus-to-wallet",
    name: "Bonus to Wallet",
    short: "Bonus",
    href: "/services/bonus-to-wallet",
    description: "Convert eligible airtime bonuses to wallet credit.",
    group: "growth",
    icon: "bonus",
    defaultStatus: "COMING_SOON",
    requirement: "A verified bonus conversion partner. No bonus balance is fabricated.",
  },
  {
    key: "recharge-to-cash",
    name: "Recharge to Cash",
    short: "Airtime 2 Cash",
    href: "/services/recharge-to-cash",
    description: "Turn unused airtime into wallet balance.",
    group: "growth",
    icon: "transfer",
    defaultStatus: "COMING_SOON",
    requirement: "A documented conversion partner, discount table and settlement process.",
  },
  {
    key: "recharge-pin",
    name: "Recharge PIN",
    short: "Recharge PIN",
    href: "/services/recharge-pin",
    description: "Airtime recharge PINs for retail resale.",
    group: "growth",
    icon: "pin",
    defaultStatus: "COMING_SOON",
    requirement: "A PIN-issuing provider endpoint. PINs are never generated locally.",
  },
  {
    key: "education-pin",
    name: "Education PIN",
    short: "Education",
    href: "/services/education-pin",
    description: "WAEC, NECO and JAMB result-checker PINs.",
    group: "growth",
    icon: "education",
    defaultStatus: "COMING_SOON",
    requirement: "An authorised result-checker PIN reseller account.",
  },
  {
    key: "affiliate",
    name: "Affiliate Website",
    short: "Affiliate",
    href: "/services/affiliate",
    description: "Resell DP Data Sub services from your own page.",
    group: "growth",
    icon: "globe",
    defaultStatus: "COMING_SOON",
    requirement: "Commission rules, payout policy and abuse controls before any affiliate link goes live.",
  },
  {
    key: "referrals",
    name: "My Referrals",
    short: "Referrals",
    href: "/referrals",
    description: "Share your code and track qualified referrals.",
    group: "growth",
    icon: "referrals",
    defaultStatus: "ENABLED",
    requirement: "Reward amount must be configured; bonuses only pay on a verified qualifying event.",
  },
  {
    key: "more",
    name: "More Services",
    short: "More",
    href: "/services",
    description: "Everything else DP Data Sub is working on.",
    group: "growth",
    icon: "more",
    defaultStatus: "ENABLED",
    requirement: "Nothing — this is the service directory.",
  },
  {
    key: "cac",
    name: "CAC Services",
    short: "CAC",
    href: "/services/cac",
    description: "Business name and company registration support.",
    group: "identity",
    icon: "cac",
    defaultStatus: "COMING_SOON",
    requirement: "An accredited CAC agent agreement. No identity documents are collected before that.",
  },
  {
    key: "nin",
    name: "NIN Services",
    short: "NIN",
    href: "/services/nin",
    description: "NIN verification and slip services.",
    group: "identity",
    icon: "nin",
    defaultStatus: "COMING_SOON",
    requirement: "NDPR-compliant licensing and a lawful verification provider. No NIN data is collected today.",
  },
  {
    key: "bvn",
    name: "BVN Services",
    short: "BVN",
    href: "/services/bvn",
    description: "BVN identity checks for verified businesses.",
    group: "identity",
    icon: "bvn",
    defaultStatus: "COMING_SOON",
    requirement: "CBN/NDPR-compliant licensing and a lawful verification provider. No BVN data is collected today.",
  },
  {
    key: "crypto",
    name: "Crypto Services",
    short: "Crypto",
    href: "/services/crypto",
    description: "Crypto-to-naira settlement where regulation allows.",
    group: "identity",
    icon: "crypto",
    defaultStatus: "COMING_SOON",
    requirement: "A regulated, licensed on/off-ramp partner. DP Data Sub never asks for seed phrases or private keys.",
  },
];

export function catalogEntry(key: string): CatalogEntry | undefined {
  return SERVICE_CATALOG.find((entry) => entry.key === key);
}

export type ServiceState = CatalogEntry & { status: ServiceStatus };

/** DB-backed statuses with catalogue defaults as the fallback. */
export async function getServiceStates(
  rows: Array<{ key: string; status: ServiceStatus }>,
): Promise<ServiceState[]> {
  const map = new Map(rows.map((row) => [row.key, row.status]));
  return SERVICE_CATALOG.map((entry) => ({ ...entry, status: map.get(entry.key) ?? entry.defaultStatus }));
}
