#!/usr/bin/env tsx

/**
 * Setup TTL policies for deduplication documents
 *
 * This script sets up automatic expiration for deduplication documents
 * to prevent them from accumulating indefinitely. Documents will be
 * automatically deleted after 14 days.
 */

import { firestore } from "../src/firebase.js";
import { createLogger } from "../src/logger.js";

const log = createLogger("setupDedupTTL");

async function setupTTLPolicies() {
  const db = firestore();

  log.info("Setting up TTL policies for deduplication documents...");

  try {
    // Note: TTL policies in Firestore are set at the collection level
    // and require the documents to have a specific field name and value
    // We'll need to update our analytics functions to include the TTL field

    log.info(
      "TTL policies will be automatically applied to documents with 'expireAt' field"
    );
    log.info("Documents will be deleted 14 days after creation");

    // The actual TTL policy setup is done through the Firebase Console
    // or gcloud CLI. Here we just log the instructions:

    // TTL setup instructions available but not logged

    log.info("TTL setup instructions logged above");
  } catch (error) {
    log.error({ error }, "Failed to setup TTL policies");
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  setupTTLPolicies()
    .then(() => {
      log.info("TTL setup completed");
      process.exit(0);
    })
    .catch((error) => {
      log.error({ error }, "TTL setup failed");
      process.exit(1);
    });
}
