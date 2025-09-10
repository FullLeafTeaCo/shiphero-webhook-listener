import "dotenv/config";
import { createWebhook } from "../src/shiphero.js";

// Check for --url parameter first, then fall back to environment variable
const urlArg = process.argv.find((arg) => arg.startsWith("--url="));
const providedUrl = urlArg ? urlArg.split("=")[1] : undefined;

const base: string | undefined = providedUrl || process.env.PUBLIC_BASE_URL;
if (!base) {
  throw new Error(
    "No URL provided. Use --url=https://your-url.com or set PUBLIC_BASE_URL environment variable"
  );
}

const webhookUrl = base.endsWith("/webhooks/shiphero")
  ? base
  : `${base}/webhooks/shiphero`;

const types: string[] = [
  //"Inventory Change",
  "Inventory Update",
  "Tote Cleared",
  "Order Packed Out",
  "Shipment Update",
  "Order Canceled", // Added for outstanding order tracking
];

(async (): Promise<void> => {
  console.log(`🚀 Registering webhooks to: ${webhookUrl}`);

  for (const type of types) {
    try {
      console.log(`📝 Registering: ${type}`);
      const r = await createWebhook({ url: webhookUrl, type });
      console.log(`✅ Successfully registered: ${type}`);
    } catch (error: any) {
      if (error.message.includes("Webhook already exists")) {
        console.log(`⚠️  Webhook already exists: ${type}`);
      } else {
        console.error(`❌ Error registering ${type}:`, error.message);
        throw error;
      }
    }
  }

  console.log("🎉 Webhook registration completed!");
})().catch((e: Error) => {
  console.error(e);
  process.exit(1);
});
