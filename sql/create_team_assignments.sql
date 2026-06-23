-- ========================================
-- 팀 구성 저장 시스템 설정 SQL
-- 한 번에 실행 가능
-- ========================================

BEGIN;

-- 팀 구성 저장 테이블 생성
CREATE TABLE IF NOT EXISTS team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_date DATE NOT NULL,
  round_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  team_type TEXT NOT NULL, -- '2teams', '3teams', '4teams', 'pairs', 'custom'
  racket_team JSONB, -- 라켓팀 선수 배열 (2teams일 때)
  shuttle_team JSONB, -- 셔틀팀 선수 배열 (2teams일 때)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 새로운 컬럼 추가 (기존 테이블에 없는 경우)
ALTER TABLE team_assignments 
ADD COLUMN IF NOT EXISTS team1 JSONB,
ADD COLUMN IF NOT EXISTS team2 JSONB,
ADD COLUMN IF NOT EXISTS team3 JSONB,
ADD COLUMN IF NOT EXISTS team4 JSONB,
ADD COLUMN IF NOT EXISTS pairs_data JSONB;

-- 날짜별 인덱스 추가 (빠른 조회)
CREATE INDEX IF NOT EXISTS idx_team_assignments_date ON team_assignments(assignment_date);

-- 날짜 + 회차별 인덱스
CREATE INDEX IF NOT EXISTS idx_team_assignments_date_round ON team_assignments(assignment_date, round_number);

-- RLS (Row Level Security) 활성화
ALTER TABLE team_assignments ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있는 경우)
DROP POLICY IF EXISTS "Anyone can read team assignments" ON team_assignments;
DROP POLICY IF EXISTS "Authenticated users can insert team assignments" ON team_assignments;
DROP POLICY IF EXISTS "Authenticated users can update team assignments" ON team_assignments;
DROP POLICY IF EXISTS "Authenticated users can delete team assignments" ON team_assignments;

-- 모든 사용자 읽기 허용
CREATE POLICY "Anyone can read team assignments"
  ON team_assignments
  FOR SELECT
  USING (true);

-- 인증된 사용자만 생성/수정/삭제 허용
CREATE POLICY "Authenticated users can insert team assignments"
  ON team_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update team assignments"
  ON team_assignments
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete team assignments"
  ON team_assignments
  FOR DELETE
  TO authenticated
  USING (true);

-- updated_at 자동 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_team_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 기존 트리거 삭제 (있는 경우)
DROP TRIGGER IF EXISTS update_team_assignments_timestamp ON team_assignments;

-- 트리거 생성
CREATE TRIGGER update_team_assignments_timestamp
  BEFORE UPDATE ON team_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_team_assignments_updated_at();

-- 코멘트 추가
COMMENT ON TABLE team_assignments IS '배드민턴 팀 구성 저장 테이블';
COMMENT ON COLUMN team_assignments.team_type IS '팀 구성 방식: 2teams(2팀), 3teams(3팀), 4teams(4팀), pairs(2명팀), custom(사용자 정의)';
COMMENT ON COLUMN team_assignments.racket_team IS '라켓팀 선수들의 정보 (JSON 배열) - 2teams일 때 사용';
COMMENT ON COLUMN team_assignments.shuttle_team IS '셔틀팀 선수들의 정보 (JSON 배열) - 2teams일 때 사용';
COMMENT ON COLUMN team_assignments.team1 IS '팀1 선수들의 정보 (JSON 배열) - 3teams, 4teams일 때 사용';
COMMENT ON COLUMN team_assignments.team2 IS '팀2 선수들의 정보 (JSON 배열) - 3teams, 4teams일 때 사용';
COMMENT ON COLUMN team_assignments.team3 IS '팀3 선수들의 정보 (JSON 배열) - 3teams, 4teams일 때 사용';
COMMENT ON COLUMN team_assignments.team4 IS '팀4 선수들의 정보 (JSON 배열) - 4teams일 때만 사용';
COMMENT ON COLUMN team_assignments.pairs_data IS '페어 데이터 전체 (JSON 객체) - pairs일 때 사용. 예: {"pair1": ["선수1", "선수2"], "pair2": ["선수3", "선수4"]}';

COMMIT;

-- ========================================
-- 실행 완료!
-- team_assignments 테이블이 생성되었습니다.
-- ========================================
