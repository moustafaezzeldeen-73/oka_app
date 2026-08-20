import test from "node:test";
import assert from "node:assert/strict";

import { classify, isMobile, normalizeForBosta } from "../src/domain/phone.js";
import { bostaCityFor, resolveProvince, shippingFeeFor } from "../src/domain/zones.js";
import { classifyRisk, isCairoOrGiza, isPremiumArea } from "../src/domain/risk.js";
import { auditOrder, findDuplicateGroups } from "../src/domain/audit.js";
import { buildPackageDescription, buildShipmentSpec } from "../src/services/shipping.js";

test("phone: normalizes the faults Shopify actually produces", () => {
  assert.equal(normalizeForBosta("01090599301"), "01090599301");
  assert.equal(normalizeForBosta("1012970816"), "01012970816", "missing leading zero");
  assert.equal(normalizeForBosta("+201271500610"), "01271500610", "country code prefix");
  assert.equal(normalizeForBosta("0020 111 222 3344"), "01112223344");
  assert.equal(normalizeForBosta("mn6817588 @gmail.com"), null, "not phone-like at all");
});

test("phone: mobile vs landline vs garbage", () => {
  assert.equal(classify("01090599301"), "mobile");
  assert.equal(classify("0227548899"), "landline");
  assert.equal(classify("not a phone"), "unknown");
  assert.equal(isMobile("0227548899"), false);
});

test("zones: resolves Arabic and English city text to a province", () => {
  assert.equal(resolveProvince("الغربية").code, "GH");
  assert.equal(resolveProvince("الاسكندريه").code, "ALX", "folded ة/ه and dropped hamza");
  assert.equal(resolveProvince("الإسكندرية").code, "ALX");
  assert.equal(resolveProvince("6th of October").code, "SU", "longer alias beats 'october'");
  assert.equal(resolveProvince("Tanta").code, "GH");
  assert.equal(resolveProvince("C").code, "C", "province code passthrough");
  assert.equal(resolveProvince("Atlantis"), null, "no guessing");
});

test("zones: fee tier turns on the 300 EGP net threshold", () => {
  assert.equal(shippingFeeFor("Cairo", 350), 36);
  assert.equal(shippingFeeFor("Cairo", 299), 60);
  assert.equal(shippingFeeFor("Gharbia", 300), 46, "boundary is inclusive");
  assert.equal(shippingFeeFor("Aswan", 100), 80);
  assert.equal(bostaCityFor("6th of October"), "Giza", "Bosta buckets October under Giza");
});

test("risk: the worked examples from the classification spec", () => {
  const at = (ranking, cod, fee, extra = {}) =>
    classifyRisk({ ranking, codValue: cod, shippingFee: fee, rankingThreshold: 70, codFeeMultiplier: 2.0, ...extra }).result;

  assert.equal(at(80, 300, 46), "no_risk");
  assert.equal(at(72, 100, 80), "risk", "ranking clears but expected value does not");
  assert.equal(at(60, 1000, 36), "risk", "formula never reached below the threshold");
  assert.equal(at(null, 500, 60, { city: "Cairo" }), "no_risk", "home turf");
  assert.equal(at(null, 500, 60, { city: "Giza", district: "6th of October" }), "no_risk");
  assert.equal(at(null, 500, 60, { city: "Alexandria" }), "risk");
  assert.equal(
    at(null, 500, 60, { city: "Alexandria", address1: "Marassi villa 12" }),
    "no_risk",
    "premium area rescues an unranked non-Cairo order",
  );
});

test("risk: null ranking is 'no history', not zero", () => {
  const unranked = classifyRisk({ ranking: null, codValue: 1000, shippingFee: 36, city: "Cairo" });
  const zero = classifyRisk({ ranking: 0, codValue: 1000, shippingFee: 36, city: "Cairo" });
  assert.equal(unranked.result, "no_risk");
  assert.equal(zero.result, "risk", "an actual 0 ranking is the worst score, not a blank one");
});

