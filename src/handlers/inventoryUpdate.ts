import { createLogger } from "../logger.js";
import { getProductLocations } from "../shiphero.js";
import { findProductBySku } from "../shopify.js";
const log = createLogger("inventoryUpdate");

/**
 * Example payload fields commonly present in Inventory Update:
 * - sku, product_id
 * - per-warehouse totals: on_hand, allocated, sell_ahead, reserve, non_sellable
 */
export async function handleInventoryUpdate(payload: any): Promise<void> {
  const { account_id, inventory = [] } = payload || {};

  /*
  log.info({ 
    account_id, 
    inventoryCount: inventory.length 
  }, `📊 Inventory Update received for ${inventory.length} item(s)`);
  */

  // Process each inventory item
  inventory.forEach((item: any, index: number) => {
    const {
      sku,
      inventory: availableInventory,
      on_hand,
      backorder_quantity,
      sell_ahead,
      reserve,
      non_sellable,
      updated_warehouse
    } = item;

    // TODO: Add your business logic here for each inventory item
    // Examples:
    // - Update external inventory systems
    // - Sync with Shopify/other platforms
    // - Trigger reorder notifications
    // - Update inventory forecasting

    // Grab the SKU and try and query the shopify API for the product
    (async () => {
      try {
        const product = await findProductBySku(sku);
        
        if (product) {
          return product;
        } else {
          console.log("❌ Product (", sku, ") not found");
          return null;
        }
      } catch (error: any) {
        console.error("💥 Error searching for product:", error.message);
        return null;
      }
    })().then((product: any) => {
      if (product) {
        (async () => {
          try {
            const locations = await getProductLocations(sku);

            if (locations) {
              return locations;
            } else {
              return null;
            }
          } catch (error: any) {
            console.error("💥 Error getting product locations:", error.message);
            return null;
          }
        })().then((locations: any) => {
          if (locations) {
            const locationsList = locations.warehouse_products[0].locations.edges.map(edge => ({
              locationName: edge.node.location.name,
              quantity: edge.node.quantity,
            }));
            console.table([{
              "Item #": index + 1,
              "SKU": sku,
              "SHIPHERO Available": availableInventory,
              "SHOPIFY Qty": product.inventoryQuantity,
              "SHOPIFY ID": product.id,
              "SHOPIFY Name": product.displayName,
              "SHOPIFY Title": product.title,
              "LOCATION(S)": locationsList.map((location: any) => `${location.locationName} (${location.quantity})`).join(', ')
            }]);
          } else {
            console.table([{
              "Item #": index + 1,
              "SKU": sku,
              "SHIPHERO Available": availableInventory,
              "SHOPIFY Qty": "-",
              "SHOPIFY ID": "Not found",
              "SHOPIFY Name": "-",
              "SHOPIFY Title": "-",
              "LOCATION(S)": "-"
            }]);
          }
        });
      }
    });
  });
}
