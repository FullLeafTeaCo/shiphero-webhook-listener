import { createLogger } from "../logger.js";
import { processShipmentUpdateWebhook } from "../analytics.js";
import { normalizeShipmentUpdateForAnalytics } from "../helpers/normalize.js";
const log = createLogger("shipmentUpdate");

export async function handleShipmentUpdate(payload: any): Promise<void> {
  const {
    account_id,
    order_id,
    order_number,
    shipment_id,
    tracking_number,
    carrier,
    service,
    status,
    shipped_at,
    fulfillment_method, // This tells us if it's bulk ship vs single ship
    warehouse_id,
    warehouse_name,
  } = payload || {};

  log.info(
    {
      account_id,
      order_id,
      order_number,
      shipment_id,
      tracking_number,
      carrier,
      service,
      status,
      shipped_at,
      fulfillment_method,
      warehouse_id,
      warehouse_name,
      payloadKeys: Object.keys(payload || {}),
    },
    "🚚 Processing Shipment Update - Order Processed"
  );

  // DASHBOARD METRICS: Core "order processed" count
  // This is your single source of truth for processed orders
  log.info(
    {
      order_id,
      order_number,
      fulfillment_method,
      warehouse_name,
      shipped_at,
      status,
    },
    `✅ ORDER PROCESSED: ${order_number} via ${
      fulfillment_method || "unknown"
    } method (status: ${status || "unknown"})`
  );

  // Process webhook analytics for real-time counters (always process)
  try {
    const normalizedPayload = normalizeShipmentUpdateForAnalytics(payload);
    await processShipmentUpdateWebhook(normalizedPayload);
    log.info(
      { order_id, order_number },
      "📊 Updated shipment analytics counters"
    );
  } catch (analyticsError) {
    log.error(
      { order_id, order_number, error: analyticsError },
      "💥 Failed to update shipment analytics"
    );
  }

  // TODO: Re-enable Firebase analytics when needed
  // await markShipmentCompletedOnce({ shipmentId: shipment_id, completed: true });
  // await incrementProcessedForToday({ orderId: order_id, shippedAt: shipped_at, carrier, service });
}
