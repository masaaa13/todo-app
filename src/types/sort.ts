export type SortType = 'dueDate' | 'priority' | 'createdAt';

export const SORT_LABELS: Record<SortType, string> = {
  dueDate: '期限順',
  priority: '優先度順',
  createdAt: '作成順',
};
