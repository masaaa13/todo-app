import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Task, TaskInput } from '../types/task';
import type { Priority } from '../types/priority';
import type { User } from '@supabase/supabase-js';

type TaskRow = {
  id: string;
  text: string;
  completed: boolean;
  priority: string;
  due_at: string | null;
  reminder_offset_minutes: number | null;
  created_at: string;
  updated_at: string;
};

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    text: row.text,
    completed: row.completed,
    priority: row.priority as Priority,
    dueAt: row.due_at,
    reminderOffsetMinutes: row.reminder_offset_minutes,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export function useSupabaseTasks(user: User | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setError('Supabase が未設定です。.env.local に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。');
      setLoading(false);
      return;
    }
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (fetchError) { setError(fetchError.message); } else { setTasks((data as TaskRow[]).map(rowToTask)); }
        setLoading(false);
      });

    // Channel name scoped to user prevents cross-user leakage on shared clients
    const channel = supabase
      .channel(`tasks-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const incoming = rowToTask(payload.new as TaskRow);
          setTasks((prev) => prev.some((t) => t.id === incoming.id) ? prev : [...prev, incoming]);
        } else if (payload.eventType === 'UPDATE') {
          const updated = rowToTask(payload.new as TaskRow);
          setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        } else if (payload.eventType === 'DELETE') {
          setTasks((prev) => prev.filter((t) => t.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    return () => { supabase!.removeChannel(channel); };
  }, [user?.id]);

  const addTask = async ({ text, priority, dueAt, reminderOffsetMinutes }: TaskInput) => {
    if (!supabase || !user) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const optimistic: Task = { id, text: trimmed, completed: false, priority, dueAt, reminderOffsetMinutes, createdAt: Date.now(), updatedAt: Date.now() };
    setTasks((prev) => [...prev, optimistic]);

    const { error: err } = await supabase.from('tasks').insert({
      id, user_id: user.id, text: trimmed, completed: false, priority,
      due_at: dueAt, reminder_offset_minutes: reminderOffsetMinutes,
      created_at: now, updated_at: now,
    });
    if (err) { setTasks((prev) => prev.filter((t) => t.id !== id)); setError(err.message); }
  };

  const toggleTask = async (id: string) => {
    if (!supabase || !user) return;
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed: !t.completed, updatedAt: Date.now() } : t));

    const { error: err } = await supabase.from('tasks').update({ completed: !task.completed, updated_at: new Date().toISOString() }).eq('id', id);
    if (err) { setTasks((prev) => prev.map((t) => t.id === id ? task : t)); setError(err.message); }
  };

  const deleteTask = async (id: string) => {
    if (!supabase || !user) return;
    const original = tasks.find((t) => t.id === id);

    setTasks((prev) => prev.filter((t) => t.id !== id));

    const { error: err } = await supabase.from('tasks').delete().eq('id', id);
    if (err && original) { setTasks((prev) => [...prev, original]); setError(err.message); }
  };

  const editTask = async (id: string, { text, priority, dueAt, reminderOffsetMinutes }: TaskInput) => {
    if (!supabase || !user) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const original = tasks.find((t) => t.id === id);

    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, text: trimmed, priority, dueAt, reminderOffsetMinutes, updatedAt: Date.now() } : t));

    const { error: err } = await supabase.from('tasks').update({
      text: trimmed, priority, due_at: dueAt,
      reminder_offset_minutes: reminderOffsetMinutes, updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (err && original) { setTasks((prev) => prev.map((t) => t.id === id ? original : t)); setError(err.message); }
  };

  const clearCompleted = async () => {
    if (!supabase || !user) return;
    const ids = tasks.filter((t) => t.completed).map((t) => t.id);
    if (!ids.length) return;

    setTasks((prev) => prev.filter((t) => !t.completed));

    const { error: err } = await supabase.from('tasks').delete().in('id', ids);
    if (err) setError(err.message);
  };

  return { tasks, loading, error, addTask, toggleTask, deleteTask, editTask, clearCompleted };
}
