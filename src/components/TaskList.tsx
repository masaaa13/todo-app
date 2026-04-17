import type { Task, TaskInput } from '../types/task';
import type { FilterType } from '../types/filter';
import { TaskItem } from './TaskItem';
import styles from './TaskList.module.css';

const FILTER_EMPTY: Record<FilterType, { heading: string; sub: string }> = {
  all: { heading: 'タスクがありません', sub: '上のフォームから最初のタスクを追加してください。' },
  active: { heading: '未完了のタスクはありません', sub: 'すべてのタスクが完了しています。' },
  done: { heading: '完了済みのタスクはありません', sub: 'タスクを完了するとここに表示されます。' },
};

type Props = {
  tasks: Task[];
  filter: FilterType;
  totalCount: number;
  searchQuery: string;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, input: TaskInput) => void;
};

export function TaskList({ tasks, filter, totalCount, searchQuery, onToggle, onDelete, onEdit }: Props) {
  if (tasks.length === 0) {
    if (searchQuery.trim()) {
      return (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🔍</span>
          <p className={styles.emptyHeading}>「{searchQuery}」に一致するタスクがありません</p>
          <p className={styles.emptySub}>別のキーワードで検索してみてください。</p>
        </div>
      );
    }

    const msg = FILTER_EMPTY[filter];
    const isFiltered = filter !== 'all' && totalCount > 0;
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>{isFiltered ? '📭' : '📋'}</span>
        <p className={styles.emptyHeading}>{msg.heading}</p>
        <p className={styles.emptySub}>{msg.sub}</p>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />
      ))}
    </ul>
  );
}
