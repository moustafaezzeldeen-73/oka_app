import express from "express";
import path from "node:path";
import { config, credentialStatus, ROOT } from "./config.js";
import { router } from "./routes/api.js";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use("/api", router);
app.use(express.static(path.join(ROOT, "public")));

app.listen(config.port, () => {
  const status = credentialStatus();
  console.log(`OKA Warehouse App listening on http://localhost:${config.port}`);
  console.log(
    `  Shopify: ${status.shopify.configured ? `connected (${status.shopify.shop}, ${status.shopify.apiVersion})` : `NOT CONFIGURED — missing ${status.shopify.missing.join(", ")}`}`,
  );
  console.log(
    `  Bosta:   ${status.bosta.configured ? `connected (${status.bosta.baseUrl})` : `NOT CONFIGURED — missing ${status.bosta.missing.join(", ")}`}`,
  );
  // The loudest line in the boot log, because the difference between these
  // two modes is real money.
  console.log(
    status.bosta.liveShipments
      ? "  LIVE SHIPMENTS ARE ENABLED — creating a delivery bills a real pickup."
      : "  Dry-run mode: shipments are simulated (set BOSTA_LIVE_SHIPMENTS=true to ship for real).",
  );
});
