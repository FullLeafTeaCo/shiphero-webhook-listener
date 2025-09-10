const TZ = "America/Los_Angeles";

function toDateInTz(d?: string | number | Date, tz: string = TZ): Date {
  const date = d ? new Date(d) : new Date();
  // Convert to same instant, but we will format in tz using Intl
  return date;
}

export function todayYmd(tz: string = TZ, at?: string | number | Date): string {
  const d = toDateInTz(at, tz);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA gives YYYY-MM-DD
  return fmt.format(d);
}

export function hourLabel(tz: string = TZ, at?: string | number | Date): string {
  const d = toDateInTz(at, tz);
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  })
    .formatToParts(d)
    .find((p) => p.type === "hour")?.value;
  const h = hour ?? "00";
  return `${h}:00`;
}

export function nowIso(tz: string = TZ): string {
  return new Date().toISOString();
}

export const DEFAULT_TZ = TZ;

