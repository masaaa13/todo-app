-- EC/MD Management Tables
-- Run in Supabase SQL Editor after migration_v2.sql

-- 1. Products
CREATE TABLE IF NOT EXISTS products (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  sku                 TEXT        NOT NULL,
  name                TEXT        NOT NULL,
  brand               TEXT,
  category            TEXT        NOT NULL DEFAULT 'normal'
                                  CHECK (category IN ('normal', 'reservation', 'collab')),
  launch_date         DATE,
  release_date        DATE,
  reservation_start   DATE,
  reservation_end     DATE,
  futureshop_status   TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (futureshop_status IN ('pending', 'registered', 'not_needed')),
  zozo_status         TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (zozo_status IN ('pending', 'registered', 'not_needed')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_products" ON products
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Product schedules (manual events)
CREATE TABLE IF NOT EXISTS product_schedules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  product_id   UUID        REFERENCES products(id) ON DELETE SET NULL,
  event_type   TEXT        NOT NULL,
  scheduled_at DATE        NOT NULL,
  title        TEXT,
  done         BOOLEAN     NOT NULL DEFAULT FALSE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE product_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_schedules" ON product_schedules
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Inventory candidates
CREATE TABLE IF NOT EXISTS inventory_candidates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  product_id   UUID        REFERENCES products(id) ON DELETE SET NULL,
  priority     TEXT        NOT NULL DEFAULT 'medium'
                           CHECK (priority IN ('high', 'medium', 'low')),
  reason       TEXT,
  status       TEXT        NOT NULL DEFAULT 'B',
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE inventory_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_candidates" ON inventory_candidates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Reserve stock (予約商品追加在庫管理)
CREATE TABLE IF NOT EXISTS reserve_stock (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  product_id                UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock_type                TEXT        NOT NULL CHECK (stock_type IN ('initial', 'additional')),
  quantity                  INTEGER,
  delivery_date             DATE,
  futureshop_required       BOOLEAN     NOT NULL DEFAULT FALSE,
  futureshop_planned_date   DATE,
  futureshop_completed_date DATE,
  switch_pending            BOOLEAN     NOT NULL DEFAULT FALSE,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reserve_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_reserve_stock" ON reserve_stock
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Realtime (optional)
-- ALTER PUBLICATION supabase_realtime ADD TABLE products;
-- ALTER PUBLICATION supabase_realtime ADD TABLE product_schedules;
-- ALTER PUBLICATION supabase_realtime ADD TABLE inventory_candidates;
-- ALTER PUBLICATION supabase_realtime ADD TABLE reserve_stock;
