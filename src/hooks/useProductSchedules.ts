import { isSupabaseConfigured } from '../lib/supabase';
import { useLocalStorage } from './useLocalStorage';
import { useSupabaseProductSchedules } from './useSupabaseProductSchedules';
import type { ProductSchedule, ProductScheduleInput } from '../types/schedule';
import type { User } from '@supabase/supabase-js';

function useLocalProductSchedules() {
  const [schedules, setSchedules] = useLocalStorage<ProductSchedule[]>('ec-schedules', []);

  const addSchedule = (input: ProductScheduleInput) => {
    setSchedules((prev) => [...prev, { id: crypto.randomUUID(), ...input, createdAt: Date.now() }]);
  };

  const toggleScheduleDone = (id: string) => {
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  };

  const deleteSchedule = (id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  };

  return { schedules, loading: false, error: null, addSchedule, toggleScheduleDone, deleteSchedule };
}

export function useProductSchedules(user: User | null) {
  const local = useLocalProductSchedules();
  const remote = useSupabaseProductSchedules(user);
  return isSupabaseConfigured ? remote : local;
}
