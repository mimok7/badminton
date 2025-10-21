-- ========================================
-- team_assignments 테이블 수정 - NULL 가능하도록 변경
-- Supabase SQL Editor에서 실행하세요
-- ========================================

BEGIN;

-- racket_team과 shuttle_team의 NOT NULL 제약 제거
-- (이미 NULL 허용이면 에러 없이 무시됨)
DO $$ 
BEGIN
    -- racket_team NOT NULL 제거
    BEGIN
        ALTER TABLE team_assignments 
        ALTER COLUMN racket_team DROP NOT NULL;
    EXCEPTION 
        WHEN others THEN 
            RAISE NOTICE 'racket_team already allows NULL or column does not exist';
    END;

    -- shuttle_team NOT NULL 제거
    BEGIN
        ALTER TABLE team_assignments 
        ALTER COLUMN shuttle_team DROP NOT NULL;
    EXCEPTION 
        WHEN others THEN 
            RAISE NOTICE 'shuttle_team already allows NULL or column does not exist';
    END;
END $$;

COMMIT;

-- 확인: 모든 JSONB 컬럼의 NULL 가능 여부 확인
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
  AND table_name = 'team_assignments' 
  AND column_name IN ('racket_team', 'shuttle_team', 'team1', 'team2', 'team3', 'team4', 'pairs_data')
ORDER BY ordinal_position;

-- ========================================
-- 실행 완료!
-- ========================================

