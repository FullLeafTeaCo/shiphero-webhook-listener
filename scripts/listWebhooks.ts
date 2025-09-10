import "dotenv/config";
import { listWebhooks } from "../src/shiphero.js";

(async (): Promise<void> => {
  try {
    const r = await listWebhooks();
    const webhooks = r.webhooks.data.edges;

    webhooks.forEach((webhook, index) => {
      const w = webhook.node;
      // Webhook details available but not logged
    });
  } catch (error: any) {
    console.error("Error listing webhooks:", error.message);
  }
})();
