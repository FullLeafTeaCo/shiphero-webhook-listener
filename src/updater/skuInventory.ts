// updater/skuInventory.ts
import { firestore, FieldValue } from "../firebase.js";

function numOr(val: any, fallback: number) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}
function toPlainText(html?: string | null) {
  if (!html) return null;
  return html.replace(/<[^>]*>/g, "").trim() || null;
}

export async function upsertSkuSnapshotFromEvent(evt: any) {
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
    timestamp,
  } = evt || {};

  if (!sku || !warehouse_uuid || !location_name) return;

  // Same idempotency signature you used for bin view
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

  const ref = db
    .collection("sku_inventory")
    .doc(String(sku))
    .collection("bins")
    .doc(binKey);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() as any) : null;

    if (prev?.last_event_id === last_event_id) return; // idempotent

    const current =
      typeof prev?.on_hand === "number"
        ? prev.on_hand
        : Number.isFinite(Number(previous_on_hand))
        ? numOr(previous_on_hand, 0)
        : 0;

    const next =
      Number.isFinite(Number(new_on_hand))
        ? numOr(new_on_hand, current)
        : current + numOr(delta, 0);

    tx.set(
      ref,
      {
        sku: String(sku),
        binKey,
        warehouse_uuid,
        location_name,
        on_hand: next,
        updatedAt: FieldValue.serverTimestamp(),
        last_event_id,
        last_reason: reason ?? null,
        last_reason_text: toPlainText(reason),
        last_source: source ?? null,
        lot_id: lot_id ?? null,
        lot_uuid: lot_uuid ?? null,
        lot_expiration: lot_expiration ?? null,
      },
      { merge: true }
    );
  });
}

// OPTIONAL: keep a fast total by SKU
export async function bumpSkuTotalFromEvent(evt: any) {
  const db = firestore();
  const { sku, delta, new_on_hand, previous_on_hand } = evt || {};
  if (!sku) return;

  // Calculate the delta applied to this event safely
  const prev = Number.isFinite(Number(previous_on_hand)) ? Number(previous_on_hand) : null;
  const next = Number.isFinite(Number(new_on_hand)) ? Number(new_on_hand) : null;

  const appliedDelta =
    next !== null && prev !== null
      ? next - prev
      : Number.isFinite(Number(delta))
      ? Number(delta)
      : 0;

  if (!appliedDelta) return;

  const totRef = db.collection("sku_totals").doc(String(sku));
  await totRef.set(
    {
      sku: String(sku),
      total_on_hand: FieldValue.increment(appliedDelta),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
