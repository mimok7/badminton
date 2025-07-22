-- generated_matches 테이블에 경기 결과 저장을 위한 컬럼 추가

-- 경기 상태 컬럼 추가 (scheduled, in_progress, completed, cancelled)
ALTER TABLE generated_matches 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'scheduled' 
CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled'));

-- 경기 결과 저장을 위한 JSON 컬럼 추가
ALTER TABLE generated_matches 
ADD COLUMN IF NOT EXISTS match_result JSONB;

-- 완료 시간 컬럼 추가
ALTER TABLE generated_matches 
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_generated_matches_status ON generated_matches(status);
CREATE INDEX IF NOT EXISTS idx_generated_matches_completed_at ON generated_matches(completed_at);

-- 확인용 쿼리
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'generated_matches' 
AND column_name IN ('status', 'match_result', 'completed_at')
ORDER BY column_name;
