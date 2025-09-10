import fetch from "node-fetch";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL: string | undefined = process.env.PUBLIC_BASE_URL;
const WEBHOOK_SECRET: string | undefined = process.env.SHIPHERO_WEBHOOK_SECRET;

if (!BASE_URL || !WEBHOOK_SECRET) {
  console.error("Missing PUBLIC_BASE_URL or SHIPHERO_WEBHOOK_SECRET in .env");
  process.exit(1);
}

const now = new Date().toISOString();
const testPayload = {
  webhook_type: "Tote Cleared",
  account_id: 1234,
  tote_id: 777,
  tote_name: "TOTE-TEST-1",
  cleared_by_user_id: 8001,
  cleared_by_name: "Test Picker",
  cleared_at: now,
  warehouse_id: 1,
  warehouse_name: "Test Warehouse",
  items_picked: 3,
  pick_time_seconds: 120,
};

function createSignature(secret: string, body: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  return hmac.digest("base64");
}

async function main(): Promise<void> {
  const body = JSON.stringify(testPayload);
  const signature = createSignature(WEBHOOK_SECRET!, body);

  const res = await fetch(`${BASE_URL}/webhooks/shiphero`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-shiphero-hmac-sha256": signature,
    },
    body,
  });
  // Response status available but not logged
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
