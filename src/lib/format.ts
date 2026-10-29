const LAGOS = "Africa/Lagos";

export function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: LAGOS,
  }).format(date);
}

export function formatDateShort(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const now = new Date();
  const sameDay =
    new Intl.DateTimeFormat("en-NG", { timeZone: LAGOS, dateStyle: "short" }).format(date) ===
    new Intl.DateTimeFormat("en-NG", { timeZone: LAGOS, dateStyle: "short" }).format(now);

  if (sameDay) {
    return new Intl.DateTimeFormat("en-NG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: LAGOS,
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    timeZone: LAGOS,
  }).format(date);
}

export function relativeToday(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: LAGOS,
  }).format(date);
}