const goodOrder = () => ({
  id: "gid://shopify/Order/1",
  name: "#2465421",
  createdAt: "2026-06-25T10:00:00Z",
  note: "",
  email: "customer@example.com",
  phone: "01090599301",
  customer: { id: "gid://shopify/Customer/1", firstName: "Mona", lastName: "Hassan", tags: [] },
  shippingAddress: {
    address1: "12 Street 9, Maadi",
    address2: "Apt 4",
    city: "Cairo",
    province: "Cairo",
    provinceCode: "C",
    phone: "01090599301",
    countryCodeV2: "EG",
  },
  subtotal: 349,
  total: 385,
  shippingFee: 36,
  netAmount: 349,
  lineItems: [
    { id: "li1", title: "Tangerine Mint Shisha 250g", quantity: 1, unitPrice: 250 },
    { id: "li2", title: "Coconara Coals 1kg", quantity: 1, unitPrice: 99 },
  ],
});

test("audit: a clean order is shippable", () => {
  const result = auditOrder(goodOrder());
  assert.equal(result.shippable, true);
  assert.equal(result.errorCount, 0);
});

test("audit: catches the city/province mismatch seen live", () => {
  const order = goodOrder();
  order.shippingAddress.city = "الغربية"; // Gharbia typed into a Cairo order
  const result = auditOrder(order);

  const mismatch = result.findings.find((f) => f.code === "city_province_mismatch");
  assert.ok(mismatch, "mismatch detected");
  assert.equal(mismatch.suggestedValue, "GH");
  assert.equal(mismatch.autoFixable, true);
  assert.equal(result.shippable, false, "wrong zone blocks shipping");
});

test("audit: catches a phone number in the city field", () => {
  const order = goodOrder();
  order.shippingAddress.city = "01159708270";
  const result = auditOrder(order);
  assert.ok(result.findings.some((f) => f.code === "phone_in_wrong_field"));
});

test("audit: flags a fee that disagrees with the zone table", () => {
  const order = goodOrder();
  order.shippingFee = 60; // Cairo at net 349 should be 36.
  const finding = auditOrder(order).findings.find((f) => f.code === "shipping_fee_mismatch");
  assert.ok(finding);
  assert.equal(finding.suggestedValue, 36);
});

test("audit: a missing phone blocks the order", () => {
  const order = goodOrder();
  order.shippingAddress.phone = "";
  order.phone = "";
  order.customer.phone = "";
  const result = auditOrder(order);
  assert.equal(result.shippable, false);
  assert.ok(result.findings.some((f) => f.code === "phone_missing"));
});

test("audit: duplicates group on phone or email, survivor is the biggest", () => {
  const small = { ...goodOrder(), id: "gid://shopify/Order/2", name: "#2465422", total: 200 };
  const groups = findDuplicateGroups([goodOrder(), small]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].survivor.name, "#2465421");
  assert.equal(groups[0].duplicates[0].name, "#2465422");
});

test("shipping: package description matches the warehouse format", () => {
  assert.equal(
    buildPackageDescription(goodOrder()),
    "Tangerine Mint Shisha 250g x1 @250 EGP; Coconara Coals 1kg x1 @99 EGP | Subtotal: 349 EGP | Shipping: 36 EGP",
  );
});

test("shipping: spec maps onto Bosta's fields, package stays sealed", () => {
  const spec = buildShipmentSpec(goodOrder());
  assert.equal(spec.city, "Cairo");
  assert.equal(spec.receiverPhone, "01090599301");
  assert.equal(spec.codAmount, 385, "COD is the order total, shipping included");
  assert.equal(spec.businessReference, "#2465421");
  assert.equal(spec.allowToOpenPackage, false);
  assert.equal(spec.itemsCount, 2);
});

test("shipping: an unmappable province refuses to build a spec", () => {
  const order = goodOrder();
  order.shippingAddress = { ...order.shippingAddress, city: "Atlantis", province: "", provinceCode: "" };
  assert.throws(() => buildShipmentSpec(order), /Bosta city/);
});

test("risk helpers: keyword matching is case-insensitive across fields", () => {
  assert.equal(isCairoOrGiza({ city: "GIZA" }), true);
  assert.equal(isCairoOrGiza({ city: "Alexandria", district: "Sheikh Zayed" }), true);
  assert.equal(isPremiumArea({ address1: "Villa 3, MIVIDA" }), true);
  assert.equal(isPremiumArea({ city: "Tanta" }), false);
});
