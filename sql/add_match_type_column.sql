-- tournaments 테이블에 match_type 컬럼 추가
ALTER TABLE tournaments 
ADD COLUMN IF NOT EXISTS match_type TEXT NOT NULL DEFAULT 'random';

-- 코멘트 추가
COMMENT ON COLUMN tournaments.match_type IS '경기 타입 (level_based: 레벨별, random: 랜덤, mixed_doubles: 혼복)';

-- 기존 데이터에 기본값 설정 (이미 DEFAULT로 설정되어 있지만 명시적으로)
UPDATE tournaments 
SET match_type = 'random' 
WHERE match_type IS NULL;
