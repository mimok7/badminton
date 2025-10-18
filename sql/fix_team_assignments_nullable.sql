-- ========================================
-- team_assignments 테이블 수정 - NULL 가능하도록 변경
-- Supabase SQL Editor에서 실행하세요
-- ========================================

-- 현재 데이터 백업 (선택사항)
-- SELECT * INTO team_assignments_backup FROM team_assignments;

-- NOT NULL 제약 제거
BEGIN;

ALTER TABLE team_assignments
ALTER COLUMN racket_team DROP NOT NULL;

ALTER TABLE team_assignments
ALTER COLUMN shuttle_team DROP NOT NULL;

-- 또는 컬럼을 다시 정의하는 방법 (더 안전)
-- ALTER TABLE team_assignments 
-- ALTER COLUMN racket_team SET DATA TYPE JSONB USING racket_team;

COMMIT;

-- 확인
-- \d team_assignments;
