import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Product, ProductInput } from '../types/product';
import type { ProductCategory, RegistrationStatus } from '../types/product';
import type { User } from '@supabase/supabase-js';

type ProductRow = {
  id: string;
  user_id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string;
  launch_date: string | null;
  release_date: string | null;
  reservation_start: string | null;
  reservation_end: string | null;
  futureshop_status: string;
  zozo_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    category: row.category as ProductCategory,
    launchDate: row.launch_date,
    releaseDate: row.release_date,
    reservationStart: row.reservation_start,
    reservationEnd: row.reservation_end,
    futureshopStatus: row.futureshop_status as RegistrationStatus,
    zozoStatus: row.zozo_status as RegistrationStatus,
    notes: row.notes,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export function useSupabaseProducts(user: User | null) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !user) {
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (fetchError) { setError(fetchError.message); } else { setProducts((data as ProductRow[]).map(rowToProduct)); }
        setLoading(false);
      });

    const channel = supabase
      .channel(`products-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const incoming = rowToProduct(payload.new as ProductRow);
          setProducts((prev) => prev.some((p) => p.id === incoming.id) ? prev : [...prev, incoming]);
        } else if (payload.eventType === 'UPDATE') {
          const updated = rowToProduct(payload.new as ProductRow);
          setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        } else if (payload.eventType === 'DELETE') {
          setProducts((prev) => prev.filter((p) => p.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    return () => { supabase!.removeChannel(channel); };
  }, [user?.id]);

  const addProduct = async (input: ProductInput) => {
    if (!supabase || !user) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const optimistic: Product = { id, ...input, createdAt: Date.now(), updatedAt: Date.now() };
    setProducts((prev) => [...prev, optimistic]);

    const { error: err } = await supabase.from('products').insert({
      id, user_id: user.id,
      sku: input.sku, name: input.name, brand: input.brand, category: input.category,
      launch_date: input.launchDate, release_date: input.releaseDate,
      reservation_start: input.reservationStart, reservation_end: input.reservationEnd,
      futureshop_status: input.futureshopStatus, zozo_status: input.zozoStatus,
      notes: input.notes, created_at: now, updated_at: now,
    });
    if (err) { setProducts((prev) => prev.filter((p) => p.id !== id)); setError(err.message); }
  };

  const updateProduct = async (id: string, input: Partial<ProductInput>) => {
    if (!supabase || !user) return;
    const original = products.find((p) => p.id === id);
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, ...input, updatedAt: Date.now() } : p));

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.sku !== undefined) patch.sku = input.sku;
    if (input.name !== undefined) patch.name = input.name;
    if (input.brand !== undefined) patch.brand = input.brand;
    if (input.category !== undefined) patch.category = input.category;
    if (input.launchDate !== undefined) patch.launch_date = input.launchDate;
    if (input.releaseDate !== undefined) patch.release_date = input.releaseDate;
    if (input.reservationStart !== undefined) patch.reservation_start = input.reservationStart;
    if (input.reservationEnd !== undefined) patch.reservation_end = input.reservationEnd;
    if (input.futureshopStatus !== undefined) patch.futureshop_status = input.futureshopStatus;
    if (input.zozoStatus !== undefined) patch.zozo_status = input.zozoStatus;
    if (input.notes !== undefined) patch.notes = input.notes;

    const { error: err } = await supabase.from('products').update(patch).eq('id', id);
    if (err && original) { setProducts((prev) => prev.map((p) => p.id === id ? original : p)); setError(err.message); }
  };

  const deleteProduct = async (id: string) => {
    if (!supabase || !user) return;
    const original = products.find((p) => p.id === id);
    setProducts((prev) => prev.filter((p) => p.id !== id));

    const { error: err } = await supabase.from('products').delete().eq('id', id);
    if (err && original) { setProducts((prev) => [...prev, original]); setError(err.message); }
  };

  return { products, loading, error, addProduct, updateProduct, deleteProduct };
}
