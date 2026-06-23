-- Restore read access for match schedules and participants
-- Run this in Supabase SQL Editor if user pages cannot read match schedules.

ALTER TABLE public.match_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view match schedules" ON public.match_schedules;
CREATE POLICY "Anyone can view match schedules" ON public.match_schedules
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can view match participants" ON public.match_participants;
CREATE POLICY "Anyone can view match participants" ON public.match_participants
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
