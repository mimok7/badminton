-- 배드민턴 DB 복원 사전 점검 SQL
-- 목적: 복원 실행 전 현재 public 스키마 상태를 파악

-- 1) 핵심 테이블 존재 여부
SELECT
  t.table_name,
  CASE WHEN c.table_name IS NOT NULL THEN 'exists' ELSE 'missing' END AS status
FROM (
  VALUES
    ('level_info'),
    ('profiles'),
    ('courts'),
    ('dashboard_menus'),
    ('match_sessions'),
    ('generated_matches'),
    ('match_schedules'),
    ('match_participants'),
    ('attendances'),
    ('notifications'),
    ('recurring_match_templates'),
    ('team_assignments'),
    ('tournaments'),
    ('tournament_matches'),
    ('match_results'),
    ('match_player_status')
) AS t(table_name)
LEFT JOIN information_schema.tables c
  ON c.table_schema = 'public'
 AND c.table_name = t.table_name
ORDER BY t.table_name;

-- 2) 핵심 테이블 데이터 건수(복원 전 백업 필요성 판단)
SELECT 'profiles' AS table_name, COUNT(*) AS row_count FROM public.profiles
UNION ALL SELECT 'match_sessions', COUNT(*) FROM public.match_sessions
UNION ALL SELECT 'generated_matches', COUNT(*) FROM public.generated_matches
UNION ALL SELECT 'match_schedules', COUNT(*) FROM public.match_schedules
UNION ALL SELECT 'match_participants', COUNT(*) FROM public.match_participants
UNION ALL SELECT 'attendances', COUNT(*) FROM public.attendances
UNION ALL SELECT 'notifications', COUNT(*) FROM public.notifications
UNION ALL SELECT 'team_assignments', COUNT(*) FROM public.team_assignments
UNION ALL SELECT 'tournaments', COUNT(*) FROM public.tournaments
UNION ALL SELECT 'tournament_matches', COUNT(*) FROM public.tournament_matches
UNION ALL SELECT 'match_results', COUNT(*) FROM public.match_results
UNION ALL SELECT 'match_player_status', COUNT(*) FROM public.match_player_status
ORDER BY table_name;

-- 3) FK 관계 현황
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- 4) 컬럼 스냅샷(구조 비교용)
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'level_info','profiles','courts','dashboard_menus','match_sessions','generated_matches',
    'match_schedules','match_participants','attendances','notifications',
    'recurring_match_templates','team_assignments','tournaments','tournament_matches',
    'match_results','match_player_status'
  )
ORDER BY table_name, ordinal_position;
