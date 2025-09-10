import "dotenv/config";
import { createWebhook } from "../src/shiphero.js";

const base: string | undefined = process.env.PUBLIC_BASE_URL; // e.g. https://abc123.ngrok.io
if (!base) {
  throw new Error("PUBLIC_BASE_URL not set");
}

const webhookUrl = `${base}/webhooks/shiphero`;

const types: string[] = [
  "Inventory Change",
  "Inventory Update",
  "Tote Cleared",
  "Order Packed Out",
  "Shipment Update",
  "Order Canceled", // Added for outstanding order tracking
];

(async (): Promise<void> => {
  for (const type of types) {
    const r = await createWebhook({ url: webhookUrl, type });
  }
})().catch((e: Error) => {
  console.error(e);
  process.exit(1);
});
