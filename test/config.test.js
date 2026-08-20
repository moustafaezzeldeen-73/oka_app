import test from "node:test";
import assert from "node:assert/strict";

/**
 * /api/health is unauthenticated, so credentialStatus() must report only
 * whether a secret is present — never its value. This regression test exists
 * because an earlier edit accidentally spliced the raw config block into that
 * function, which would have published the Gemini and Shopify keys to anyone
 * who could reach the endpoint.
 */
test("credentialStatus never returns a secret's value", async () => {
  const secrets = {
    SHOPIFY_ACCESS_TOKEN: "shpat_do_not_leak_me",
    BOSTA_API_KEY: "bosta_do_not_leak_me",
    GEMINI_API_KEY: "gemini_do_not_leak_me",
    SALESTRAIL_API_KEY: "salestrail_do_not_leak_me",
  };
  Object.assign(process.env, secrets, { SHOPIFY_SHOP: "oka-test" });

  const { credentialStatus } = await import("../src/config.js");
  const serialized = JSON.stringify(credentialStatus());

  for (const [name, value] of Object.entries(secrets)) {
    assert.ok(!serialized.includes(value), `${name} value leaked into credentialStatus()`);
  }

  // It must still be useful: presence has to be reported accurately.
  const status = credentialStatus();
  assert.equal(status.shopify.configured, true);
  assert.equal(status.bosta.configured, true);
  assert.equal(status.gemini.configured, true);
  assert.deepEqual(status.shopify.missing, []);
});

test("credentialStatus names what is missing rather than failing silently", async () => {
  const { credentialStatus } = await import("../src/config.js");
  const status = credentialStatus();
  // Values were set by the test above; model metadata is safe to expose.
  assert.equal(typeof status.gemini.model, "string");
  assert.ok(Array.isArray(status.calls.missing));
});
