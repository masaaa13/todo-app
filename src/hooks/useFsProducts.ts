import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { FsProduct, FsProductSku } from '../types/fsProduct';
import type { User } from '@supabase/supabase-js';

type ProductRow = {
  id: string; user_id: string; product_no: string;
  product_url_code: string | null; name: string | null;
  created_at: string; updated_at: string;
};

type SkuRow = {
  id: string; user_id: string; fs_product_id: string | null;
  product_no: string | null; sku_no: string; sku_name: string | null;
  raw_data: Record<string, string>;
  created_at: string; updated_at: string;
};

function rowToProduct(r: ProductRow): FsProduct {
  return {
    id: r.id, userId: r.user_id, productNo: r.product_no,
    productUrlCode: r.product_url_code, name: r.name,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  };
}

function rowToSku(r: SkuRow): FsProductSku {
  return {
    id: r.id, userId: r.user_id, fsProductId: r.fs_product_id,
    productNo: r.product_no, skuNo: r.sku_no, skuName: r.sku_name,
    rawData: r.raw_data ?? {},
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  };
}

export function useFsProducts(user: User | null) {
  const [products, setProducts] = useState<FsProduct[]>([]);
  const [skus, setSkus] = useState<FsProductSku[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !user) { setLoading(false); return; }

    setLoading(true);
    Promise.all([
      supabase.from('fs_products').select('*').order('product_no'),
      supabase.from('fs_product_skus').select('*').order('sku_no'),
    ]).then(([{ data: pData, error: pErr }, { data: sData, error: sErr }]) => {
      if (!pErr && pData) setProducts((pData as ProductRow[]).map(rowToProduct));
      if (!sErr && sData) setSkus((sData as SkuRow[]).map(rowToSku));
      setLoading(false);
    });
  }, [user?.id]);

  const refresh = async () => {
    if (!supabase || !user) return;
    const [{ data: pData }, { data: sData }] = await Promise.all([
      supabase.from('fs_products').select('*').order('product_no'),
      supabase.from('fs_product_skus').select('*').order('sku_no'),
    ]);
    if (pData) setProducts((pData as ProductRow[]).map(rowToProduct));
    if (sData) setSkus((sData as SkuRow[]).map(rowToSku));
  };

  return { products, skus, loading, refresh };
}
