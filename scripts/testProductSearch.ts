import dotenv from "dotenv";
import { findProductBySku } from "../src/shopify.js";

dotenv.config();

async function testProductSearch(): Promise<void> {
  // Test SKUs - you can modify these or add real SKUs from your Shopify store
  const testSkus = [
    "SE2oz", // From your test data
    // Add real SKUs from your Shopify store here to test
    // "REAL-SKU-FROM-SHOPIFY",
  ];

  for (const sku of testSkus) {
    try {
      const product = await findProductBySku(sku);

      if (product) {
        // Product found - details available but not logged
      } else {
        console.log("❌ Product (", sku, ") not found");
      }
    } catch (error: any) {
      console.error("💥 Error searching for product:", error.message);
    }
  }
}

// Run the test
testProductSearch()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Test failed:", error);
    process.exit(1);
  });
