import { firestore, FieldValue } from "./firebase.js";
import { todayYmd, hourLabel, DEFAULT_TZ, nowIso } from "./utils/time.js";
import { createLogger } from "./logger.js";

const log = createLogger("analytics");

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

export async function incrementProcessedForToday(opts: {
  orderId?: string | number;
  shippedAt?: string | number | Date;
  carrier?: string;
  service?: string;
}): Promise<void> {
  const db = firestore();
  const ymd = todayYmd(DEFAULT_TZ, opts.shippedAt);
  const hour = hourLabel(DEFAULT_TZ, opts.shippedAt);

  // processed_today idempotency per order per day
  const processedDocId = `${ymd}_${opts.orderId ?? "unknown"}`;
  const processedRef = db
    .collection("idempotency_processed_today")
    .doc(processedDocId);

  await db.runTransaction(async (tx) => {
    const seenSnap = await tx.get(processedRef);
    if (seenSnap.exists) {
      return; // already counted for today
    }

    // Mark as seen first to prevent double counting across retries
    tx.set(processedRef, { at: FieldValue.serverTimestamp() }, { merge: true });

    // stats/today
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
      },
      { merge: true }
    );

    // daily/{date}
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

export async function incrementLeaderboard(opts: {
  kind: "pickers" | "packers";
  userId?: string | number;
  name?: string;
  at?: string | number | Date;
}): Promise<void> {
  // This function is deprecated - use incrementPacker or incrementPicker instead
  if (opts.kind === "packers") {
    return incrementPacker(opts);
  } else {
    return incrementPicker(opts);
  }
}

// Because Firestore SDK needs explicit document paths, provide concrete helpers
export async function incrementPacker(opts: {
  userId?: string | number;
  name?: string;
  at?: string | number | Date;
}): Promise<void> {
  return incrementUser("packers", opts);
}

export async function incrementPicker(opts: {
  userId?: string | number;
  name?: string;
  at?: string | number | Date;
}): Promise<void> {
  return incrementUser("pickers", opts);
}

async function incrementUser(
  kind: "pickers" | "packers",
  opts: { userId?: string | number; name?: string; at?: string | number | Date }
): Promise<void> {
  const db = firestore();
  const ymd = todayYmd(DEFAULT_TZ, opts.at);
  const userKey = String(opts.userId ?? "unknown");
  const name = opts.name ?? "Unknown";

  await db.runTransaction(async (tx) => {
    // leaderboards/today/{kind}
    const todayRef = db
      .collection("leaderboards")
      .doc("today")
      .collection("data")
      .doc(kind);
    // mirror to /daily/{date}/{kind}
    const dailyRef = db
      .collection("daily")
      .doc(ymd)
      .collection("data")
      .doc(kind);

    // ALL READS FIRST
    const todaySnap = await tx.get(todayRef);
    const dailySnap = await tx.get(dailyRef);

    // Process data
    const todayData = todaySnap.exists ? (todaySnap.data() as any) : {};
    const current = todayData[userKey] || { name, count: 0 };
    current.name = name; // keep latest name
    current.count = (current.count || 0) + 1;

    const dailyData = dailySnap.exists ? (dailySnap.data() as any) : {};
    const dcur = dailyData[userKey] || { name, count: 0 };
    dcur.name = name;
    dcur.count = (dcur.count || 0) + 1;

    // ALL WRITES AFTER
    tx.set(
      todayRef,
      {
        [userKey]: current,
      },
      { merge: true }
    );

    tx.set(
      dailyRef,
      {
        [userKey]: dcur,
      },
      { merge: true }
    );
  });
}

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

// ---- Webhook-based Analytics Functions ----

/**
 * Process shipment update webhook - count labels/shipments and distinct orders shipped
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
    // ALL READS FIRST
    const labelChecks: { [key: string]: boolean } = {};
    let newLabels = 0;

    // Check all labels first
    for (const tn of trackingNumbers) {
      const labelRef = db
        .collection("dedup")
        .doc(ymd)
        .collection("labels")
        .doc(tn);
      const snap = await tx.get(labelRef);
      labelChecks[tn] = !snap.exists;
      if (labelChecks[tn]) {
        newLabels++;
      }
    }

    // Check if order is new
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

    // ALL WRITES AFTER
    // Write new labels
    for (const tn of trackingNumbers) {
      if (labelChecks[tn]) {
        const labelRef = db
          .collection("dedup")
          .doc(ymd)
          .collection("labels")
          .doc(tn);
        const expireAt = new Date();
        expireAt.setDate(expireAt.getDate() + 14); // 14 days TTL
        tx.set(labelRef, {
          createdAt: FieldValue.serverTimestamp(),
          expireAt: expireAt,
        });
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
        },
        { merge: true }
      );
    }

    // Write new order
    if (orderKey && isNewOrder) {
      const ordRef = db
        .collection("dedup")
        .doc(ymd)
        .collection("shipped_orders")
        .doc(orderKey);
      const expireAt = new Date();
      expireAt.setDate(expireAt.getDate() + 14); // 14 days TTL
      tx.set(ordRef, {
        createdAt: FieldValue.serverTimestamp(),
        expireAt: expireAt,
      });
      tx.set(
        statsRef,
        {
          shipped: { orders: FieldValue.increment(1) },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
}

/**
 * Process order packed out webhook - count items packed and distinct orders processed
 */
export async function processOrderPackedOutWebhook(body: any): Promise<void> {
  const db = firestore();
  const ymd = todayYmd(DEFAULT_TZ);
  const statsRef = db.collection("stats").doc(ymd);
  const orderKey: string = body?.order_uuid || String(body?.order_id || "");
  const items: any[] = Array.isArray(body?.items) ? body.items : [];
  const itemsCount = items.length;
  await db.runTransaction(async (tx) => {
    // ALL READS FIRST
    let isNewOrder = false;
    if (orderKey) {
      const ordRef = db
        .collection("dedup")
        .doc(ymd)
        .collection("packed_orders")
        .doc(orderKey);
      const os = await tx.get(ordRef);
      isNewOrder = !os.exists;
    }

    // ALL WRITES AFTER
    // increment itemsPacked.items (approximate — one per row)
    if (itemsCount > 0) {
      tx.set(
        statsRef,
        {
          itemsPacked: { items: FieldValue.increment(itemsCount) },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // count distinct orders packed today (itemsPacked.orders)
    if (orderKey && isNewOrder) {
      const ordRef = db
        .collection("dedup")
        .doc(ymd)
        .collection("packed_orders")
        .doc(orderKey);
      const expireAt = new Date();
      expireAt.setDate(expireAt.getDate() + 14); // 14 days TTL
      tx.set(ordRef, {
        createdAt: FieldValue.serverTimestamp(),
        expireAt: expireAt,
      });
      tx.set(
        statsRef,
        {
          itemsPacked: { orders: FieldValue.increment(1) },
          // your "processed" mirrors unique orders from packs
          processed: FieldValue.increment(1),
          // decrement outstanding when order is processed
          outstanding: FieldValue.increment(-1),
          outstandingUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
}

/**
 * Process tote cleared webhook - count items picked and distinct orders
 */
export async function processToteClearedWebhook(body: any): Promise<void> {
  const db = firestore();
  const ymd = todayYmd(DEFAULT_TZ);
  const statsRef = db.collection("stats").doc(ymd);
  const items: any[] = Array.isArray(body?.items) ? body.items : [];
  const orders = new Set<string>();
  for (const it of items) {
    const k = String(it?.order_id || "");
    if (k) orders.add(k);
  }
  await db.runTransaction(async (tx) => {
    // ALL READS FIRST
    const orderChecks: { [key: string]: boolean } = {};
    let newOrderTouches = 0;

    for (const k of orders) {
      const ordRef = db
        .collection("dedup")
        .doc(ymd)
        .collection("picked_orders")
        .doc(k);
      const os = await tx.get(ordRef);
      orderChecks[k] = !os.exists;
      if (orderChecks[k]) {
        newOrderTouches++;
      }
    }

    // ALL WRITES AFTER
    if (items.length > 0) {
      tx.set(
        statsRef,
        {
          itemsPicked: {
            items: FieldValue.increment(items.length), // approximate — one per row
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // Write new orders
    for (const k of orders) {
      if (orderChecks[k]) {
        const ordRef = db
          .collection("dedup")
          .doc(ymd)
          .collection("picked_orders")
          .doc(k);
        const expireAt = new Date();
        expireAt.setDate(expireAt.getDate() + 14); // 14 days TTL
        tx.set(ordRef, {
          createdAt: FieldValue.serverTimestamp(),
          expireAt: expireAt,
        });
      }
    }
    if (newOrderTouches > 0) {
      tx.set(
        statsRef,
        {
          itemsPicked: { orders: FieldValue.increment(newOrderTouches) },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
}
