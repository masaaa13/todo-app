-- Migrate from date-only due_date to datetime due_at
-- Run this in Supabase SQL Editor if the tasks table already exists

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_offset_minutes INTEGER;

-- Copy existing due_date values (midnight UTC) to due_at
UPDATE tasks
SET due_at = due_date::TIMESTAMPTZ
WHERE due_date IS NOT NULL AND due_at IS NULL;

-- Remove old column after migration is confirmed
-- ALTER TABLE tasks DROP COLUMN IF EXISTS due_date;
