import type { Task } from '../types/task';
import type { FilterType } from '../types/filter';

export function applyFilter(tasks: Task[], filter: FilterType): Task[] {
  if (filter === 'active') return tasks.filter((t) => !t.completed);
  if (filter === 'done') return tasks.filter((t) => t.completed);
  return tasks;
}

export function applySearch(tasks: Task[], query: string): Task[] {
  const q = query.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter((t) => t.text.toLowerCase().includes(q));
}
