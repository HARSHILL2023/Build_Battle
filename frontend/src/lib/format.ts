export function fmtInt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-US");
}

export function fmtPct(numerator: number, denominator: number): string {
  if (!denominator) return "n/a";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  // SQLite timestamps ("YYYY-MM-DD HH:MM:SS", UTC, no designator) need a
  // "Z"; MongoDB/JSON timestamps already carry one — never double it.
  const withT = iso.replace(" ", "T");
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(withT) ? withT : `${withT}Z`;
  const then = new Date(normalized).getTime();
  if (Number.isNaN(then)) return iso;
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
