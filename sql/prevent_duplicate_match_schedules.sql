-- 동일 슬롯(같은 날짜/시간/장소) 중복 일정 정리 + 재발 방지 제약
-- 실행 위치: Supabase SQL Editor
-- 권장: 운영 반영 전 백업 또는 스냅샷 확보

BEGIN;

-- 1) 슬롯별로 1건만 남기고 제거 대상 산출
--    우선순위: 상태(진행중/완료 우선) -> 참가자수 내림차순 -> 생성일 오름차순
CREATE TEMP TABLE tmp_schedule_dedup_map AS
WITH ranked AS (
  SELECT
    ms.id,
    ms.match_date,
    ms.start_time,
    ms.end_time,
    ms.location,
    ms.status,
    ms.current_participants,
    ms.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY ms.match_date, ms.start_time, ms.end_time, ms.location
      ORDER BY
        CASE
          WHEN ms.status IN ('in_progress', 'ongoing') THEN 1
          WHEN ms.status = 'completed' THEN 2
          WHEN ms.status = 'scheduled' THEN 3
          WHEN ms.status = 'cancelled' THEN 4
          ELSE 5
        END,
        ms.current_participants DESC,
        ms.created_at ASC,
        ms.id ASC
    ) AS rn,
    FIRST_VALUE(ms.id) OVER (
      PARTITION BY ms.match_date, ms.start_time, ms.end_time, ms.location
      ORDER BY
        CASE
          WHEN ms.status IN ('in_progress', 'ongoing') THEN 1
          WHEN ms.status = 'completed' THEN 2
          WHEN ms.status = 'scheduled' THEN 3
          WHEN ms.status = 'cancelled' THEN 4
          ELSE 5
        END,
        ms.current_participants DESC,
        ms.created_at ASC,
        ms.id ASC
    ) AS keep_id
  FROM public.match_schedules ms
)
SELECT keep_id, id AS remove_id
FROM ranked
WHERE rn > 1;

-- 2) 제거 대상 일정의 참가자 정보를 keep 일정으로 병합
--    같은 keep 일정으로 같은 user가 여러 remove 일정에 존재할 수 있으므로
--    keep_id + user_id 기준으로 1건만 선별 후 INSERT
WITH merge_candidates AS (
  SELECT
    m.keep_id,
    mp.user_id,
    mp.registered_at,
    mp.status,
    mp.notes,
    ROW_NUMBER() OVER (
      PARTITION BY m.keep_id, mp.user_id
      ORDER BY
        CASE
          WHEN mp.status = 'attended' THEN 1
          WHEN mp.status = 'registered' THEN 2
          WHEN mp.status = 'absent' THEN 3
          WHEN mp.status = 'cancelled' THEN 4
          ELSE 5
        END,
        mp.registered_at ASC,
        mp.id ASC
    ) AS rn
  FROM public.match_participants mp
  JOIN tmp_schedule_dedup_map m
    ON mp.match_schedule_id = m.remove_id
)
INSERT INTO public.match_participants (match_schedule_id, user_id, registered_at, status, notes)
SELECT
  c.keep_id,
  c.user_id,
  c.registered_at,
  c.status,
  c.notes
FROM merge_candidates c
WHERE c.rn = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.match_participants keep_mp
    WHERE keep_mp.match_schedule_id = c.keep_id
      AND keep_mp.user_id = c.user_id
  );

-- 3) 제거 대상 참가자 행 삭제
DELETE FROM public.match_participants mp
USING tmp_schedule_dedup_map m
WHERE mp.match_schedule_id = m.remove_id;

-- 4) 중복 일정 삭제
DELETE FROM public.match_schedules ms
USING tmp_schedule_dedup_map m
WHERE ms.id = m.remove_id;

-- 5) 슬롯 유니크 제약 추가
ALTER TABLE public.match_schedules
  ADD CONSTRAINT match_schedules_unique_slot
  UNIQUE (match_date, start_time, end_time, location);

COMMIT;

-- 실행 후 검증 쿼리
-- SELECT match_date, start_time, end_time, location, COUNT(*)
-- FROM public.match_schedules
-- GROUP BY match_date, start_time, end_time, location
-- HAVING COUNT(*) > 1
-- ORDER BY match_date, start_time, location;
