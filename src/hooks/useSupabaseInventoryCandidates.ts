import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { InventoryCandidate, InventoryCandidateInput } from '../types/inventoryCandidate';
import type { CandidatePriority, CandidateStatus } from '../types/inventoryCandidate';
import type { User } from '@supabase/supabase-js';

type CandidateRow = {
  id: string;
  user_id: string;
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  priority: string;
  reason: string | null;
  status: string;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

function rowToCandidate(row: CandidateRow): InventoryCandidate {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productSku: row.product_sku,
    priority: row.priority as CandidatePriority,
    reason: row.reason,
    status: row.status as CandidateStatus,
    comment: row.comment,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export function useSupabaseInventoryCandidates(user: User | null) {
  const [candidates, setCandidates] = useState<InventoryCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !user) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from('inventory_candidates')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (fetchError) { setError(fetchError.message); } else { setCandidates((data as CandidateRow[]).map(rowToCandidate)); }
        setLoading(false);
      });

    const channel = supabase
      .channel(`inventory_candidates-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_candidates' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const incoming = rowToCandidate(payload.new as CandidateRow);
          setCandidates((prev) => prev.some((c) => c.id === incoming.id) ? prev : [...prev, incoming]);
        } else if (payload.eventType === 'UPDATE') {
          const updated = rowToCandidate(payload.new as CandidateRow);
          setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        } else if (payload.eventType === 'DELETE') {
          setCandidates((prev) => prev.filter((c) => c.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    return () => { supabase!.removeChannel(channel); };
  }, [user?.id]);

  const addCandidate = async (input: InventoryCandidateInput) => {
    if (!supabase || !user) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const optimistic: InventoryCandidate = { id, ...input, createdAt: Date.now(), updatedAt: Date.now() };
    setCandidates((prev) => [...prev, optimistic]);

    const { error: err } = await supabase.from('inventory_candidates').insert({
      id, user_id: user.id,
      product_id: input.productId,
      product_name: input.productName,
      product_sku: input.productSku,
      priority: input.priority,
      reason: input.reason,
      status: input.status,
      comment: input.comment,
      created_at: now, updated_at: now,
    });
    if (err) { setCandidates((prev) => prev.filter((c) => c.id !== id)); setError(err.message); }
  };

  const updateCandidate = async (id: string, input: Partial<InventoryCandidateInput>) => {
    if (!supabase || !user) return;
    const original = candidates.find((c) => c.id === id);
    setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, ...input, updatedAt: Date.now() } : c));

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.productId !== undefined) patch.product_id = input.productId;
    if (input.productName !== undefined) patch.product_name = input.productName;
    if (input.productSku !== undefined) patch.product_sku = input.productSku;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.reason !== undefined) patch.reason = input.reason;
    if (input.status !== undefined) patch.status = input.status;
    if (input.comment !== undefined) patch.comment = input.comment;

    const { error: err } = await supabase.from('inventory_candidates').update(patch).eq('id', id);
    if (err && original) { setCandidates((prev) => prev.map((c) => c.id === id ? original : c)); setError(err.message); }
  };

  const deleteCandidate = async (id: string) => {
    if (!supabase || !user) return;
    const original = candidates.find((c) => c.id === id);
    setCandidates((prev) => prev.filter((c) => c.id !== id));

    const { error: err } = await supabase.from('inventory_candidates').delete().eq('id', id);
    if (err && original) { setCandidates((prev) => [...prev, original]); setError(err.message); }
  };

  return { candidates, loading, error, addCandidate, updateCandidate, deleteCandidate };
}
