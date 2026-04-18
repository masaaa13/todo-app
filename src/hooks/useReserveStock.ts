import { isSupabaseConfigured } from '../lib/supabase';
import { useLocalStorage } from './useLocalStorage';
import { useSupabaseReserveStock } from './useSupabaseReserveStock';
import type { ReserveStock, ReserveStockInput } from '../types/reserveStock';
import type { User } from '@supabase/supabase-js';

function useLocalReserveStock() {
  const [stocks, setStocks] = useLocalStorage<ReserveStock[]>('ec-reserve-stock', []);

  const addStock = (input: ReserveStockInput) => {
    const now = Date.now();
    setStocks((prev) => [...prev, { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now }]);
  };

  const updateStock = (id: string, input: Partial<ReserveStockInput>) => {
    setStocks((prev) => prev.map((s) => (s.id === id ? { ...s, ...input, updatedAt: Date.now() } : s)));
  };

  const deleteStock = (id: string) => {
    setStocks((prev) => prev.filter((s) => s.id !== id));
  };

  return { stocks, loading: false, error: null, addStock, updateStock, deleteStock };
}

export function useReserveStock(user: User | null) {
  const local = useLocalReserveStock();
  const remote = useSupabaseReserveStock(user);
  return isSupabaseConfigured ? remote : local;
}
