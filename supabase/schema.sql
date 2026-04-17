-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  text        TEXT        NOT NULL,
  completed   BOOLEAN     NOT NULL DEFAULT FALSE,
  priority    TEXT        NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('high', 'medium', 'low')),
  due_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- (Future) Add user_id when auth is enabled:
-- ALTER TABLE tasks ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Row Level Security: allow all for now (no auth)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON tasks
  FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
