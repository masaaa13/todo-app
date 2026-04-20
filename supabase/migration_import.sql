-- Phase 1: futureshop商品取込基盤
-- Run in Supabase SQL Editor

-- ── fs_products: futureshop商品マスタ ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS fs_products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_no       TEXT NOT NULL,           -- 商品番号 (親キー)
  product_url_code TEXT,                    -- 商品URLコード (futureshop親キー候補)
  name             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_no)
);

ALTER TABLE fs_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fs_products: owner" ON fs_products
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── fs_product_skus: SKUマスタ ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fs_product_skus (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fs_product_id   UUID REFERENCES fs_products(id) ON DELETE SET NULL,
  product_no      TEXT,                     -- 商品番号 (親への参照用)
  sku_no          TEXT NOT NULL,            -- 商品管理番号 (SKUキー)
  sku_name        TEXT,
  raw_data        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sku_no)
);

ALTER TABLE fs_product_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fs_product_skus: owner" ON fs_product_skus
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── fs_product_descriptions: 商品説明 ────────────────────────────────────

CREATE TABLE IF NOT EXISTS fs_product_descriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fs_product_id    UUID NOT NULL REFERENCES fs_products(id) ON DELETE CASCADE,
  description_type TEXT NOT NULL DEFAULT 'main',
  content          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fs_product_descriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fs_product_descriptions: owner" ON fs_product_descriptions
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── import_jobs: インポートジョブ ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS import_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'done',  -- reviewing/done/cancelled
  sheet_name       TEXT,
  total_rows       INTEGER NOT NULL DEFAULT 0,
  new_count        INTEGER NOT NULL DEFAULT 0,
  duplicate_count  INTEGER NOT NULL DEFAULT 0,
  diff_count       INTEGER NOT NULL DEFAULT 0,
  imported_count   INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_jobs: owner" ON import_jobs
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── import_rows: インポート行データ ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS import_rows (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sheet_name       TEXT NOT NULL,
  row_index        INTEGER NOT NULL,
  product_no       TEXT,                    -- 商品番号
  sku_no           TEXT,                    -- 商品管理番号
  product_url_code TEXT,                    -- 商品URLコード
  raw_data         JSONB NOT NULL DEFAULT '{}',
  diff_data        JSONB,                   -- 差分データ {colName: {old, new}}
  row_status       TEXT NOT NULL DEFAULT 'new',  -- new/duplicate/has_diff
  selected         BOOLEAN NOT NULL DEFAULT true,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_rows: owner" ON import_rows
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
