import "dotenv/config";
import { deleteWebhook } from "../src/shiphero.js";

const types: string[] = [
  "Inventory Change",
  //"Inventory Update",
  //"Tote Cleared",
  //"Order Packed Out",
  //"Shipment Update",
];

(async (): Promise<void> => {
  for (const type of types) {
    const r = await deleteWebhook({ name: type });
    console.log("Deleted:", type);
  }
})().catch((e: Error) => {
  console.error(e);
  process.exit(1);
}); 