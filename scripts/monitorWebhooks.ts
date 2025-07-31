import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL: string | undefined = process.env.PUBLIC_BASE_URL;

async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/healthz`);
    return response.ok;
  } catch {
    return false;
  }
}

async function monitor(): Promise<void> {
  console.log("🔍 Monitoring webhook system...\n");
  console.log(`📍 Endpoint: ${BASE_URL}/webhooks/shiphero`);
  console.log(`⏰ Started at: ${new Date().toLocaleString()}\n`);
  
  console.log("✅ System Status:");
  const isHealthy = await checkHealth();
  console.log(`   Server: ${isHealthy ? '🟢 Online' : '🔴 Offline'}`);
  console.log(`   Ngrok: ${BASE_URL ? '🟢 Configured' : '🔴 Missing'}`);
  
  console.log("\n📡 Registered Webhooks:");
  console.log("   • Inventory Change");
  console.log("   • Inventory Update"); 
  console.log("   • Tote Cleared");
  console.log("   • Order Packed Out");
  
  console.log("\n🎯 To test your connection:");
  console.log("   1. Run: npm run test:webhook");
  console.log("   2. In ShipHero: adjust inventory quantities");
  console.log("   3. In ShipHero: create/fulfill orders");
  console.log("   4. In ShipHero: use picking/packing workflows");
  
  console.log("\n👀 Watch your server logs for:");
  console.log("   🎣 Webhook received");
  console.log("   ✅ Webhook acknowledged"); 
  console.log("   🔄 Processing webhook");
  console.log("   ✅ Webhook processed successfully");
  
  console.log("\n💡 If no events appear:");
  console.log("   • Make sure you're making changes in ShipHero");
  console.log("   • Events only fire for REAL inventory changes");
  console.log("   • Check that your ShipHero account has inventory activity");
  console.log("   • Verify your .env has the correct SHIPHERO_GRAPHQL_TOKEN");
}

monitor(); 