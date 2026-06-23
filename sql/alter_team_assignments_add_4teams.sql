-- 기존 team_assignments 테이블에 4팀 지원 컬럼 추가
-- 이미 테이블이 존재하는 경우 실행

-- 4팀 모드 및 페어 모드용 컬럼 추가
ALTER TABLE team_assignments 
ADD COLUMN IF NOT EXISTS team1 JSONB,
ADD COLUMN IF NOT EXISTS team2 JSONB,
ADD COLUMN IF NOT EXISTS team3 JSONB,
ADD COLUMN IF NOT EXISTS team4 JSONB,
ADD COLUMN IF NOT EXISTS pairs_data JSONB;

-- 기존 컬럼을 NOT NULL에서 NULL 허용으로 변경
ALTER TABLE team_assignments 
ALTER COLUMN racket_team DROP NOT NULL,
ALTER COLUMN shuttle_team DROP NOT NULL;

-- 코멘트 업데이트
COMMENT ON COLUMN team_assignments.team_type IS '팀 구성 방식: 2teams(2팀), 4teams(4팀), pairs(2명팀), custom(사용자 정의)';
COMMENT ON COLUMN team_assignments.racket_team IS '라켓팀 선수들의 정보 (JSON 배열) - 2teams일 때 사용';
COMMENT ON COLUMN team_assignments.shuttle_team IS '셔틀팀 선수들의 정보 (JSON 배열) - 2teams일 때 사용';
COMMENT ON COLUMN team_assignments.team1 IS '팀1 선수들의 정보 (JSON 배열) - 4teams일 때 사용';
COMMENT ON COLUMN team_assignments.team2 IS '팀2 선수들의 정보 (JSON 배열) - 3teams, 4teams일 때 사용';
COMMENT ON COLUMN team_assignments.team3 IS '팀3 선수들의 정보 (JSON 배열) - 3teams, 4teams일 때 사용';
COMMENT ON COLUMN team_assignments.team4 IS '팀4 선수들의 정보 (JSON 배열) - 4teams일 때만 사용';
COMMENT ON COLUMN team_assignments.pairs_data IS '페어 데이터 전체 (JSON 객체) - pairs일 때 사용. 예: {"pair1": ["선수1", "선수2"], "pair2": ["선수3", "선수4"]}';

-- 확인
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'team_assignments' 
ORDER BY ordinal_position;
