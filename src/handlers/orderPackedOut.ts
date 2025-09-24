import { createLogger } from "../logger.js";
import { processOrderPackedOutWebhook } from "../analytics.js";
import { normalizePackedOutForAnalytics } from "../helpers/normalize.js";
const log = createLogger("orderPackedOut");

export async function handleOrderPackedOut(payload: any): Promise<void> {
  const { order_id, order_number } = payload || {};

  // Process webhook analytics for real-time counters (always do this regardless of user attribution)
  try {
    const normalizedPayload = normalizePackedOutForAnalytics(payload);

    await processOrderPackedOutWebhook(normalizedPayload);
  } catch (analyticsError) {
    log.error(
      { order_id, order_number, error: analyticsError },
      "💥 Failed to update packed order analytics"
    );
  }
}
