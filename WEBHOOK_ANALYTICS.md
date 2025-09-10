# Webhook-Based Analytics System

This document describes the real-time analytics system that processes ShipHero webhooks to maintain live counters for warehouse operations.

## Overview

The system processes three key webhook types to maintain real-time analytics:

- **Shipment Update** → Counts labels/shipments and distinct orders shipped
- **Order Packed Out** → Counts items packed and distinct orders processed
- **Tote Cleared** → Counts items picked and distinct orders touched

## Architecture

### Fast Acknowledgment

- Webhooks are acknowledged immediately with HTTP 200
- Processing happens asynchronously in the background
- Prevents ShipHero retries due to slow responses

### Idempotent Processing

- Each webhook event is deduplicated using per-day keys
- Prevents double-counting from webhook retries
- Uses Firestore transactions for atomic operations

### Data Structure

#### Stats Documents

```
stats/{YYYY-MM-DD}
├── shipped
│   ├── labels: number        # Total shipping labels created
│   ├── shipments: number     # Total shipments (same as labels)
│   └── orders: number        # Distinct orders shipped
├── itemsPacked
│   ├── items: number         # Total items packed (approximate)
│   └── orders: number        # Distinct orders packed
├── itemsPicked
│   ├── items: number         # Total items picked (approximate)
│   └── orders: number        # Distinct orders touched by picks
├── processed: number         # Total orders processed (mirrors itemsPacked.orders)
└── updatedAt: timestamp
```

#### Deduplication Documents

```
dedup/{YYYY-MM-DD}/
├── labels/{tracking_number}
├── shipped_orders/{order_uuid}
├── packed_orders/{order_id}
└── picked_orders/{order_id}
```

Each dedup document contains:

- `createdAt`: Server timestamp
- `expireAt`: TTL timestamp (14 days)

## Webhook Processing

### Shipment Update

**Trigger**: When an order is shipped or delivered
**Counts**:

- Labels/shipments: One per tracking number in `packages` array
- Distinct orders: One per unique `order_uuid` or `order_number`

**Payload Structure**:

```json
{
  "webhook_type": "Shipment Update",
  "fulfillment": {
    "order_uuid": "uuid",
    "order_number": "12345"
  },
  "packages": [
    {
      "shipping_label": {
        "tracking_number": "1Z999AA1234567890"
      }
    }
  ]
}
```

### Order Packed Out

**Trigger**: When an order is packed
**Counts**:

- Items packed: Number of rows in `items` array (no quantity per item)
- Distinct orders: One per unique `order_uuid` or `order_id`

**Payload Structure**:

```json
{
  "webhook_type": "Order Packed Out",
  "order_uuid": "uuid",
  "order_id": "12345",
  "items": [{ "sku": "ABC123" }, { "sku": "DEF456" }]
}
```

### Tote Cleared

**Trigger**: When a tote is cleared (picking completed)
**Counts**:

- Items picked: Number of rows in `items` array
- Distinct orders: One per unique `order_id` in items

**Payload Structure**:

```json
{
  "webhook_type": "Tote Cleared",
  "items": [
    {
      "order_id": "12345",
      "line_item_id": "67890",
      "pick_id": "pick123",
      "sku": "ABC123"
    }
  ]
}
```

## Setup and Configuration

### 1. TTL Policies

Run the setup script to configure automatic cleanup:

```bash
npm run setup:ttl
```

This will provide instructions for setting up TTL policies via gcloud CLI or Firebase Console.

### 2. Environment Variables

Ensure these are set:

- `SHIPHERO_WEBHOOK_SECRET`: For HMAC verification
- `FIREBASE_PROJECT_ID`: Your Firebase project ID
- Firebase service account credentials

### 3. Firebase Collections

The system will automatically create these collections:

- `stats/{date}`: Daily analytics counters
- `dedup/{date}/{type}/{key}`: Deduplication tracking

## Usage

### Real-time Counters

The system maintains live counters that update immediately when webhooks are received. These provide "live sugar" on top of your 5-minute job reconciliation.

### Data Flow

1. Webhook received → HMAC verified → 200 response sent
2. Background processing → Deduplication check → Counter updates
3. 5-minute job runs → Overwrites with exact numbers → Self-corrects any discrepancies

### Monitoring

Check logs for:

- `📊 Updated [type] analytics counters` - Successful processing
- `💥 Failed to update [type] analytics` - Processing errors
- `⏭️ Duplicate [type] event; skipping` - Deduplication working

## Limitations

### Quantity Accuracy

- **Tote Cleared** and **Order Packed Out** webhooks don't include quantities per item
- Counts are based on number of item rows, not actual quantities
- For true quantities, enable "Tote Complete" webhooks in ShipHero

### User Attribution

- Webhooks often lack user IDs for picker/packer attribution
- Leaderboards are not updated from webhooks
- Use 5-minute GraphQL job for accurate user productivity metrics

### Reconciliation

- Webhook counters are approximate and fast
- 5-minute job provides exact numbers and overwrites webhook data
- Small UI jitters will self-correct when job runs

## Troubleshooting

### Missing Counts

1. Check webhook registration in ShipHero
2. Verify HMAC secret matches
3. Check Firebase permissions
4. Review webhook payload structure

### Duplicate Counts

1. Verify deduplication is working (check `dedup` collection)
2. Check TTL policies are set up correctly
3. Review webhook retry behavior

### Performance Issues

1. Monitor Firestore transaction limits
2. Check webhook processing queue
3. Review Firebase quotas and limits
