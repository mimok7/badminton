ALTER TABLE public.match_schedules
ADD COLUMN IF NOT EXISTS schedule_source VARCHAR(20) NOT NULL DEFAULT 'recurring';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'match_schedules_schedule_source_check'
  ) THEN
    ALTER TABLE public.match_schedules
    ADD CONSTRAINT match_schedules_schedule_source_check
    CHECK (schedule_source IN ('recurring', 'tournament', 'generated'));
  END IF;
END $$;

UPDATE public.match_schedules
SET schedule_source = 'recurring'
WHERE schedule_source IS NULL
   OR schedule_source = '';

COMMENT ON COLUMN public.match_schedules.schedule_source
IS '경기 일정 출처 구분: recurring(정기모임), tournament(대회 경기), generated(일반 경기 자동 생성)';

CREATE INDEX IF NOT EXISTS idx_match_schedules_schedule_source
ON public.match_schedules(schedule_source);
