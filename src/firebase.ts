import {
  initializeApp,
  applicationDefault,
  cert,
  App,
} from "firebase-admin/app";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { createLogger } from "./logger.js";

const log = createLogger("firebase");

let app: App | null = null;
let db: Firestore | null = null;

function init(): void {
  if (app) return;

  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const jsonPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  try {
    if (inlineJson) {
      const parsed = JSON.parse(inlineJson);
      const projectId = parsed.project_id || process.env.FIREBASE_PROJECT_ID;
      if (projectId && !process.env.GOOGLE_CLOUD_PROJECT) {
        process.env.GOOGLE_CLOUD_PROJECT = projectId;
      }
      app = initializeApp({ credential: cert(parsed) });

      log.info(
        { projectId: process.env.GOOGLE_CLOUD_PROJECT },
        "✅ Firebase initialized with inline service account JSON"
      );
    } else if (jsonPath && fs.existsSync(jsonPath)) {
      const fullPath = path.resolve(jsonPath);
      const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const projectId = parsed.project_id || process.env.FIREBASE_PROJECT_ID;
      if (projectId && !process.env.GOOGLE_CLOUD_PROJECT) {
        process.env.GOOGLE_CLOUD_PROJECT = projectId;
      }
      app = initializeApp({ credential: cert(parsed) });

      log.info(
        { jsonPath: fullPath, projectId: process.env.GOOGLE_CLOUD_PROJECT },
        "✅ Firebase initialized with service account file"
      );
    } else {
      // Last resort: allow explicit project id hint
      if (
        process.env.FIREBASE_PROJECT_ID &&
        !process.env.GOOGLE_CLOUD_PROJECT
      ) {
        process.env.GOOGLE_CLOUD_PROJECT = process.env.FIREBASE_PROJECT_ID;
      }
      app = initializeApp({ credential: applicationDefault() });
      log.info(
        { projectId: process.env.GOOGLE_CLOUD_PROJECT },
        "✅ Firebase initialized with Application Default Credentials"
      );
    }
  } catch (e) {
    log.error(
      { err: e },
      "💥 Firebase initialization failed; attempting ADC fallback"
    );
    if (process.env.FIREBASE_PROJECT_ID && !process.env.GOOGLE_CLOUD_PROJECT) {
      process.env.GOOGLE_CLOUD_PROJECT = process.env.FIREBASE_PROJECT_ID;
    }
    app = initializeApp({ credential: applicationDefault() });
  }

  db = getFirestore();
}

export function firestore(): Firestore {
  if (!db) {
    init();
  }
  return db!;
}

export { FieldValue };
