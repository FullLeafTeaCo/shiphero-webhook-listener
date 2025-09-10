import { createLogger } from "../logger.js";
import { processToteClearedWebhook } from "../analytics.js";
import { normalizeToteClearedForAnalytics } from "../helpers/normalize.js";
const log = createLogger("toteCleared");

export async function handleToteCleared(payload: any): Promise<void> {
  const {
    account_id,
    tote_id,
    tote_name,
    warehouse_id,
    warehouse_name,
    items_picked,
    pick_time_seconds,
  } = payload || {};

  const cleared_by_user_id =
    payload?.cleared_by_user_id ?? payload?.user_id ?? payload?.user?.id;
  const cleared_by_name =
    payload?.cleared_by_name ??
    payload?.user_name ??
    payload?.user?.name ??
    "Unknown";
  const cleared_at =
    payload?.cleared_at ?? payload?.timestamp ?? new Date().toISOString();

  log.info(
    {
      account_id,
      tote_id,
      tote_name,
      cleared_by_user_id,
      cleared_by_name,
      cleared_at,
      warehouse_id,
      warehouse_name,
      items_picked,
      pick_time_seconds,
      payloadKeys: Object.keys(payload || {}),
    },
    "🧺 Processing Tote Cleared - Picker Activity"
  );

  // DASHBOARD METRICS: Picker productivity
  log.info(
    {
      tote_id,
      tote_name,
      picker_id: cleared_by_user_id,
      picker_name: cleared_by_name,
      items_picked,
      pick_time_seconds,
      warehouse_name,
      cleared_at,
    },
    `🧺 PICKER COMPLETED: ${cleared_by_name} cleared tote ${tote_name} with ${
      items_picked || 0
    } items`
  );

  // Process webhook analytics for real-time counters (always do this regardless of user attribution)
  try {
    const normalizedPayload = normalizeToteClearedForAnalytics(payload);
    await processToteClearedWebhook(normalizedPayload);
    log.info(
      { tote_id, tote_name },
      "📊 Updated tote cleared analytics counters"
    );
  } catch (analyticsError) {
    log.error(
      { tote_id, tote_name, error: analyticsError },
      "💥 Failed to update tote cleared analytics"
    );
  }

  // If we cannot attribute to a user, skip leaderboard and allow later enrichment
  if (!cleared_by_user_id) {
    log.warn(
      { tote_id, tote_name, payloadKeys: Object.keys(payload || {}) },
      "⚠️ Missing picker user id; skipping leaderboard credit"
    );
    return;
  }

  // TODO: Re-enable Firebase analytics when needed
  // const key = buildIdempotencyKeyForPayload({
  //   webhook_type: "Tote Cleared",
  //   tote_id,
  //   tote_name,
  //   cleared_by_user_id,
  //   cleared_by_name,
  //   cleared_at,
  // });
  // const first = await ensureIdempotentEvent(key);
  // if (!first) {
  //   log.info({ key }, "⏭️ Duplicate picker event; skipping");
  //   return;
  // }
  // await incrementPicker({ userId: cleared_by_user_id, name: cleared_by_name, at: cleared_at });
}
