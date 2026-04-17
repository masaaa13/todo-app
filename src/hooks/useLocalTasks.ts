import { useLocalStorage } from './useLocalStorage';
import type { Task, TaskInput } from '../types/task';

export function useLocalTasks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawTasks, setTasks] = useLocalStorage<any[]>('todo-tasks', []);

  const tasks: Task[] = rawTasks.map((t) => ({
    priority: 'medium',
    dueDate: null,
    updatedAt: t.createdAt,
    ...t,
  }));

  const addTask = ({ text, priority, dueDate }: TaskInput) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = Date.now();
    setTasks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: trimmed, completed: false, priority, dueDate, createdAt: now, updatedAt: now },
    ]);
  };

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed, updatedAt: Date.now() } : t))
    );
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const editTask = (id: string, { text, priority, dueDate }: TaskInput) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, text: trimmed, priority, dueDate, updatedAt: Date.now() } : t))
    );
  };

  const clearCompleted = () => {
    setTasks((prev) => prev.filter((t) => !t.completed));
  };

  return { tasks, loading: false as const, error: null as null, addTask, toggleTask, deleteTask, editTask, clearCompleted };
}
