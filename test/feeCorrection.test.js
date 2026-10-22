import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Ledgers go to a throwaway directory, never the real shipment history.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "oka-fees-"));
process.env.SHOPIFY_SHOP = "oka-test";
process.env.SHOPIFY_ACCESS_TOKEN = "shpat_test";

const { planFeeCorrection, applyFeeCorrection, correctFees } = await import("../src/services/feeCorrection.js");
const { append } = await import("../src/lib/ledger.js");

/** A Cairo order: net 349 is over the 300 threshold, so the fee should be 36. */
const order = (overrides = {}) => ({
  id: `gid://shopify/Order/${overrides.n ?? 1}`,
  name: `#26${overrides.n ?? 1}`,
  note: "",
  shippingAddress: {
    address1: "12 Street 9, Maadi",
    city: "Cairo",
    province: "Cairo",
    provinceCode: "C",
    phone: "01090599301",
  },
  subtotal: 349,
  netAmount: 349,
  shippingFee: 60,
  total: 409,
  currency: "EGP",
  trackingNumber: null,
  lineItems: [],
  ...overrides,
});

/**
 * Stubs Shopify's GraphQL endpoint, answering each operation by name and
 * recording the sequence, so a test can assert exactly what was sent.
 */
function stubShopify(handlers) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const { query, variables } = JSON.parse(init.body);
    const op = query.match(/(?:mutation|query)\s+(\w+)/)[1];
    calls.push({ op, variables });
    const data = (handlers[op] || (() => { throw new Error(`unexpected ${op}`); }))(variables);
    return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const happyPath = {
  BeginFeeEdit: () => ({
    orderEditBegin: {
      calculatedOrder: {
        id: "gid://shopify/CalculatedOrder/9",
        shippingLines: [
          { id: "gid://shopify/CalculatedShippingLine/5", title: "Cairo and Alexandria", stagedStatus: "NONE", price: { shopMoney: { amount: "60.0", currencyCode: "EGP" } } },
        ],
      },
      userErrors: [],
    },
  }),
  RemoveOldFee: () => ({ orderEditRemoveShippingLine: { calculatedOrder: { id: "gid://shopify/CalculatedOrder/9" }, userErrors: [] } }),
  AddNewFee: () => ({ orderEditAddShippingLine: { calculatedOrder: { id: "gid://shopify/CalculatedOrder/9", totalPriceSet: { shopMoney: { amount: "385.0" } } }, userErrors: [] } }),
  CommitFeeEdit: () => ({ orderEditCommit: { order: { id: "gid://shopify/Order/1", currentTotalPriceSet: { shopMoney: { amount: "385.0" } } }, userErrors: [] } }),
  SetNote: () => ({ orderUpdate: { order: { id: "gid://shopify/Order/1", note: "x" }, userErrors: [] } }),
};

test("plan: a fee that disagrees with the zone table is flagged with its direction", () => {
  const plan = planFeeCorrection(order());
  assert.equal(plan.status, "fix");
  assert.equal(plan.currentFee, 60);
  assert.equal(plan.expectedFee, 36);
  assert.equal(plan.delta, -24);
  assert.equal(plan.direction, "decrease");
  assert.equal(plan.newTotal, 385);
});

test("plan: an increase is labelled, since the customer pays more at the door", () => {
  // Net 200 is under the threshold, so Cairo should be 60, not 36.
  const plan = planFeeCorrection(order({ subtotal: 200, netAmount: 200, shippingFee: 36, total: 236 }));
  assert.equal(plan.direction, "increase");
  assert.equal(plan.delta, 24);
});

test("plan: a correct fee needs nothing", () => {
  assert.equal(planFeeCorrection(order({ shippingFee: 36, total: 385 })).status, "ok");
});

test("plan: refuses when the order already has an AWB — Bosta's COD would disagree", () => {
  const plan = planFeeCorrection(order({ trackingNumber: "2537186873" }));
  assert.equal(plan.status, "blocked");
  assert.match(plan.reason, /COD on Bosta/);
});

test("plan: refuses when the AWB is only known from the shipment ledger", () => {
  append("shipments", { orderId: "gid://shopify/Order/77", trackingNumber: "999", dryRun: false });
  assert.equal(planFeeCorrection(order({ n: 77 })).status, "blocked");
});

test("plan: refuses while the province contradicts the city, since the fee depends on it", () => {
  const plan = planFeeCorrection(order({ shippingAddress: { ...order().shippingAddress, city: "الغربية" } }));
  assert.equal(plan.status, "blocked");
  assert.match(plan.reason, /province/);
});

