import { useState, useRef, useEffect } from 'react';
import type { Task, TaskInput } from '../types/task';
import { PRIORITIES, PRIORITY_LABELS } from '../types/priority';
import type { Priority } from '../types/priority';
import { getDueStatus, formatDueDate } from '../utils/dateUtils';
import styles from './TaskItem.module.css';

type Props = {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, input: TaskInput) => void;
};

const DUE_LABELS = { overdue: '期限切れ', today: '今日', future: '', none: '' } as const;

export function TaskItem({ task, onToggle, onDelete, onEdit }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [editPriority, setEditPriority] = useState<Priority>(task.priority);
  const [editDueDate, setEditDueDate] = useState(task.dueDate ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const checkboxId = `task-cb-${task.id}`;

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const handleEditStart = () => {
    setEditText(task.text);
    setEditPriority(task.priority);
    setEditDueDate(task.dueDate ?? '');
    setIsEditing(true);
  };

  const handleSave = () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    onEdit(task.id, { text: trimmed, priority: editPriority, dueDate: editDueDate || null });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  const dueStatus = getDueStatus(task.dueDate);
  const dueLabel = DUE_LABELS[dueStatus];

  if (isEditing) {
    return (
      <li className={styles.item} data-editing>
        <div className={styles.editWrapper}>
          <input
            ref={inputRef}
            className={styles.editInput}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="タスクを入力..."
            aria-label="タスクを編集"
          />
          <div className={styles.editMeta}>
            <select
              className={styles.editSelect}
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value as Priority)}
              aria-label="優先度"
              data-priority={editPriority}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}優先
                </option>
              ))}
            </select>
            <input
              type="date"
              className={styles.editDate}
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              aria-label="期限日"
            />
            <div className={styles.editActions}>
              <button
                className={styles.saveButton}
                onClick={handleSave}
                disabled={!editText.trim()}
              >
                保存
              </button>
              <button className={styles.cancelButton} onClick={handleCancel} aria-label="キャンセル">
                ×
              </button>
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      className={styles.item}
      data-done={task.completed || undefined}
      data-due-status={!task.completed && dueStatus !== 'none' ? dueStatus : undefined}
    >
      <input
        id={checkboxId}
        type="checkbox"
        className={styles.checkbox}
        checked={task.completed}
        onChange={() => onToggle(task.id)}
        aria-label={`${task.text}を完了にする`}
      />
      <div className={styles.body}>
        <div className={styles.topRow}>
          <label htmlFor={checkboxId} className={styles.textLabel}>
            <span className={task.completed ? styles.textDone : styles.text}>
              {task.text}
            </span>
          </label>
          <div className={styles.actions}>
            <button
              className={styles.editButton}
              onClick={handleEditStart}
              aria-label={`${task.text}を編集`}
            >
              編集
            </button>
            <button
              className={styles.deleteButton}
              onClick={() => onDelete(task.id)}
              aria-label={`${task.text}を削除`}
            >
              削除
            </button>
          </div>
        </div>
        <div className={styles.meta}>
          <span className={styles.priorityBadge} data-priority={task.priority}>
            {PRIORITY_LABELS[task.priority]}
          </span>
          {task.dueDate && (
            <span className={styles.dueBadge} data-due-status={dueStatus}>
              〆 {formatDueDate(task.dueDate)}
              {dueLabel && <span className={styles.dueLabel}>{dueLabel}</span>}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
