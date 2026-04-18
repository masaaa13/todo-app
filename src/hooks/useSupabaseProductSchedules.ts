import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { ProductSchedule, ProductScheduleInput } from '../types/schedule';
import type { EventType } from '../types/schedule';
import type { User } from '@supabase/supabase-js';

type ScheduleRow = {
  id: string;
  user_id: string;
  product_id: string | null;
  event_type: string;
  scheduled_at: string;
  title: string | null;
  done: boolean;
  notes: string | null;
  created_at: string;
};

function rowToSchedule(row: ScheduleRow): ProductSchedule {
  return {
    id: row.id,
    productId: row.product_id,
    eventType: row.event_type as EventType,
    scheduledAt: row.scheduled_at,
    title: row.title,
    done: row.done,
    notes: row.notes,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export function useSupabaseProductSchedules(user: User | null) {
  const [schedules, setSchedules] = useState<ProductSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !user) {
      setSchedules([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from('product_schedules')
      .select('*')
      .order('scheduled_at', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (fetchError) { setError(fetchError.message); } else { setSchedules((data as ScheduleRow[]).map(rowToSchedule)); }
        setLoading(false);
      });

    const channel = supabase
      .channel(`product_schedules-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_schedules' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const incoming = rowToSchedule(payload.new as ScheduleRow);
          setSchedules((prev) => prev.some((s) => s.id === incoming.id) ? prev : [...prev, incoming]);
        } else if (payload.eventType === 'UPDATE') {
          const updated = rowToSchedule(payload.new as ScheduleRow);
          setSchedules((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        } else if (payload.eventType === 'DELETE') {
          setSchedules((prev) => prev.filter((s) => s.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    return () => { supabase!.removeChannel(channel); };
  }, [user?.id]);

  const addSchedule = async (input: ProductScheduleInput) => {
    if (!supabase || !user) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const optimistic: ProductSchedule = { id, ...input, createdAt: Date.now() };
    setSchedules((prev) => [...prev, optimistic]);

    const { error: err } = await supabase.from('product_schedules').insert({
      id, user_id: user.id,
      product_id: input.productId,
      event_type: input.eventType,
      scheduled_at: input.scheduledAt,
      title: input.title,
      done: input.done,
      notes: input.notes,
      created_at: now,
    });
    if (err) { setSchedules((prev) => prev.filter((s) => s.id !== id)); setError(err.message); }
  };

  const toggleScheduleDone = async (id: string) => {
    if (!supabase || !user) return;
    const schedule = schedules.find((s) => s.id === id);
    if (!schedule) return;

    setSchedules((prev) => prev.map((s) => s.id === id ? { ...s, done: !s.done } : s));

    const { error: err } = await supabase.from('product_schedules').update({ done: !schedule.done }).eq('id', id);
    if (err) { setSchedules((prev) => prev.map((s) => s.id === id ? schedule : s)); setError(err.message); }
  };

  const deleteSchedule = async (id: string) => {
    if (!supabase || !user) return;
    const original = schedules.find((s) => s.id === id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));

    const { error: err } = await supabase.from('product_schedules').delete().eq('id', id);
    if (err && original) { setSchedules((prev) => [...prev, original]); setError(err.message); }
  };

  return { schedules, loading, error, addSchedule, toggleScheduleDone, deleteSchedule };
}
