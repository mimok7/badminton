-- 대회 경기에 심판(referee) 정보 추가
-- tournament_matches 테이블에 referee_id, referee_name 컬럼 추가

-- 1. referee_id 컬럼 추가 (profiles 테이블 참조)
ALTER TABLE tournament_matches
  ADD COLUMN IF NOT EXISTS referee_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 2. referee_name 컬럼 추가 (빠른 조회용 비정규화)
ALTER TABLE tournament_matches
  ADD COLUMN IF NOT EXISTS referee_name TEXT;

-- 3. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_tournament_matches_referee
  ON tournament_matches(referee_id);

-- 4. 코멘트 추가
COMMENT ON COLUMN tournament_matches.referee_id IS '심판 프로필 ID (profiles 참조)';
COMMENT ON COLUMN tournament_matches.referee_name IS '심판 이름 (비정규화, 빠른 조회용)';

-- 5. Realtime 활성화 (이미 활성화 되어 있으면 무시)
-- Supabase Dashboard → Database → Replication 에서 tournament_matches 활성화 필요
-- ALTER PUBLICATION supabase_realtime ADD TABLE tournament_matches;
