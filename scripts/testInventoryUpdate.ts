import fetch from "node-fetch";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL: string | undefined = process.env.PUBLIC_BASE_URL;
const WEBHOOK_SECRET: string | undefined = process.env.SHIPHERO_WEBHOOK_SECRET;

// Test payload using the REAL structure you received from ShipHero
const testPayload = {
  account_id: 82382,
  account_uuid: "QWNjb3VudDo4MjM4Mg==",
  webhook_type: "Inventory Update",
  inventory: [
    {
      sku: "TEST-SKU-123",
      inventory: "45",
      backorder_quantity: "0",
      on_hand: "50",
      virtual: false,
      sell_ahead: 0,
      qty_in_totes: 5,
      reserve: 0,
      updated_warehouse: {
        warehouse_id: 113290,
        warehouse_uuid: "V2FyZWhvdXNlOjExMzI5MA==",
        identifier: "Primary",
        inventory: "45",
        backorder_quantity: "0",
        on_hand: "50",
        sell_ahead: 0,
        qty_in_totes: 5,
        reserve: 0,
        non_sellable: 10,
      },
      non_sellable: 10,
    },
    {
      sku: "ANOTHER-SKU-456",
      inventory: "22",
      backorder_quantity: "0",
      on_hand: "25",
      virtual: false,
      sell_ahead: 3,
      qty_in_totes: 0,
      reserve: 0,
      updated_warehouse: {
        warehouse_id: 113290,
        warehouse_uuid: "V2FyZWhvdXNlOjExMzI5MA==",
        identifier: "Primary",
        inventory: "22",
        backorder_quantity: "0",
        on_hand: "25",
        sell_ahead: 3,
        qty_in_totes: 0,
        reserve: 0,
        non_sellable: 0,
      },
      non_sellable: 0,
    },
  ],
};

function createSignature(secret: string, body: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  return hmac.digest("base64");
}

async function testInventoryUpdate(): Promise<void> {
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
      // SUCCESS - check server logs for output
    } else {
      // FAILED - check server configuration
    }
  } catch (error: any) {
    console.error("\n💥 ERROR:", error.message);
  }
}

testInventoryUpdate();
