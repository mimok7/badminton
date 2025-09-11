-- 기존 정책들 삭제 스크립트
-- Supabase에서 먼저 실행하여 기존 정책들을 정리하세요

-- =============================================================================
-- 기존 RLS 정책들 삭제
-- =============================================================================

-- profiles 테이블 정책 삭제
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- match_schedules 테이블 정책 삭제
DROP POLICY IF EXISTS "Anyone can view match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Authenticated users can insert match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Users can update their own match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Users can delete their own match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Admin users can insert match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Admin users can update match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Admin users can delete match schedules" ON match_schedules;

-- match_participants 테이블 정책 삭제
DROP POLICY IF EXISTS "Anyone can view match participants" ON match_participants;
DROP POLICY IF EXISTS "Users can register for matches" ON match_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON match_participants;
DROP POLICY IF EXISTS "Users can cancel their own participation" ON match_participants;

-- attendances 테이블 정책 삭제
DROP POLICY IF EXISTS "Users can view their own attendance" ON attendances;
DROP POLICY IF EXISTS "Users can insert their own attendance" ON attendances;
DROP POLICY IF EXISTS "Users can update their own attendance" ON attendances;
DROP POLICY IF EXISTS "Admins can view all attendances" ON attendances;
DROP POLICY IF EXISTS "Admins can update all attendances" ON attendances;

-- notifications 테이블 정책 삭제
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can insert notifications" ON notifications;

-- =============================================================================
-- 기존 트리거 삭제 (있다면)
-- =============================================================================

DROP TRIGGER IF EXISTS trigger_update_match_participants_count ON match_participants;
DROP TRIGGER IF EXISTS trigger_update_attendance_updated_at ON attendances;

-- =============================================================================
-- 기존 함수 삭제 (있다면)
-- =============================================================================

DROP FUNCTION IF EXISTS update_match_participants_count();
DROP FUNCTION IF EXISTS update_attendance_updated_at();

-- =============================================================================
-- 기존 뷰 삭제 (있다면)
-- =============================================================================

DROP VIEW IF EXISTS attendance_stats;
DROP VIEW IF EXISTS monthly_attendance_summary;
DROP VIEW IF EXISTS user_notification_stats;
DROP VIEW IF EXISTS recurring_templates_view;

-- =============================================================================
-- 완료 메시지
-- =============================================================================

SELECT '기존 정책 및 객체 삭제 완료' as status;
