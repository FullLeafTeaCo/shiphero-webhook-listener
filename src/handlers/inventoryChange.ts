import { createLogger } from "../logger.js";
import { firestore, FieldValue } from "../firebase.js";
import { todayYmd, DEFAULT_TZ } from "../utils/time.js";

const log = createLogger("inventoryChange");

export async function handleInventoryChange(payload: any): Promise<void> {
  const {
    webhook_type,
    account_uuid,
    account_id,
    warehouse_id,
    warehouse_uuid,
    user_id,
    user_uuid,
    sku,
    quantity, // change delta (positive/negative)
    location_name,
    previous_on_hand,
    timestamp,
    reason,
    source,
    lot_id,
    lot_uuid,
    lot_expiration,
  } = payload || {};

  // Derive helpful fields
  const delta: number = Number(quantity || 0);
  const oldOnHand: number = Number(previous_on_hand || 0);
  const newOnHand: number = oldOnHand + delta;
  const direction: "increase" | "decrease" | "none" =
    delta > 0 ? "increase" : delta < 0 ? "decrease" : "none";

  // Use event timestamp for day-bucketing when provided
  const ymd = todayYmd(DEFAULT_TZ, timestamp);

  const db = firestore();
  const ref = db
    .collection("inventory_changes")
    .doc(ymd)
    .collection("data")
    .doc();

  const record = {
    webhook_type: webhook_type || "Inventory Change",
    account_uuid,
    account_id,
    warehouse_id,
    warehouse_uuid,
    user_id,
    user_uuid,
    sku,
    location_name,
    delta,
    previous_on_hand: oldOnHand,
    new_on_hand: newOnHand,
    direction,
    timestamp, // ShipHero-provided event time (string)
    reason,
    source,
    lot_id,
    lot_uuid,
    lot_expiration,
    createdAt: FieldValue.serverTimestamp(),
  } as const;

  try {
    await ref.set(record);

  } catch (err) {
    log.error({ err, sku, ymd }, "💥 Failed to save inventory change");
  }
}
