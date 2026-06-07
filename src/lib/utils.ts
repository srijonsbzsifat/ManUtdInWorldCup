// Small utility helpers used throughout the UI.

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...opts,
  }).format(date);
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

export function formatTimeLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function formatDateTimeLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function relativeTime(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(iso);
}

export function ratingColor(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return "bg-white/10 text-white/60";
  if (rating >= 8.0) return "bg-emerald-500 text-emerald-950";
  if (rating >= 7.0) return "bg-emerald-500/80 text-emerald-950";
  if (rating >= 6.5) return "bg-lime-500/80 text-lime-950";
  if (rating >= 6.0) return "bg-yellow-500 text-yellow-950";
  if (rating >= 5.0) return "bg-orange-500 text-orange-950";
  return "bg-red-500 text-white";
}

export function ratingLabel(rating: number | null | undefined): string {
  if (rating === null || rating === undefined) return "N/A";
  if (rating >= 8.5) return "Outstanding";
  if (rating >= 7.5) return "Great";
  if (rating >= 7.0) return "Good";
  if (rating >= 6.5) return "Solid";
  if (rating >= 6.0) return "Average";
  if (rating >= 5.0) return "Below par";
  return "Poor";
}
