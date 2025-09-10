/**
 * Normalization adapters to ensure webhook payloads match the shape expected by analytics.ts
 */

/**
 * Normalize shipment update webhook payload for analytics
 * Converts flat payload structure to the nested structure expected by processShipmentUpdateWebhook
 */
export function normalizeShipmentUpdateForAnalytics(payload: any) {
  const order_uuid = payload?.order_uuid || payload?.order_id || null;
  const order_number = payload?.order_number || null;

  // If the webhook is flat with a single tracking_number, synthesize packages[]
  const packages = Array.isArray(payload?.packages)
    ? payload.packages
    : payload?.tracking_number
    ? [{ shipping_label: { tracking_number: payload.tracking_number } }]
    : [];

  // Make fulfillment map-like as analytics expects
  const fulfillment = { order_uuid, order_number };

  // Optional: pass a unified status & time for future overlay logic
  const order_fulfillment_status =
    payload?.status || payload?.fulfillment_status || null;

  // Carry an explicit event timestamp so analytics can pick the correct YMD
  const event_time =
    payload?.shipped_at || payload?.created_at || payload?.updated_at || null;

  return {
    ...payload,
    fulfillment,
    packages,
    order_fulfillment_status,
    event_time,
  };
}

/**
 * Normalize order packed out webhook payload for analytics
 * Ensures items is an array and adds event_time for proper date handling
 */
export function normalizePackedOutForAnalytics(payload: any) {
  // Ensure items is an array (analytics counts rows)
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const event_time =
    payload?.packed_at || payload?.created_at || payload?.updated_at || null;
  return { ...payload, items, event_time };
}

/**
 * Normalize tote cleared webhook payload for analytics
 * Ensures items is an array and adds event_time for proper date handling
 */
export function normalizeToteClearedForAnalytics(payload: any) {
  // Convert items_picked to items array if needed, or use existing items
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(payload?.items_picked)
    ? payload.items_picked
    : [];

  const event_time =
    payload?.cleared_at || payload?.created_at || payload?.updated_at || null;
  return { ...payload, items, event_time };
}
