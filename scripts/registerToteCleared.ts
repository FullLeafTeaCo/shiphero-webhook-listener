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
const type = "Tote Cleared";

(async (): Promise<void> => {
  console.log(`🚀 Registering ${type} webhook to: ${webhookUrl}`);

  try {
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
})().catch((e: Error) => {
  console.error(e);
  process.exit(1);
});
