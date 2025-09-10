import crypto from "crypto";
import fetch from "node-fetch";
import "dotenv/config";

const secret: string | undefined = process.env.SHIPHERO_WEBHOOK_SECRET;
const url = `http://localhost:${process.env.PORT || 3000}/webhooks/shiphero`;

// Pick one:
// const webhook_type = "inventory_update";
const webhook_type = "Inventory Change";

const payload = {
  webhook_type,
  sku: "MATCHA-CLASSIC-30G",
  product_id: "prod_123",
  warehouse_id: "wh_1",
  quantity: -2,
  reason: "order_allocation",
  lot_id: "lot_2025_07_A",
  lot_expiration: "2026-01-31",
};

const raw = Buffer.from(JSON.stringify(payload));
const sig = crypto.createHmac("sha256", secret!).update(raw).digest("base64");

fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-shiphero-hmac-sha256": sig,
  },
  body: raw,
})
  .then((r) => r.text().then((t) => [r.status, t] as const))
  .then(([s, t]) => {
    // Response available but not logged
  })
  .catch(console.error);
