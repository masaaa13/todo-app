import { isSupabaseConfigured } from '../lib/supabase';
import { useSupabaseTasks } from './useSupabaseTasks';
import { useLocalTasks } from './useLocalTasks';
import type { User } from '@supabase/supabase-js';

// Both hooks are always called (Rules of Hooks compliance).
// isSupabaseConfigured is constant at module load time — no conditional hook per render.
export function useTasks(user: User | null) {
  const local = useLocalTasks();
  const remote = useSupabaseTasks(user);
  return isSupabaseConfigured ? remote : local;
}
