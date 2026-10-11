export function fmtInt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-US");
}

export function fmtPct(numerator: number, denominator: number): string {
  if (!denominator) return "n/a";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(then)) return iso;
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
