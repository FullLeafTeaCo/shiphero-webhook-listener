// utils/safeSeg.ts
export function safeSeg(input: unknown): string {
  const s = String(input ?? "");
  const enc = encodeURIComponent(s);
  return enc.length > 700 ? enc.slice(0, 700) + "__trunc" : enc;
}
