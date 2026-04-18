import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { ReserveStock, ReserveStockInput } from '../types/reserveStock';
import type { StockType } from '../types/reserveStock';
import type { User } from '@supabase/supabase-js';

type StockRow = {
  id: string;
  user_id: string;
  product_id: string;
  stock_type: string;
  quantity: number | null;
  delivery_date: string | null;
  futureshop_required: boolean;
  futureshop_planned_date: string | null;
  futureshop_completed_date: string | null;
  switch_pending: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToStock(row: StockRow): ReserveStock {
  return {
    id: row.id,
    productId: row.product_id,
    stockType: row.stock_type as StockType,
    quantity: row.quantity,
    deliveryDate: row.delivery_date,
    futureshopRequired: row.futureshop_required,
    futureshopPlannedDate: row.futureshop_planned_date,
    futureshopCompletedDate: row.futureshop_completed_date,
    switchPending: row.switch_pending,
    notes: row.notes,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export function useSupabaseReserveStock(user: User | null) {
  const [stocks, setStocks] = useState<ReserveStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !user) {
      setStocks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from('reserve_stock')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (fetchError) { setError(fetchError.message); } else { setStocks((data as StockRow[]).map(rowToStock)); }
        setLoading(false);
      });

    const channel = supabase
      .channel(`reserve_stock-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reserve_stock' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const incoming = rowToStock(payload.new as StockRow);
          setStocks((prev) => prev.some((s) => s.id === incoming.id) ? prev : [...prev, incoming]);
        } else if (payload.eventType === 'UPDATE') {
          const updated = rowToStock(payload.new as StockRow);
          setStocks((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        } else if (payload.eventType === 'DELETE') {
          setStocks((prev) => prev.filter((s) => s.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    return () => { supabase!.removeChannel(channel); };
  }, [user?.id]);

  const addStock = async (input: ReserveStockInput) => {
    if (!supabase || !user) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const optimistic: ReserveStock = { id, ...input, createdAt: Date.now(), updatedAt: Date.now() };
    setStocks((prev) => [...prev, optimistic]);

    const { error: err } = await supabase.from('reserve_stock').insert({
      id, user_id: user.id,
      product_id: input.productId,
      stock_type: input.stockType,
      quantity: input.quantity,
      delivery_date: input.deliveryDate,
      futureshop_required: input.futureshopRequired,
      futureshop_planned_date: input.futureshopPlannedDate,
      futureshop_completed_date: input.futureshopCompletedDate,
      switch_pending: input.switchPending,
      notes: input.notes,
      created_at: now, updated_at: now,
    });
    if (err) { setStocks((prev) => prev.filter((s) => s.id !== id)); setError(err.message); }
  };

  const updateStock = async (id: string, input: Partial<ReserveStockInput>) => {
    if (!supabase || !user) return;
    const original = stocks.find((s) => s.id === id);
    setStocks((prev) => prev.map((s) => s.id === id ? { ...s, ...input, updatedAt: Date.now() } : s));

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.stockType !== undefined) patch.stock_type = input.stockType;
    if (input.quantity !== undefined) patch.quantity = input.quantity;
    if (input.deliveryDate !== undefined) patch.delivery_date = input.deliveryDate;
    if (input.futureshopRequired !== undefined) patch.futureshop_required = input.futureshopRequired;
    if (input.futureshopPlannedDate !== undefined) patch.futureshop_planned_date = input.futureshopPlannedDate;
    if (input.futureshopCompletedDate !== undefined) patch.futureshop_completed_date = input.futureshopCompletedDate;
    if (input.switchPending !== undefined) patch.switch_pending = input.switchPending;
    if (input.notes !== undefined) patch.notes = input.notes;

    const { error: err } = await supabase.from('reserve_stock').update(patch).eq('id', id);
    if (err && original) { setStocks((prev) => prev.map((s) => s.id === id ? original : s)); setError(err.message); }
  };

  const deleteStock = async (id: string) => {
    if (!supabase || !user) return;
    const original = stocks.find((s) => s.id === id);
    setStocks((prev) => prev.filter((s) => s.id !== id));

    const { error: err } = await supabase.from('reserve_stock').delete().eq('id', id);
    if (err && original) { setStocks((prev) => [...prev, original]); setError(err.message); }
  };

  return { stocks, loading, error, addStock, updateStock, deleteStock };
}
