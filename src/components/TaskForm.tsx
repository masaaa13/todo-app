import { useState } from 'react';
import type { TaskInput } from '../types/task';
import { PRIORITIES, PRIORITY_LABELS } from '../types/priority';
import type { Priority } from '../types/priority';
import styles from './TaskForm.module.css';

type Props = {
  onAdd: (input: TaskInput) => void;
};

export function TaskForm({ onAdd }: Props) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd({ text, priority, dueDate: dueDate || null });
    setText('');
    setPriority('medium');
    setDueDate('');
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label htmlFor="task-input" className={styles.label}>
        新しいタスク
      </label>
      <input
        id="task-input"
        className={styles.textInput}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="タスクを入力..."
        aria-label="タスクを入力"
      />
      <div className={styles.metaRow}>
        <select
          className={styles.prioritySelect}
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          aria-label="優先度"
          data-priority={priority}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}優先
            </option>
          ))}
        </select>
        <input
          type="date"
          className={styles.dateInput}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="期限日"
        />
        <button className={styles.submitButton} type="submit" disabled={!text.trim()}>
          追加
        </button>
      </div>
    </form>
  );
}
