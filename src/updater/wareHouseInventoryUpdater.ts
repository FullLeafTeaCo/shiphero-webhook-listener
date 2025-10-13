// services/inventoryDelta.ts
import { firestore, FieldValue } from "../firebase.js";
import { Timestamp } from "firebase-admin/firestore";
import { safeSeg } from "../utils/safeSeg.js";

type InventoryChangePayload = {
  warehouse_uuid?: string;
  location_name?: string;
  sku?: string;
  delta?: number;
  new_on_hand?: number;
  lot_id?: number | string | null;
  lot_uuid?: string | null;
  lot_name?: string | null;
  lot_expiration?: string | null;
  product_name?: string | null;

  event_ref_path?: string;
  event_direction?: "increase" | "decrease" | "none";
  event_timestamp?: string | null;
};

export async function applyInventoryDelta(raw: InventoryChangePayload) {
  const db = firestore();

  const warehouseUuid = String(raw.warehouse_uuid || "").trim();
  const locationName  = String(raw.location_name  || "").trim();
  const sku           = String(raw.sku || "").trim();
  if (!warehouseUuid || !locationName || !sku) {
    throw new Error(`Missing required fields`);
  }

   function decodeLotUuid(uuid?: string | null): string | null {
  if (!uuid) return null;
  try {
    const raw = typeof atob === "function" ? atob(uuid) : Buffer.from(uuid, "base64").toString("utf8");
    return raw.startsWith("Lot:") ? raw.slice(4) : raw;
  } catch {
    return null;
  }
}

    function normalizeLotKey(lot_id?: string | number | null, lot_uuid?: string | null): string | null {
  if (lot_id != null && String(lot_id).trim() !== "") return String(lot_id).trim();
  const decoded = decodeLotUuid(lot_uuid);
  return decoded && decoded.trim() !== "" ? decoded.trim() : null;
}

  const parsedDelta = Number(raw.delta ?? 0);
  const delta = Number.isFinite(parsedDelta) ? parsedDelta : 0;

  const hasAbsolute = raw.new_on_hand != null && Number.isFinite(Number(raw.new_on_hand));
  const absoluteQty = hasAbsolute ? Number(raw.new_on_hand) : undefined;

  // 🔴 Normalize lot identity so it matches seeder
  const normalizedLotKey = normalizeLotKey(raw.lot_id ?? null, raw.lot_uuid ?? null);

  const wId = safeSeg(warehouseUuid);
  const aliasId = safeSeg(locationName);

  // Resolve alias (your existing alias logic) …
  const aliasRef = db.doc(`warehouses/${wId}/locations_by_name/${aliasId}`);
  let aliasSnap = await aliasRef.get();
  let locIdEncoded: string | null = null;

  if (aliasSnap.exists) {
    const a = aliasSnap.data() as any;
    locIdEncoded = a.location_id_encoded || safeSeg(a.location_id);
  } else {
    const locsCol = db.collection(`warehouses/${wId}/locations`);
    const qSnap = await locsCol.where("name", "==", locationName).limit(1).get();
    if (!qSnap.empty) {
      const doc0 = qSnap.docs[0];
      locIdEncoded = doc0.id;
      await aliasRef.set(
        { name: locationName, location_id: null, location_id_encoded: doc0.id, updated_at: Timestamp.now() },
        { merge: true }
      );
    }
  }

  if (!locIdEncoded) throw new Error(`Location not found for ${locationName}`);

  const skuId = safeSeg(sku);
  const lotIdEnc = normalizedLotKey ? safeSeg(normalizedLotKey) : null;
  const itemId = lotIdEnc ? `${skuId}__lot_${lotIdEnc}` : skuId;

  const locRef  = db.doc(`warehouses/${wId}/locations/${locIdEncoded}`);
  const itemRef = db.doc(`warehouses/${wId}/locations/${locIdEncoded}/items/${itemId}`);

  const eventRef = raw.event_ref_path ? db.doc(raw.event_ref_path) : null;
  const eventTs  = raw.event_timestamp ? Timestamp.fromDate(new Date(raw.event_timestamp)) : null;

  await db.runTransaction(async (tx) => {
    // READS
    const itemSnap = await tx.get(itemRef);

    const prevQty: number = itemSnap.exists ? Number(itemSnap.get("quantity") || 0) : 0;
    const nextQty = hasAbsolute ? Math.max(0, absoluteQty!) : Math.max(0, prevQty + delta);
    const deltaToApply = hasAbsolute ? (nextQty - prevQty) : delta;

    const lotTs = raw.lot_expiration ? Timestamp.fromDate(new Date(raw.lot_expiration)) : (itemSnap.exists ? itemSnap.get("lot_expiration_date") ?? null : null);

    // WRITE item
    const base: Record<string, any> = {
      sku,
      product_name: raw.product_name ?? (itemSnap.exists ? itemSnap.get("product_name") ?? null : null),
      quantity: nextQty,
      lot_id: normalizedLotKey ?? (itemSnap.exists ? itemSnap.get("lot_id") ?? null : null),
      lot_uuid: raw.lot_uuid ?? (itemSnap.exists ? itemSnap.get("lot_uuid") ?? null : null),
      lot_name: raw.lot_name ?? (itemSnap.exists ? itemSnap.get("lot_name") ?? null : null),
      lot_expiration_date: lotTs,
      _raw: { warehouse_id: warehouseUuid, location_id: itemSnap.exists ? itemSnap.get("_raw")?.location_id ?? null : null, location_id_encoded: locIdEncoded },
      updated_at: FieldValue.serverTimestamp(),
    };

    if (eventRef) {
      base.last_event_ref = eventRef;
      base.last_event_at  = eventTs ?? FieldValue.serverTimestamp();
      base.last_event_delta = deltaToApply;
      base.last_event_direction = raw.event_direction ?? (deltaToApply > 0 ? "increase" : deltaToApply < 0 ? "decrease" : "none");
      base.event_refs = FieldValue.arrayUnion(eventRef);
    }

    tx.set(itemRef, base, { merge: true });

    // WRITE rollup
    const locUpdate: Record<string, any> = {
      name: locationName,
      updated_at: FieldValue.serverTimestamp(),
      qty_total: FieldValue.increment(deltaToApply),
    };
    if (prevQty <= 0 && nextQty > 0) locUpdate.items_count = FieldValue.increment(1);
    else if (prevQty > 0 && nextQty <= 0) locUpdate.items_count = FieldValue.increment(-1);

    tx.set(locRef, locUpdate, { merge: true });
  });
}
