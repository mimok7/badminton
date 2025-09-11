-- 1. profiles 테이블에 없는 match_participants 레코드 확인
SELECT
  mp.user_id,
  mp.match_schedule_id,
  mp.status,
  mp.registered_at
FROM match_participants mp
LEFT JOIN profiles p ON mp.user_id = p.id
WHERE p.id IS NULL;

-- 2. profiles 테이블에 없는 match_participants 레코드 삭제
DELETE FROM match_participants
WHERE user_id NOT IN (
  SELECT id FROM profiles
);

-- 3. 삭제 후 남은 레코드 수 확인
SELECT COUNT(*) as remaining_participants FROM match_participants;

-- 4. 외래 키 제약 조건 수정: match_participants.user_id가 profiles.id를 참조하도록 변경
-- 기존 제약 조건 삭제
ALTER TABLE match_participants DROP CONSTRAINT IF EXISTS match_participants_user_id_fkey;

-- 새로운 제약 조건 추가 (profiles.id 참조)
ALTER TABLE match_participants ADD CONSTRAINT match_participants_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 5. match_participants 테이블의 user_id를 profiles.id로 업데이트 (이미 일치하는 경우)
UPDATE match_participants
SET user_id = profiles.id
FROM profiles
WHERE match_participants.user_id = profiles.user_id;

-- 6. 업데이트된 데이터 확인
SELECT
  COUNT(*) as total_participants,
  COUNT(DISTINCT mp.user_id) as unique_users
FROM match_participants mp
JOIN profiles p ON mp.user_id = p.id;

-- 7. 경기별 참가자 현황 확인
SELECT
  ms.match_date,
  ms.location,
  COUNT(mp.id) as participant_count,
  COUNT(CASE WHEN mp.status = 'registered' THEN 1 END) as registered_count,
  COUNT(CASE WHEN mp.status = 'attended' THEN 1 END) as attended_count
FROM match_schedules ms
LEFT JOIN match_participants mp ON ms.id = mp.match_schedule_id
WHERE ms.match_date = CURRENT_DATE
GROUP BY ms.id, ms.match_date, ms.location;

-- 8. upsert 충돌 방지를 위한 유니크 제약 보장 (없으면 생성)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'match_participants_unique' AND conrelid = 'match_participants'::regclass
  ) THEN
    ALTER TABLE match_participants
      ADD CONSTRAINT match_participants_unique UNIQUE (match_schedule_id, user_id);
  END IF;
END $$;

-- 9. 조회 성능 향상을 위한 보조 인덱스 (존재 확인 후 생성)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_match_participants_schedule_status'
  ) THEN
    CREATE INDEX idx_match_participants_schedule_status
      ON match_participants (match_schedule_id, status);
  END IF;
END $$;
