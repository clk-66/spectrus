const ONE_MINUTE = 60_000;
const ONE_HOUR   = 3_600_000;

/** "Today at 3:45 PM" / "Yesterday at…" / "Jan 5, 2025 at…" */
export function formatRelative(iso: string): string {
  const then = new Date(iso);
  const now  = new Date();
  const diff = now.getTime() - then.getTime();

  if (diff < ONE_MINUTE) return 'Just now';

  if (diff < ONE_HOUR) {
    const m = Math.floor(diff / ONE_MINUTE);
    return `${m}m ago`;
  }

  const timeStr = then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (now.toDateString() === then.toDateString()) {
    return `Today at ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === then.toDateString()) {
    return `Yesterday at ${timeStr}`;
  }

  return formatAbsolute(iso);
}

/** "Jan 5, 2025, 3:45 PM" */
export function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
    hour:  'numeric',
    minute:'2-digit',
  });
}

/** "3:45 PM" — short time for hover timestamp on continuation rows */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour:   'numeric',
    minute: '2-digit',
  });
}
