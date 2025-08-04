import dotenv from "dotenv";
import { findProductBySku } from "../src/shopify.js";

dotenv.config();

async function testProductSearch(): Promise<void> {
  console.log("🔍 Testing Shopify Product Search by SKU...\n");

  // Test SKUs - you can modify these or add real SKUs from your Shopify store
  const testSkus = [
    "SE2oz",      // From your test data
    // Add real SKUs from your Shopify store here to test
    // "REAL-SKU-FROM-SHOPIFY",
  ];

  for (const sku of testSkus) {
    console.log(`🔎 Searching for SKU: "${sku}"`);
    
    try {
      const product = await findProductBySku(sku);
      
      if (product) {
        console.log("✅ Product found!");
        console.log({
          id: product.id,
          displayName: product.displayName,
          title: product.title,
          sku: product.sku,
          inventoryQuantity: product.inventoryQuantity
        });
      } else {
        console.log("❌ Product not found");
      }
    } catch (error: any) {
      console.error("💥 Error searching for product:", error.message);
    }
    
    console.log("─".repeat(50));
  }
}

// Run the test
testProductSearch()
  .then(() => {
    console.log("\n🎉 Test completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Test failed:", error);
    process.exit(1);
  });