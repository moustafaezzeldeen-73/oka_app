import test from "node:test";
import assert from "node:assert/strict";

process.env.BOSTA_API_KEY = "test-key";

const { createDelivery, listCities } = await import("../src/lib/bosta.js");

/** Replaces global fetch with a counting stub for one test. */
function stubFetch(handler) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (...args) => {
    calls += 1;
    return handler(calls, ...args);
  };
  return {
    get calls() {
      return calls;
    },
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const serverError = () =>
  new Response(JSON.stringify({ message: "upstream boom" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });

const spec = {
  city: "Cairo",
  firstLine: "12 Street 9, Maadi",
  receiverFirstName: "Mona",
  receiverPhone: "01090599301",
  codAmount: 385,
  businessReference: "#2465421",
  packageDescription: "Test x1 @385 EGP | Subtotal: 349 EGP | Shipping: 36 EGP",
};

/**
 * The money bug. Bosta's POST /deliveries is not idempotent: if it creates the
 * shipment and the response times out or 5xxs, a retry books a SECOND real,
 * billable pickup. That is exactly the duplicate the shipment ledger exists to
 * prevent, so it must not be reintroduced at the HTTP layer.
 */
test("createDelivery is attempted exactly once, never retried", async () => {
  const stub = stubFetch(() => serverError());

  try {
    await assert.rejects(() => createDelivery(spec), /bosta responded 503/i);
    assert.equal(stub.calls, 1, `POST /deliveries was sent ${stub.calls} times — each one is a real shipment`);
  } finally {
    stub.restore();
  }
});

test("reads still retry, since a repeated GET is harmless", async () => {
  const stub = stubFetch(() => serverError());

  try {
    await assert.rejects(() => listCities());
    assert.ok(stub.calls > 1, "GET should retry on a 5xx");
  } finally {
    stub.restore();
  }
});

test("a dry run never reaches the network at all", async () => {
  const stub = stubFetch(() => {
    throw new Error("dry run must not call Bosta");
  });

  try {
    const result = await createDelivery(spec, { dryRun: true });
    assert.equal(stub.calls, 0);
    assert.equal(result.dryRun, true);
    // The payload is returned so a dry run shows exactly what would be sent.
    assert.equal(result.payload.cod, 385);
    assert.equal(result.payload.allowToOpenPackage, false);
  } finally {
    stub.restore();
  }
});
