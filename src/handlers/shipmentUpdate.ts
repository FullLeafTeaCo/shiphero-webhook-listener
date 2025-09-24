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


  // Process webhook analytics for real-time counters (always process)
  try {
    const normalizedPayload = normalizeShipmentUpdateForAnalytics(payload);
    await processShipmentUpdateWebhook(normalizedPayload);

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
