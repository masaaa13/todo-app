function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isOverdue(dueDate: string): boolean {
  return dueDate < todayStr();
}

export function isToday(dueDate: string): boolean {
  return dueDate === todayStr();
}

export function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split('-').map(Number);
  const currentYear = new Date().getFullYear();
  return year !== currentYear ? `${year}/${month}/${day}` : `${month}/${day}`;
}

export type DueStatus = 'none' | 'future' | 'today' | 'overdue';

export function getDueStatus(dueDate: string | null): DueStatus {
  if (!dueDate) return 'none';
  if (isOverdue(dueDate)) return 'overdue';
  if (isToday(dueDate)) return 'today';
  return 'future';
}
