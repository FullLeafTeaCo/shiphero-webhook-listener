import "dotenv/config";
import { deleteWebhook } from "../src/shiphero.js";

const type = "Inventory Change";

(async (): Promise<void> => {
  try {
    console.log(`🗑️  Deleting webhook: ${type}`);
    const r = await deleteWebhook({ name: type });
    console.log(`✅ Successfully deleted: ${type}`);
  } catch (error: any) {
    if (error.message.includes("Webhook not found")) {
      console.log(`⚠️  Webhook not found (may already be deleted): ${type}`);
    } else {
      console.error(`❌ Error deleting ${type}:`, error.message);
      throw error;
    }
  }
})().catch((e: Error) => {
  console.error(e);
  process.exit(1);
});