test("apply: dry run makes no Shopify call at all", async () => {
  const stub = stubShopify({});
  try {
    const result = await applyFeeCorrection(order(), { dryRun: true });
    assert.equal(stub.calls.length, 0);
    assert.equal(result.applied, false);
    assert.equal(result.expectedFee, 36);
  } finally {
    stub.restore();
  }
});

test("apply: begin -> remove old line -> add new line -> commit, with the zone fee", async () => {
  const stub = stubShopify(happyPath);
  try {
    const result = await applyFeeCorrection(order(), { dryRun: false });
    assert.equal(result.applied, true);
    assert.equal(result.newTotal, 385);

    assert.deepEqual(stub.calls.map((c) => c.op), ["BeginFeeEdit", "RemoveOldFee", "AddNewFee", "CommitFeeEdit", "SetNote"]);

    const remove = stub.calls[1].variables;
    assert.equal(remove.id, "gid://shopify/CalculatedOrder/9");
    assert.equal(remove.shippingLineId, "gid://shopify/CalculatedShippingLine/5");

    const add = stub.calls[2].variables;
    assert.equal(add.id, "gid://shopify/CalculatedOrder/9");
    assert.deepEqual(add.shippingLine.price, { amount: "36", currencyCode: "EGP" });
    // The original title is kept, so the customer's shipping method is unchanged.
    assert.equal(add.shippingLine.title, "Cairo and Alexandria");

    // Never the in-place update: Shopify only allows it on newly added lines.
    assert.ok(!stub.calls.some((c) => /UpdateShippingLine/.test(c.op)));
  } finally {
    stub.restore();
  }
});

test("apply: if adding the new line fails, nothing commits — no order left without shipping", async () => {
  const stub = stubShopify({
    ...happyPath,
    AddNewFee: () => ({ orderEditAddShippingLine: { calculatedOrder: null, userErrors: [{ field: ["price"], message: "is invalid" }] } }),
  });
  try {
    await assert.rejects(() => applyFeeCorrection(order(), { dryRun: false }), /orderEditAddShippingLine failed/);
    assert.ok(stub.calls.some((c) => c.op === "RemoveOldFee"), "the removal was staged");
    assert.ok(!stub.calls.some((c) => c.op === "CommitFeeEdit"), "must not commit after a failed update");
  } finally {
    stub.restore();
  }
});

test("apply: refuses to guess between several shipping lines", async () => {
  const twoLines = {
    ...happyPath,
    BeginFeeEdit: () => {
      const data = happyPath.BeginFeeEdit();
      const line = data.orderEditBegin.calculatedOrder.shippingLines[0];
      data.orderEditBegin.calculatedOrder.shippingLines = [line, { ...line, id: "gid://shopify/CalculatedShippingLine/6" }];
      return data;
    },
  };
  const stub = stubShopify(twoLines);
  try {
    const result = await applyFeeCorrection(order(), { dryRun: false });
    assert.equal(result.applied, false);
    assert.match(result.reason, /2 shipping lines/);
    assert.deepEqual(stub.calls.map((c) => c.op), ["BeginFeeEdit"]);
  } finally {
    stub.restore();
  }
});

test("batch dry run: summary reports the net change to COD and sends nothing", async () => {
  const stub = stubShopify({});
  try {
    const report = await correctFees(
      [order({ n: 2 }), order({ n: 3 }), order({ n: 4, shippingFee: 36, total: 385 })],
      { dryRun: true },
    );
    assert.equal(report.summary.toFix, 2);
    assert.equal(report.summary.alreadyCorrect, 1);
    assert.equal(report.summary.netDelta, -48);
    assert.equal(report.summary.decreases, 2);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test("batch commit: one order failing does not stop the others", async () => {
  const stub = stubShopify({
    ...happyPath,
    BeginFeeEdit: (v) =>
      v.id.endsWith("/3")
        ? { orderEditBegin: { calculatedOrder: null, userErrors: [{ field: ["id"], message: "Order is archived" }] } }
        : happyPath.BeginFeeEdit(),
  });
  try {
    const report = await correctFees([order({ n: 2 }), order({ n: 3 }), order({ n: 5 })], { dryRun: false });
    assert.equal(report.summary.applied, 2);
    assert.equal(report.summary.failed, 1);
    const failed = report.results.find((r) => r.status === "failed");
    assert.equal(failed.orderName, "#263");
    assert.match(failed.reason, /archived/);
  } finally {
    stub.restore();
  }
});
