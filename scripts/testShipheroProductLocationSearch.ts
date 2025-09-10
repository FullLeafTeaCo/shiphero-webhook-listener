import dotenv from "dotenv";
import { findProductBySku } from "../src/shopify.js";
import { getProductLocations } from "../src/shiphero.js";

dotenv.config();

async function testShipheroProductLocationSearch(): Promise<void> {
  console.log("🔍 Testing Shiphero Product Location Search by SKU...\n");

  // Test SKUs - you can modify these or add real SKUs from your Shopify store
  const testSkus = [
    "SE2oz",      // From your test data
    // Add real SKUs from your Shopify store here to test
    // "REAL-SKU-FROM-SHOPIFY",
  ];

  for (const sku of testSkus) {
    console.log(`🔎 Searching for SKU: "${sku}"`);
    
    try {
      const locations = await getProductLocations(sku);
      
      if (locations) {
        console.log(locations);
      } else {
        console.log("❌ Locations not found");
      }
    } catch (error: any) {
      console.error("💥 Error searching for locations:", error.message);
    }
    
    console.log("─".repeat(50));
  }
}

// Run the test
testShipheroProductLocationSearch()
  .then(() => {
    console.log("\n🎉 Test completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Test failed:", error);
    process.exit(1);
  });