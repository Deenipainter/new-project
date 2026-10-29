// Executed logic check for pure helpers. Run: npx tsx scripts/logic-check.mts
// Covers money conversion, Nigerian phone normalisation, password rules,
// provider status normalisation and the seeded MTN SME reference plan set.
// Database-backed flows (ledger, orders, payments) are NOT covered here.

import assert from "node:assert/strict";

import { formatNaira, nairaToKobo, parseNairaInput } from "../src/lib/money.ts";
import { nameProblem, normalizePhone, passwordProblem } from "../src/lib/validation.ts";
import { normalizeStatus, parseSizeMb } from "../src/lib/providers/normalize.ts";
import {
  MTN_DATA_TYPES,
  MTN_SME_REFERENCE_PLANS,
  dataTypesFor,
  isKnownNetwork,
} from "../src/lib/reference-plans.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("money");
check("naira -> kobo is exact for whole and decimal naira", () => {
  assert.equal(nairaToKobo(240), 24000);
  assert.equal(nairaToKobo(1600.5), 160050);
  assert.equal(nairaToKobo(0.01), 1);
});
check("formats naira with the ₦ symbol", () => {
  assert.ok(formatNaira(24000).includes("240"));
  assert.ok(formatNaira(24000).startsWith("₦"));
});
check("parses messy amount input", () => {
  assert.equal(parseNairaInput("1,500"), 150000);
  assert.equal(parseNairaInput("₦1 500.50"), 150050);
  assert.equal(parseNairaInput(""), null);
  assert.equal(parseNairaInput("0"), null);
  assert.equal(parseNairaInput("abc"), null);
});

console.log("validation");
check("normalises the three Nigerian phone formats", () => {
  assert.equal(normalizePhone("08031234567"), "08031234567");
  assert.equal(normalizePhone("+2348031234567"), "08031234567");
  assert.equal(normalizePhone("2348031234567"), "08031234567");
  assert.equal(normalizePhone("0803 123 4567"), "08031234567");
});
check("rejects invalid phone numbers", () => {
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("06031234567"), null);
  assert.equal(normalizePhone(""), null);
});
check("password policy requires length, letter and number", () => {
  assert.equal(passwordProblem("short1"), "Password must be at least 8 characters.");
  assert.ok(passwordProblem("alllettersonly"));
  assert.ok(passwordProblem("12345678"));
  assert.equal(passwordProblem("goodpass1"), null);
});
check("name policy rejects digits and symbols", () => {
  assert.ok(nameProblem("A"));
  assert.ok(nameProblem("Ada 0kafor"));
  assert.equal(nameProblem("Ada Okafor"), null);
  assert.equal(nameProblem("Ngozi O'Brien-Cole"), null);
});

console.log("provider normalisation");
check("maps provider success variants", () => {
  for (const value of ["success", "SUCCESSFUL", "completed", "delivered", " done "]) {
    assert.equal(normalizeStatus(value), "successful");
  }
});
check("maps provider pending variants", () => {
  for (const value of ["processing", "pending", "in_progress", "initiated"]) {
    assert.equal(normalizeStatus(value), "processing");
  }
});
check("maps provider failure variants", () => {
  for (const value of ["failed", "error", "cancelled", "refunded"]) {
    assert.equal(normalizeStatus(value), "failed");
  }
});
check("unknown provider status never becomes success", () => {
  assert.equal(normalizeStatus("weird"), "unknown");
  assert.equal(normalizeStatus(undefined), "unknown");
  assert.equal(normalizeStatus(""), "unknown");
});
check("parses plan sizes", () => {
  assert.equal(parseSizeMb("1GB"), 1024);
  assert.equal(parseSizeMb("500 MB"), 500);
  assert.equal(parseSizeMb("1.5gb"), 1536);
  assert.equal(parseSizeMb("unlimited"), 0);
});

console.log("MTN reference catalogue");
check("MTN data types keep the exact requested order", () => {
  assert.deepEqual(
    [...MTN_DATA_TYPES],
    ["SME", "SME2", "CORPORATE GIFTING", "GIFTING", "DATA COUPONS", "DATA SHARE"],
  );
  assert.deepEqual([...dataTypesFor("MTN")], [...MTN_DATA_TYPES]);
  assert.deepEqual([...dataTypesFor("AIRTEL")], []);
});
check("all 11 supplied SME plans exist with distinct codes and preserved prices", () => {
  assert.equal(MTN_SME_REFERENCE_PLANS.length, 11);
  const codes = new Set(MTN_SME_REFERENCE_PLANS.map((plan) => plan.planCode));
  assert.equal(codes.size, 11);
  const expected: Array<[string, number]> = [
    ["500MB-4D", 24000],
    ["500MB-7D", 27000],
    ["1GB-7D", 39500],
    ["1GB-30D-A", 45000],
    ["1GB-30D-B", 50000],
    ["2GB-30D", 80000],
    ["3GB-30D", 110000],
    ["5GB-30D", 160000],
    ["10GB-30D", 300000],
    ["15GB-30D", 450000],
    ["20GB-30D", 600000],
  ];
  for (const [slug, priceKobo] of expected) {
    const plan = MTN_SME_REFERENCE_PLANS.find((row) => row.planCode === `REF-MTN-SME-${slug}`);
    assert.ok(plan, `missing plan ${slug}`);
    assert.equal(plan.priceKobo, priceKobo, `wrong price for ${slug}`);
  }
});
check("similarly sized plans stay distinct when price or validity differs", () => {
  const oneGb = MTN_SME_REFERENCE_PLANS.filter((plan) => plan.sizeMb === 1024);
  assert.equal(oneGb.length, 3);
  assert.equal(new Set(oneGb.map((plan) => plan.priceKobo)).size, 3);
  const halfGb = MTN_SME_REFERENCE_PLANS.filter((plan) => plan.sizeMb === 512);
  assert.equal(new Set(halfGb.map((plan) => plan.validity)).size, 2);
});
check("reference plans are labelled reference, never provider", () => {
  assert.ok(MTN_SME_REFERENCE_PLANS.every((plan) => plan.planCode.startsWith("REF-MTN-SME-")));
});
check("network whitelist is exact", () => {
  assert.equal(isKnownNetwork("MTN"), true);
  assert.equal(isKnownNetwork("mtn"), false);
  assert.equal(isKnownNetwork("AIRTEL"), true);
  assert.equal(isKnownNetwork("GLO"), true);
  assert.equal(isKnownNetwork("9MOBILE"), true);
  assert.equal(isKnownNetwork("SMILE"), false);
});

console.log(`\nAll ${passed} logic checks passed.`);
