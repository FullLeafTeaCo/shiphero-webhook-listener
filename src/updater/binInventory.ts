// updater/binInventory.ts
import { firestore, FieldValue } from "../firebase.js";

// (tiny helper)
function numOr(val: any, fallback: number) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}
function toPlainText(html?: string | null) {
  if (!html) return null;
  // very light tag strip; good enough for the known reason sample
  return html.replace(/<[^>]*>/g, "").trim() || null;
}

export async function upsertBinSnapshotFromEvent(evt: any) {
  const db = firestore();

  const {
    warehouse_uuid,
    location_name,
    sku,
    delta,
    previous_on_hand,
    new_on_hand,
    reason,
    source,
    lot_id,
    lot_uuid,
    lot_expiration,
    timestamp, // ShipHero event time (string)
  } = evt || {};

  if (!warehouse_uuid || !location_name || !sku) {
    // Missing key fields; nothing to upsert
    return;
  }

  // ---- Idempotency (synthetic) ----
  // Using prev/new ensures uniqueness even for multiple events at the same second.
  const last_event_id = [
    warehouse_uuid,
    location_name,
    sku,
    timestamp ?? "ts",
    source ?? "src",
    previous_on_hand ?? "prev",
    new_on_hand ?? "next",
  ].map(String).join("|");

  const binKey = `${warehouse_uuid}__${location_name}`;
  const ref = db.collection("bin_inventory").doc(binKey).collection("skus").doc(String(sku));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() as any) : null;

    // idempotent: if we’ve already applied this exact event signature, do nothing
    if (prev?.last_event_id === last_event_id) return;

    // establish a current baseline (prefer existing doc; else fall back to event.prev_on_hand)
    const current =
      typeof prev?.on_hand === "number"
        ? prev.on_hand
        : Number.isFinite(Number(previous_on_hand))
        ? numOr(previous_on_hand, 0)
        : 0;

    // compute the next on_hand
    const next =
      Number.isFinite(Number(new_on_hand))
        ? numOr(new_on_hand, current)
        : current + numOr(delta, 0);

    tx.set(
      ref,
      {
        warehouse_uuid,
        location_name,
        sku: String(sku),
        on_hand: next,
        updatedAt: FieldValue.serverTimestamp(),
        last_event_id,
        last_reason: reason ?? null,              // HTML preserved
        last_reason_text: toPlainText(reason),    // optional: plain text for UI
        last_source: source ?? null,
        lot_id: lot_id ?? null,
        lot_uuid: lot_uuid ?? null,
        lot_expiration: lot_expiration ?? null,
      },
      { merge: true }
    );
  });
}
