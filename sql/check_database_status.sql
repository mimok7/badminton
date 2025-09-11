-- 현재 데이터베이스 상태 확인
-- 1. 각 테이블의 레코드 수 확인
SELECT
  'profiles' as table_name,
  COUNT(*) as record_count
FROM profiles
UNION ALL
SELECT
  'match_participants' as table_name,
  COUNT(*) as record_count
FROM match_participants
UNION ALL
SELECT
  'attendances' as table_name,
  COUNT(*) as record_count
FROM attendances
UNION ALL
SELECT
  'match_schedules' as table_name,
  COUNT(*) as record_count
FROM match_schedules;

-- 2. 오늘 경기 일정 확인
SELECT
  id,
  match_date,
  location,
  current_participants,
  max_participants
FROM match_schedules
WHERE match_date = CURRENT_DATE;

-- 3. profiles 테이블의 샘플 데이터 확인
SELECT
  id,
  username,
  full_name,
  role
FROM profiles
LIMIT 5;

-- 4. 외래 키 제약 조건 상태 확인
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('match_participants', 'attendances', 'profiles')
ORDER BY tc.table_name, tc.constraint_name;
