import crypto from "crypto";

export function computeHmacSha256Base64(secret: string, rawBodyBuffer: Buffer): string {
  return crypto.createHmac("sha256", secret).update(rawBodyBuffer).digest("base64");
}

export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  const ab = Buffer.from(a || "", "utf8");
  const bb = Buffer.from(b || "", "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
} 