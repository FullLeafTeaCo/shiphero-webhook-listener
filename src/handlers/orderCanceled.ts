import { createLogger } from "../logger.js";
const log = createLogger("orderCanceled");

export async function handleOrderCanceled(payload: any): Promise<void> {
  const {
    account_id,
    order_id,
    order_number,
    canceled_by_user_id,
    canceled_by_name,
    canceled_at,
    cancel_reason,
    warehouse_id,
    warehouse_name,
  } = payload || {};

  log.info(
    {
      account_id,
      order_id,
      order_number,
      canceled_by_user_id,
      canceled_by_name,
      canceled_at,
      cancel_reason,
      warehouse_id,
      warehouse_name,
      payloadKeys: Object.keys(payload || {}),
    },
    "❌ Processing Order Canceled - Outstanding Order Update"
  );

  // DASHBOARD METRICS: Outstanding order tracking
  log.info(
    {
      order_id,
      order_number,
      canceled_by: canceled_by_name,
      cancel_reason,
      warehouse_name,
      canceled_at,
    },
    `❌ ORDER CANCELED: ${order_number} - ${
      cancel_reason || "No reason provided"
    }`
  );

  // TODO: Update outstanding order metrics
  // - Decrement outstanding order count
  // - Track cancel reasons for analytics
  // - Update warehouse-specific metrics

  // Example dashboard updates:
  // await updateOutstandingMetrics({
  //   metric: 'orders_canceled',
  //   value: 1,
  //   tags: {
  //     cancel_reason: cancel_reason || 'unknown',
  //     warehouse: warehouse_name || 'unknown'
  //   }
  // });
}
