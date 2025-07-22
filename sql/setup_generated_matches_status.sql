-- generated_matches 테이블에 필요한 컬럼들 추가

-- 1. status 컬럼이 있는지 확인
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'generated_matches' 
AND column_name = 'status';

-- 2. status 컬럼이 없다면 추가
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'generated_matches' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE generated_matches 
        ADD COLUMN status VARCHAR(20) DEFAULT 'scheduled' 
        CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled'));
    END IF;
END $$;

-- 3. match_result 컬럼 추가
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'generated_matches' 
        AND column_name = 'match_result'
    ) THEN
        ALTER TABLE generated_matches ADD COLUMN match_result JSONB;
    END IF;
END $$;

-- 4. completed_at 컬럼 추가
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'generated_matches' 
        AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE generated_matches ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- 5. 인덱스 생성 (이미 존재하면 무시됨)
CREATE INDEX IF NOT EXISTS idx_generated_matches_status ON generated_matches(status);
CREATE INDEX IF NOT EXISTS idx_generated_matches_completed_at ON generated_matches(completed_at);

-- 6. 기존 데이터 업데이트 (status 컬럼이 NULL인 경우 'scheduled'로 설정)
UPDATE generated_matches SET status = 'scheduled' WHERE status IS NULL;

-- 7. 최종 확인
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'generated_matches' 
AND column_name IN ('status', 'match_result', 'completed_at')
ORDER BY column_name;

-- 8. 데이터 확인
SELECT 
    COUNT(*) as total_matches,
    COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled_count,
    COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_count,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
FROM generated_matches;
