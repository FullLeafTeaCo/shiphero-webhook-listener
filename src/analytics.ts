// functions/src/analytics.ts
import { firestore, FieldValue } from "./firebase.js";
import { todayYmd, hourLabel, DEFAULT_TZ } from "./utils/time.js";
import { createLogger } from "./logger.js";
import { getOrderShippingZipcode } from "./shiphero.js";

const log = createLogger("analytics");

// ---------- Helpers ----------
function idempotencyKeyFrom(
  parts: Array<string | number | undefined | null>
): string {
  return parts
    .map((v) => (v === undefined || v === null ? "" : String(v)))
    .join("|");
}

export async function ensureIdempotentEvent(key: string): Promise<boolean> {
  const db = firestore();
  const ref = db.collection("idempotency_events").doc(key);
  const snap = await ref.get();
  if (snap.exists) return false;
  await ref.set({ seenAt: FieldValue.serverTimestamp() }, { merge: true });
  return true;
}

export async function markShipmentCompletedOnce(opts: {
  shipmentId?: string;
  completed: boolean;
}): Promise<boolean> {
  const db = firestore();
  const sid = opts.shipmentId || "unknown";
  const ref = db.collection("idempotency_shipments").doc(sid);
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() as any) : {};
    const lastCompleted: boolean = !!prev.lastCompletedValue;
    const firstSeen = !snap.exists;
    const transitionedToTrue = !lastCompleted && opts.completed === true;
    tx.set(
      ref,
      {
        seenAt: FieldValue.serverTimestamp(),
        firstCompletedSeenAt:
          transitionedToTrue && !prev.firstCompletedSeenAt
            ? FieldValue.serverTimestamp()
            : prev.firstCompletedSeenAt || null,
        lastCompletedValue: !!opts.completed,
      },
      { merge: true }
    );
    return transitionedToTrue || (firstSeen && opts.completed === true);
  });
  return res;
}

