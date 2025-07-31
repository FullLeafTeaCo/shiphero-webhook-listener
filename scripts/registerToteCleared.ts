import "dotenv/config";
import { createWebhook } from "../src/shiphero.js";

const base: string | undefined = process.env.PUBLIC_BASE_URL;
if (!base) {
  throw new Error("PUBLIC_BASE_URL not set");
}

const webhookUrl = `${base}/webhooks/shiphero`;
const type = "Tote Cleared";

(async (): Promise<void> => {
  const r = await createWebhook({ url: webhookUrl, type });
  console.log("Created:", r.webhook_create.webhook);
})().catch((e: Error) => {
  console.error(e);
  process.exit(1);
}); 