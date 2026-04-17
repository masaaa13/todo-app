import type { Task } from '../types/task';
import type { SortType } from '../types/sort';
import { PRIORITY_ORDER } from '../types/priority';

function sortActive(active: Task[], sortBy: SortType): Task[] {
  switch (sortBy) {
    case 'priority':
      return [...active].sort(
        (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      );

    case 'createdAt':
      return [...active].sort((a, b) => a.createdAt - b.createdAt);

    case 'dueDate':
    default: {
      const withDue = active.filter((t) => t.dueDate !== null);
      const withoutDue = active.filter((t) => t.dueDate === null);

      withDue.sort((a, b) => {
        const dc = (a.dueDate as string).localeCompare(b.dueDate as string);
        if (dc !== 0) return dc;
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      });

      withoutDue.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

      return [...withDue, ...withoutDue];
    }
  }
}

export function sortTasks(tasks: Task[], sortBy: SortType = 'dueDate'): Task[] {
  const active = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  // 完了済みは完了日時が新しい順
  const sortedDone = [...done].sort((a, b) => b.updatedAt - a.updatedAt);

  return [...sortActive(active, sortBy), ...sortedDone];
}
