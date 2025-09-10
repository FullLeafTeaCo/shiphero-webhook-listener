import "dotenv/config";
import { listWebhooks } from "../src/shiphero.js";

(async (): Promise<void> => {
  try {
    const r = await listWebhooks();
    const webhooks = r.webhooks.data.edges;

    console.log(`Found ${webhooks.length} webhooks:`);
    webhooks.forEach((webhook, index) => {
      const w = webhook.node;
      console.log(`${index + 1}. ${w.name} - ${w.url} (ID: ${w.id})`);
    });
  } catch (error: any) {
    console.error("Error listing webhooks:", error.message);
  }
})();
