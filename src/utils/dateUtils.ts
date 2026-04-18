export type DueStatus = 'none' | 'future' | 'soon' | 'overdue';

export function getDueStatus(dueAt: string | null): DueStatus {
  if (!dueAt) return 'none';
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  if (due < now) return 'overdue';
  if (due - now <= 24 * 60 * 60 * 1000) return 'soon';
  return 'future';
}

export function formatDueAt(dueAt: string): string {
  const d = new Date(dueAt);
  const now = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const timePart = `${hh}:${mm}`;
  const datePart = year !== now.getFullYear() ? `${year}/${month}/${day}` : `${month}/${day}`;
  return `${datePart} ${timePart}`;
}

export function toDatetimeLocal(isoString: string): string {
  const d = new Date(isoString);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${mi}`;
}

export function datetimeLocalToISO(local: string): string {
  return new Date(local).toISOString();
}
