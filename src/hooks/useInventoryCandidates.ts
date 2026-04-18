import { isSupabaseConfigured } from '../lib/supabase';
import { useLocalStorage } from './useLocalStorage';
import { useSupabaseInventoryCandidates } from './useSupabaseInventoryCandidates';
import type { InventoryCandidate, InventoryCandidateInput } from '../types/inventoryCandidate';
import type { User } from '@supabase/supabase-js';

function useLocalInventoryCandidates() {
  const [candidates, setCandidates] = useLocalStorage<InventoryCandidate[]>('ec-candidates', []);

  const addCandidate = (input: InventoryCandidateInput) => {
    const now = Date.now();
    setCandidates((prev) => [...prev, { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now }]);
  };

  const updateCandidate = (id: string, input: Partial<InventoryCandidateInput>) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...input, updatedAt: Date.now() } : c)));
  };

  const deleteCandidate = (id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  };

  return { candidates, loading: false, error: null, addCandidate, updateCandidate, deleteCandidate };
}

export function useInventoryCandidates(user: User | null) {
  const local = useLocalInventoryCandidates();
  const remote = useSupabaseInventoryCandidates(user);
  return isSupabaseConfigured ? remote : local;
}
