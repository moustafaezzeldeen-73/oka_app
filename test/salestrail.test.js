import test from "node:test";
import assert from "node:assert/strict";

process.env.SALESTRAIL_API_KEY = "test-key";

const salestrail = await import("../src/lib/salestrail.js");

function stubFetch(rows) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
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

/**
 * The log is fetched one day at a time (multi-day ranges get truncated, and a
 * truncated log reports customers as never called when they were). That made a
 * lookup N round trips, repeated for every order a rep opened. Past days are
 * immutable, so they must only ever be fetched once.
 */
test("day fetches are cached, so repeat lookups do not re-hit the API", async () => {
  salestrail.clearCallCache();
  const stub = stubFetch([]);

  try {
    await salestrail.listCalls({ days: 7 });
    const firstPass = stub.calls;
    assert.equal(firstPass, 7, "first lookup fetches each day once");

    await salestrail.listCalls({ days: 7 });
    // Today's entry may legitimately re-fetch after its short TTL; the six
    // completed days must not.
    assert.ok(
      stub.calls - firstPass <= 1,
      `second lookup made ${stub.calls - firstPass} extra requests, expected at most 1 (today)`,
    );
  } finally {
    stub.restore();
  }
});

test("phone matching is format-insensitive across sources", async () => {
  salestrail.clearCallCache();
  // Salestrail logs +20…, Shopify often stores 01…; both must match.
  const stub = stubFetch([
    { id: "c1", number: "+201110727746", startTime: "2026-08-20T09:00:00Z", duration: 42, answered: true },
    { id: "c2", number: "+201000000000", startTime: "2026-08-20T09:05:00Z", duration: 10, answered: true },
  ]);

  try {
    const calls = await salestrail.callsForPhone("01110727746", { days: 1 });
    assert.equal(calls.length, 1, "matched exactly the one customer");
    assert.equal(calls[0].id, "c1");
  } finally {
    stub.restore();
  }
});

test("formatDuration renders the mm:ss the history rows show", () => {
  assert.equal(salestrail.formatDuration(42), "00:42");
  assert.equal(salestrail.formatDuration(72), "01:12");
  assert.equal(salestrail.formatDuration(0), "00:00");
});
