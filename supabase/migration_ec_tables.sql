-- EC tables: products, product_schedules, inventory_candidates, reserve_stock
-- Run in Supabase SQL Editor

-- ── products ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sku                  TEXT NOT NULL,
  name                 TEXT NOT NULL,
  brand                TEXT,
  category             TEXT NOT NULL DEFAULT 'normal',
  launch_date          DATE,
  release_date         DATE,
  reservation_start    DATE,
  reservation_end      DATE,
  futureshop_status    TEXT NOT NULL DEFAULT 'pending',
  zozo_status          TEXT NOT NULL DEFAULT 'pending',
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products: owner access" ON products
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── product_schedules ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  scheduled_at  DATE NOT NULL,
  title         TEXT,
  done          BOOLEAN NOT NULL DEFAULT false,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE product_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_schedules: owner access" ON product_schedules
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── inventory_candidates ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_candidates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name  TEXT,
  product_sku   TEXT,
  priority      TEXT NOT NULL DEFAULT 'medium',
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'B',
  comment       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE inventory_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_candidates: owner access" ON inventory_candidates
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── reserve_stock ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reserve_stock (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id                 UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock_type                 TEXT NOT NULL DEFAULT 'additional',
  quantity                   INTEGER,
  delivery_date              DATE,
  futureshop_required        BOOLEAN NOT NULL DEFAULT false,
  futureshop_planned_date    DATE,
  futureshop_completed_date  DATE,
  switch_pending             BOOLEAN NOT NULL DEFAULT false,
  notes                      TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reserve_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reserve_stock: owner access" ON reserve_stock
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
