// services/handleInventoryChange.ts (your file)
import { createLogger } from "../logger.js";
import { firestore, FieldValue } from "../firebase.js";
import { todayYmd, DEFAULT_TZ } from "../utils/time.js";
import { applyInventoryDelta } from "../updater/wareHouseInventoryUpdater.js"; // your applyInventoryDelta module

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
    quantity, // delta
    location_name,
    previous_on_hand,
    timestamp,
    reason,
    source,
    lot_id,
    lot_uuid,
    lot_expiration,
  } = payload || {};

  const delta: number = Number(quantity || 0);
  const oldOnHand: number = Number(previous_on_hand || 0);
  const newOnHand: number = oldOnHand + delta;
  const direction: "increase" | "decrease" | "none" =
    delta > 0 ? "increase" : delta < 0 ? "decrease" : "none";

  const ymd = todayYmd(DEFAULT_TZ, timestamp);

  const db = firestore();
  const eventRef = db
    .collection("inventory_changes")
    .doc(ymd)
    .collection("data")
    .doc(); // we’ll pass this

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
    timestamp, // ShipHero-provided
    reason,
    source,
    lot_id,
    lot_uuid,
    lot_expiration,
    createdAt: FieldValue.serverTimestamp(),
  } as const;

  try {
    await eventRef.set(record);
  } catch (err) {
    log.error({ err, sku, ymd }, "💥 Failed to save inventory change");
  }

  // Apply the delta + link this exact event
  try {
    await applyInventoryDelta({
      warehouse_uuid,
      location_name,
      sku,
      delta: Number(quantity || 0),
      new_on_hand: (payload as any).new_on_hand ?? undefined,
      lot_id,
      lot_uuid,
      lot_name: (payload as any).lot_name ?? null,
      lot_expiration,
      product_name: (payload as any).product_name ?? null,
      event_ref_path: eventRef.path,
      event_direction: direction,
      event_timestamp: timestamp,
    });
  } catch (err) {
    log.error(
      { err, sku, location_name },
      "💥 Failed to apply delta to inventory"
    );
  }
}
