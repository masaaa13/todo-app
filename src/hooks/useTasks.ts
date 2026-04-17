import { isSupabaseConfigured } from '../lib/supabase';
import { useSupabaseTasks } from './useSupabaseTasks';
import { useLocalTasks } from './useLocalTasks';

// isSupabaseConfigured is evaluated once at module load time (not per render),
// so the same hook function is always assigned — no Rules of Hooks violation.
export const useTasks = isSupabaseConfigured ? useSupabaseTasks : useLocalTasks;
