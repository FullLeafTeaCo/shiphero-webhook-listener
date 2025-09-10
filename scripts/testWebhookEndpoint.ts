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

// Test payload simulating a ShipHero Inventory Change webhook
const testPayload = {
  webhook_type: "Inventory Change",
  account_uuid: "QWNjb3VudDo2Mzg5OA==",
  account_id: 18963,
  warehouse_id: 76733,
  warehouse_uuid: "V2FyZWhvdXNlOjc2NzMz",
  user_id: 489254,
  user_uuid: "VXNlcjoxNTg4MjY=",
  sku: "TEST-SKU-123",
  quantity: 10,
  location_name: "AA-05-01-01",
  previous_on_hand: 100,
  timestamp: new Date().toISOString(),
  reason: "Test webhook from local script",
  source: "manual",
};

function createSignature(secret: string, body: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  return hmac.digest("base64");
}

async function testWebhook(): Promise<void> {
  const body = JSON.stringify(testPayload);
  const signature = createSignature(WEBHOOK_SECRET!, body);

  try {
    const response = await fetch(`${BASE_URL}/webhooks/shiphero`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shiphero-hmac-sha256": signature,
      },
      body: body,
    });

    const responseText = await response.text();

    if (response.status === 200) {
      // SUCCESS - webhook endpoint is working
    } else {
      // FAILED - check server configuration
    }
  } catch (error: any) {
    console.error("\n💥 ERROR:", error.message);
  }
}

testWebhook();
