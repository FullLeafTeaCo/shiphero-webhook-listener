// functions/src/analytics.ts
import { firestore, FieldValue } from "./firebase.js";
import { todayYmd, hourLabel, DEFAULT_TZ } from "./utils/time.js";
import { createLogger } from "./logger.js";

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
 * Shipment update webhook — unchanged (still dedups labels + shipped orders).
 * If you want the poller to own shipped counters too, we can later downshift
 * this handler to “record-only” just like packed_out.
 */
export async function processShipmentUpdateWebhook(body: any): Promise<void> {
  const db = firestore();
  const ymd = todayYmd(DEFAULT_TZ);
  const statsRef = db.collection("stats").doc(ymd);

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

    if (newLabels > 0) {
      tx.set(
        statsRef,
        {
          shipped: {
            labels: FieldValue.increment(newLabels),
            shipments: FieldValue.increment(newLabels),
          },
          updatedAt: FieldValue.serverTimestamp(),
          source: "webhook",
        },
        { merge: true }
      );
    }

    if (orderKey && isNewOrder) {
      const ordRef = db
        .collection("dedup")
        .doc(ymd)
        .collection("shipped_orders")
        .doc(orderKey);
      const expireAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      tx.set(ordRef, { createdAt: FieldValue.serverTimestamp(), expireAt });
      tx.set(
        statsRef,
        {
          shipped: { orders: FieldValue.increment(1) },
          updatedAt: FieldValue.serverTimestamp(),
          source: "webhook",
        },
        { merge: true }
      );
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

  // Persist the event (raw “spread”) with a few helpful metadata fields
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
    },
    receivedAt: FieldValue.serverTimestamp(),
  };

  await eventRef.set(record);
  log.info({ ymd, docPath: eventRef.path }, "[packed_out] event recorded");
}

/**
 * Tote cleared webhook — current behavior still updates pick totals.
 * If you prefer this to be record-only as well, say the word and I’ll mirror
 * the same pattern to `picked_out/{ymd}` (or a name you choose).
 */
export async function processToteClearedWebhook(body: any): Promise<void> {
  const db = firestore();
  const ymd = todayYmd(DEFAULT_TZ);
  const statsRef = db.collection("stats").doc(ymd);

  const items: any[] = Array.isArray(body?.items) ? body.items : [];

  await db.runTransaction(async (tx) => {
    let itemsToAdd = 0;
    let ordersToAdd = 0;

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

      itemsToAdd += picked_quantity;
      if (order_id) ordersToAdd += 1;
    }

    if (itemsToAdd > 0 || ordersToAdd > 0) {
      tx.set(
        statsRef,
        {
          updatedAt: FieldValue.serverTimestamp(),
          source: "webhook",
          itemsPicked: {
            ...(itemsToAdd > 0
              ? { items: FieldValue.increment(itemsToAdd) }
              : {}),
            ...(ordersToAdd > 0
              ? { orders: FieldValue.increment(ordersToAdd) }
              : {}),
          },
        },
        { merge: true }
      );
    }
  });
}
