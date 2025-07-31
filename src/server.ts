import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { createLogger } from "./logger.js";
import { computeHmacSha256Base64, safeEqual } from "./hmac.js";
import { WorkQueue } from "./queue.js";
import { handleInventoryChange } from "./handlers/inventoryChange.js";
import { handleInventoryUpdate } from "./handlers/inventoryUpdate.js";
import { handleToteCleared } from "./handlers/toteCleared.js";
import { handleOrderPackedOut } from "./handlers/orderPackedOut.js";

// Extend Express Request interface to include our custom rawBody property
interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

dotenv.config();
const app = express();
const log = createLogger("server");
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.SHIPHERO_WEBHOOK_SECRET;

// Capture RAW body so we can compute HMAC before parsing JSON
app.use(express.json({
  verify: (req: WebhookRequest, _res: Response, buf: Buffer) => { 
    req.rawBody = buf; 
  }
}));

const workQueue = new WorkQueue({ concurrency: 8 });

app.get("/healthz", (_req: Request, res: Response) => res.status(200).send("ok"));

// Single entrypoint for all ShipHero webhooks
app.post("/webhooks/shiphero", async (req: WebhookRequest, res: Response): Promise<void> => {
  const startTime = Date.now();
  
  try {
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const sigHeader = req.header("x-shiphero-hmac-sha256");
    const computedSig = computeHmacSha256Base64(WEBHOOK_SECRET!, rawBody);
    const payload: any = req.body || {};
    const type: string = payload?.webhook_type;

    log.info({ 
      type, 
      hasSignature: !!sigHeader,
      payloadSize: rawBody.length,
      userAgent: req.header("user-agent")
    }, `🎣 Webhook received: ${type}`);

    if (!sigHeader || !safeEqual(sigHeader, computedSig)) {
      log.warn({ type, sigHeader, computedSig }, `❌ Invalid webhook signature for ${type}`);
      res.status(401).json({ code: "401", Status: "Invalid signature" });
      return;
    }

    // ACK FAST — ShipHero expects a quick 200 + JSON body
    res.status(200).json({ code: "200", Status: "Success" });
    
    log.info({ type, responseTime: Date.now() - startTime }, `✅ Webhook acknowledged: ${type} (${Date.now() - startTime}ms)`);

    // Enqueue async work
    workQueue.push(async () => {
      try {
        log.info({ type }, `🔄 Processing webhook: ${type}`);
        
        switch (type) {
          case "Inventory Change":
            await handleInventoryChange(payload);
            break;
          case "Inventory Update":
            await handleInventoryUpdate(payload);
            break;
          case "Tote Cleared":
            await handleToteCleared(payload);
            break;
          case "Order Packed Out":
            await handleOrderPackedOut(payload);
            break;
          default:
            log.warn({ type, payload }, `⚠️ Unhandled webhook_type: ${type}`);
        }
        
        log.info({ type }, `✅ Webhook processed successfully: ${type}`);
      } catch (handlerError) {
        log.error({ type, error: handlerError }, `💥 Webhook handler error: ${type}`);
      }
    });
  } catch (err) {
    log.error({ err }, "💥 Webhook endpoint error");
    // If we failed before ack, return a non-200 to trigger a retry from ShipHero
    if (!res.headersSent) {
      res.status(500).json({ code: "500", Status: "Error" });
      return;
    }
  }
});

app.listen(PORT, () => {
  log.info({ PORT }, "Listening");
}); 