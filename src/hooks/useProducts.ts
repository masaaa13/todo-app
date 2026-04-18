import { isSupabaseConfigured } from '../lib/supabase';
import { useLocalStorage } from './useLocalStorage';
import { useSupabaseProducts } from './useSupabaseProducts';
import type { Product, ProductInput } from '../types/product';
import type { User } from '@supabase/supabase-js';

function useLocalProducts() {
  const [products, setProducts] = useLocalStorage<Product[]>('ec-products', []);

  const addProduct = (input: ProductInput) => {
    const now = Date.now();
    setProducts((prev) => [...prev, { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now }]);
  };

  const updateProduct = (id: string, input: Partial<ProductInput>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...input, updatedAt: Date.now() } : p)));
  };

  const deleteProduct = (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  return { products, loading: false, error: null, addProduct, updateProduct, deleteProduct };
}

export function useProducts(user: User | null) {
  const local = useLocalProducts();
  const remote = useSupabaseProducts(user);
  return isSupabaseConfigured ? remote : local;
}
