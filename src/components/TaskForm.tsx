import { useState } from 'react';
import type { TaskInput } from '../types/task';
import { PRIORITIES, PRIORITY_LABELS } from '../types/priority';
import type { Priority } from '../types/priority';
import { REMINDER_OPTIONS } from '../types/reminder';
import { datetimeLocalToISO } from '../utils/dateUtils';
import styles from './TaskForm.module.css';

type Props = {
  onAdd: (input: TaskInput) => void;
};

export function TaskForm({ onAdd }: Props) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueAt, setDueAt] = useState('');
  const [reminderOffsetMinutes, setReminderOffsetMinutes] = useState<number | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd({
      text,
      priority,
      dueAt: dueAt ? datetimeLocalToISO(dueAt) : null,
      reminderOffsetMinutes: dueAt ? reminderOffsetMinutes : null,
    });
    setText('');
    setPriority('medium');
    setDueAt('');
    setReminderOffsetMinutes(null);
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
          type="datetime-local"
          className={styles.dateInput}
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          aria-label="期限日時"
        />
        <select
          className={styles.reminderSelect}
          value={reminderOffsetMinutes ?? ''}
          onChange={(e) => setReminderOffsetMinutes(e.target.value === '' ? null : Number(e.target.value))}
          disabled={!dueAt}
          aria-label="リマインダー"
        >
          {REMINDER_OPTIONS.map((opt) => (
            <option key={String(opt.value)} value={opt.value ?? ''}>
              {opt.label}
            </option>
          ))}
        </select>
        <button className={styles.submitButton} type="submit" disabled={!text.trim()}>
          追加
        </button>
      </div>
    </form>
  );
}
