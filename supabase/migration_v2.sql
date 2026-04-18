-- V2 Migration: Supabase Auth + Push Subscriptions + Reminder Idempotency
-- Run in Supabase SQL Editor (Settings > SQL Editor)

-- 1. Extend tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;

-- Automatically set user_id from the authenticated caller
ALTER TABLE tasks ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2. Scope RLS to authenticated users
DROP POLICY IF EXISTS "allow_all" ON tasks;
CREATE POLICY "users_own_tasks" ON tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Push subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_subs" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. RPC: fetch tasks due for reminder (called by Vercel cron function)
--    SECURITY DEFINER runs as the table owner, bypassing RLS safely.
CREATE OR REPLACE FUNCTION get_due_reminders()
RETURNS TABLE (
  id                      UUID,
  text                    TEXT,
  user_id                 UUID,
  due_at                  TIMESTAMPTZ,
  reminder_offset_minutes INTEGER,
  last_reminded_at        TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id, text, user_id, due_at, reminder_offset_minutes, last_reminded_at
  FROM   tasks
  WHERE  completed              = FALSE
    AND  due_at                 IS NOT NULL
    AND  reminder_offset_minutes IS NOT NULL
    AND  user_id                IS NOT NULL
    -- reminder fire time has passed
    AND  due_at - (reminder_offset_minutes * INTERVAL '1 minute') <= NOW()
    -- task not already overdue by more than 24 h (skip very stale tasks)
    AND  due_at > NOW() - INTERVAL '24 hours'
    -- idempotency: never re-fire within the same reminder window
    AND (
      last_reminded_at IS NULL
      OR last_reminded_at < due_at - (reminder_offset_minutes * INTERVAL '1 minute')
    );
$$;
