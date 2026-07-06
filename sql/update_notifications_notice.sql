-- Migration: Add file attachment columns and notice type to notifications table

-- 1. Add file attachment columns if they don't exist
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);

-- 2. Drop the existing type constraint if it exists to update the list of allowed values
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS check_notification_type;

-- 3. Add the updated type check constraint including 'notice' and 'survey'
ALTER TABLE public.notifications ADD CONSTRAINT check_notification_type 
CHECK (type IN ('general', 'match_preparation', 'match_result', 'schedule_change', 'system', 'survey', 'notice'));

COMMENT ON COLUMN public.notifications.file_url IS 'URL of the attached file for notices';
COMMENT ON COLUMN public.notifications.file_name IS 'Original filename of the attached file';