// ---------- (kept) processed_today helper ----------
export async function incrementProcessedForToday(opts: {
  orderId?: string | number;
  shippedAt?: string | number | Date;
  carrier?: string;
  service?: string;
}): Promise<void> {
  const db = firestore();
  const ymd = todayYmd(DEFAULT_TZ, opts.shippedAt);
  const hour = hourLabel(DEFAULT_TZ, opts.shippedAt);

  const processedDocId = `${ymd}_${opts.orderId ?? "unknown"}`;
  const processedRef = db
    .collection("idempotency_processed_today")
    .doc(processedDocId);

  await db.runTransaction(async (tx) => {
    const seenSnap = await tx.get(processedRef);
    if (seenSnap.exists) return;

    tx.set(processedRef, { at: FieldValue.serverTimestamp() }, { merge: true });

    const statsTodayRef = db.collection("stats").doc("today");
    const statsTodaySnap = await tx.get(statsTodayRef);
    const statToday = statsTodaySnap.exists
      ? (statsTodaySnap.data() as any)
      : {};
    const hourly: Array<{ label: string; count: number }> = Array.isArray(
      statToday.hourly
    )
      ? statToday.hourly
      : [];
    const idx = hourly.findIndex((b) => b && b.label === hour);
    if (idx >= 0) {
      hourly[idx] = { label: hour, count: (hourly[idx].count || 0) + 1 };
    } else {
      hourly.push({ label: hour, count: 1 });
    }

    tx.set(
      statsTodayRef,
      {
        date: ymd,
        updatedAt: FieldValue.serverTimestamp(),
        processed: FieldValue.increment(1),
        hourly,
        source: "webhook",
      },
      { merge: true }
    );

    const dailyRef = db.collection("daily").doc(ymd);
    tx.set(
      dailyRef,
      {
        processed: FieldValue.increment(1),
        timezone: DEFAULT_TZ,
        lastUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

// ---------- DEPRECATED helpers (kept as no-ops) ----------
export async function incrementLeaderboard(_: {
  kind: "pickers" | "packers";
  userId?: string | number;
  name?: string;
  at?: string | number | Date;
}): Promise<void> {
  return;
}
export async function incrementPacker(_: {
  userId?: string | number;
  name?: string;
  at?: string | number | Date;
}): Promise<void> {
  return;
}
export async function incrementPicker(_: {
  userId?: string | number;
  name?: string;
  at?: string | number | Date;
}): Promise<void> {
  return;
}

// ---------- Idempotency key for any ShipHero payload ----------
export function buildIdempotencyKeyForPayload(payload: any): string {
  const t = payload?.webhook_type;
  return idempotencyKeyFrom([
    t,
    payload?.order_id,
    payload?.order_number,
    payload?.shipment_id,
    payload?.tote_id,
    payload?.packed_by_user_id,
    payload?.cleared_by_user_id,
    payload?.packed_at,
    payload?.cleared_at,
  ]);
}

/**
 * Shipment update webhook — **REFACTORED TO RECORD-ONLY**.
 * Writes dedup records for labels and shipped orders to prevent duplicates.
 * Stats counters are now managed by the poller system.
 */
export async function processShipmentUpdateWebhook(body: any): Promise<void> {
  const db = firestore();
  const ymd = todayYmd(DEFAULT_TZ);

  const orderKey: string =
    body?.fulfillment?.order_uuid ||
    String(body?.fulfillment?.order_number || "");
  const pkgs: any[] = Array.isArray(body?.packages) ? body.packages : [];
  const trackingNumbers: string[] = pkgs
    .map((p) => p?.shipping_label?.tracking_number)
    .filter(Boolean);

  await db.runTransaction(async (tx) => {
    const labelChecks: { [key: string]: boolean } = {};
    let newLabels = 0;

    for (const tn of trackingNumbers) {
      const labelRef = db
        .collection("dedup")
        .doc(ymd)
        .collection("labels")
        .doc(tn);
      const snap = await tx.get(labelRef);
      labelChecks[tn] = !snap.exists;
      if (!snap.exists) newLabels++;
    }

    let isNewOrder = false;
    if (orderKey) {
      const ordRef = db
        .collection("dedup")
        .doc(ymd)
        .collection("shipped_orders")
        .doc(orderKey);
      const os = await tx.get(ordRef);
      isNewOrder = !os.exists;
    }

    for (const tn of trackingNumbers) {
      if (labelChecks[tn]) {
        const labelRef = db
          .collection("dedup")
          .doc(ymd)
          .collection("labels")
          .doc(tn);
        const expireAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        tx.set(labelRef, { createdAt: FieldValue.serverTimestamp(), expireAt });
      }
    }

    if (orderKey && isNewOrder) {
      const ordRef = db
        .collection("dedup")
        .doc(ymd)
        .collection("shipped_orders")
        .doc(orderKey);
      const expireAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      tx.set(ordRef, { createdAt: FieldValue.serverTimestamp(), expireAt });
    }
  });
}

/**
 * Packed out webhook — **REFACTORED TO RECORD-ONLY**.
 * Writes the raw payload under: packed_out/{YMD}/data/{autoId}
 * Idempotent by an event key derived from the payload; duplicates are ignored.
 */
export async function processOrderPackedOutWebhook(body: any): Promise<void> {
  const db = firestore();
  const ymd = todayYmd(DEFAULT_TZ, body?.packed_at);

  // Make this idempotent so we don’t store duplicates of the same event
  const key =
    buildIdempotencyKeyForPayload({ ...body, webhook_type: "packed_out" }) ||
    idempotencyKeyFrom([
      "packed_out_fallback",
      body?.order_uuid ?? body?.order_id,
      body?.shipment_id,
      body?.packed_by_user_id,
      body?.packed_at,
      Array.isArray(body?.items) ? body.items.length : 0,
    ]);

  const firstTime = await ensureIdempotentEvent(key);
  if (!firstTime) {
    log.info({ key }, "[packed_out] duplicate webhook ignored");
    return;
  }

  // Fetch shipping zipcode from ShipHero API
  let shippingZipcode: string | null = null;
  const orderUuid = body?.order_uuid ?? body?.order_id;
  if (orderUuid) {
    try {
      shippingZipcode = await getOrderShippingZipcode(String(orderUuid));
      if (shippingZipcode) {
        log.info({ orderUuid, shippingZipcode }, "[packed_out] fetched shipping zipcode");
        
        // Check Firebase for distance value
        try {
          const distanceRef = db.collection("distances").doc(shippingZipcode);
          const distanceSnap = await distanceRef.get();
          if (distanceSnap.exists) {
            const distanceData = distanceSnap.data();
            const distanceValue = distanceData?.distance ?? distanceData?.value ?? null;
            console.log(`[packed_out] Distance for zipcode ${shippingZipcode}:`, distanceValue);
            log.info({ zipcode: shippingZipcode, distance: distanceValue }, "[packed_out] found distance in Firebase");
            
            // Increment total_distance collection
            if (distanceValue !== null && typeof distanceValue === 'number') {
              try {
                const totalDistanceRef = db.collection("total_distance").doc("total");
                await totalDistanceRef.set(
                  {
                    value: FieldValue.increment(distanceValue),
                    lastUpdatedAt: FieldValue.serverTimestamp(),
                  },
                  { merge: true }
                );
                console.log(`[packed_out] Incremented total_distance by ${distanceValue}`);
                log.info({ distance: distanceValue }, "[packed_out] incremented total_distance");
              } catch (totalDistanceError) {
                log.error({ distance: distanceValue, error: totalDistanceError }, "[packed_out] error incrementing total_distance");
              }
            } else {
              log.warn({ zipcode: shippingZipcode, distanceValue }, "[packed_out] distance value is not a number, skipping total_distance increment");
            }
          } else {
            console.log(`[packed_out] No distance found for zipcode ${shippingZipcode}`);
            log.warn({ zipcode: shippingZipcode }, "[packed_out] no distance document found in Firebase");
          }
        } catch (distanceError) {
          log.error({ zipcode: shippingZipcode, error: distanceError }, "[packed_out] error fetching distance from Firebase");
        }
      } else {
        log.warn({ orderUuid }, "[packed_out] could not fetch shipping zipcode");
      }
    } catch (error) {
      log.error({ orderUuid, error }, "[packed_out] error fetching shipping zipcode");
    }
  }

  // Persist the event (raw "spread") with a few helpful metadata fields
  const eventRef = db
    .collection("packed_out")
    .doc(ymd)
    .collection("data")
    .doc();
  const record = {
    ...body, // spread everything ShipHero sent
    _meta: {
      idempotencyKey: key,
      ymd,
      source: "webhook",
      type: "packed_out",
      shippingZipcode, // add zipcode to metadata
    },
    receivedAt: FieldValue.serverTimestamp(),
  };

  await eventRef.set(record);
  log.info({ ymd, docPath: eventRef.path }, "[packed_out] event recorded");
}

/**
 * Tote cleared webhook — **REFACTORED TO RECORD-ONLY**.
 * Writes dedup records for pick edges and updates leaderboard per-user stats.
 * Stats counters are now managed by the poller system.
 */
export async function processToteClearedWebhook(body: any): Promise<void> {
  const db = firestore();
  const ymd = todayYmd(DEFAULT_TZ);

  const items: any[] = Array.isArray(body?.items) ? body.items : [];

  await db.runTransaction(async (tx) => {
    for (const it of items) {
      const order_id = it?.order_id ? String(it.order_id) : undefined;
      const user_id = String(body?.cleared_by_user_id ?? "unknown");
      const user_name =
        [body?.cleared_by_user_first_name, body?.cleared_by_user_last_name]
          .filter(Boolean)
          .join(" ") || "Unknown";
      const created_at = body?.cleared_at;
      const picked_quantity = 1; // your previous approximation

      const sig = [
        order_id ?? "",
        user_id ?? "",
        created_at ?? "",
        String(picked_quantity),
      ].join("|");

      const edgeRef = db
        .collection("dedup")
        .doc(ymd)
        .collection("pick_edges")
        .doc(sig);
      const snap = await tx.get(edgeRef);
      if (snap.exists) continue;

      const expireAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      tx.set(edgeRef, {
        createdAt: FieldValue.serverTimestamp(),
        expireAt,
        user_id,
        order_id: order_id ?? null,
        qty: picked_quantity,
        source: "webhook",
      });

      // per-user attribution (legacy path; poller is now the authority)
      const userRef = db
        .collection("leaderboards")
        .doc(ymd)
        .collection("pickers")
        .doc(user_id);
      tx.set(
        userRef,
        {
          name: user_name,
          items: FieldValue.increment(picked_quantity),
          orders: FieldValue.increment(order_id ? 1 : 0),
        },
        { merge: true }
      );
    }
  });
}
