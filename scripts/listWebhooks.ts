import "dotenv/config";
import { listWebhooks } from "../src/shiphero.js";

(async (): Promise<void> => {
  try {
    const r = await listWebhooks();
    const webhooks = r.webhooks.data.edges;
    
    console.log(`\n📡 Found ${webhooks.length} registered webhooks:\n`);
    
    webhooks.forEach((webhook, index) => {
      const w = webhook.node;
      console.log(`${index + 1}. ${w.name}`);
      console.log(`   ID: ${w.id}`);
      console.log(`   URL: ${w.url}`);
      console.log(`   Source: ${w.source}`);
      console.log("");
    });
    
    if (webhooks.length === 0) {
      console.log("❌ No webhooks found! You may need to register them first.");
    }
  } catch (error: any) {
    console.error("Error listing webhooks:", error.message);
  }
})(); 