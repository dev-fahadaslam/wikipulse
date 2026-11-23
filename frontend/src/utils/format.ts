export function formatRelativeTime(unixSeconds: number, nowMs: number = Date.now()): string {
  const diffSeconds = Math.max(0, Math.round(nowMs / 1000 - unixSeconds));
  if (diffSeconds < 2) return "just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta.toLocaleString()}`;
  return delta.toLocaleString();
}

export function formatMinuteLabel(bucketStartSeconds: number): string {
  const d = new Date(bucketStartSeconds * 1000);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
