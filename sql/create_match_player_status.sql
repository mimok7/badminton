-- 경기별 선수 개별 상태 추적을 위한 테이블 생성

CREATE TABLE IF NOT EXISTS match_player_status (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES generated_matches(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id),
    
    -- 한 경기에서 한 선수는 하나의 상태만 가질 수 있음
    UNIQUE(match_id, user_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_match_player_status_match_id ON match_player_status(match_id);
CREATE INDEX IF NOT EXISTS idx_match_player_status_user_id ON match_player_status(user_id);
CREATE INDEX IF NOT EXISTS idx_match_player_status_status ON match_player_status(status);

-- RLS 정책 활성화
ALTER TABLE match_player_status ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 상태만 조회/수정 가능
CREATE POLICY "Users can view their own match status" ON match_player_status
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own match status" ON match_player_status
    FOR UPDATE USING (auth.uid() = user_id);

-- 관리자는 모든 상태 조회/수정 가능
CREATE POLICY "Admins can view all match statuses" ON match_player_status
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update all match statuses" ON match_player_status
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- 시스템이 자동으로 레코드 삽입 가능 (트리거용)
CREATE POLICY "System can insert match player status" ON match_player_status
    FOR INSERT WITH CHECK (true);

-- generated_matches의 전체 경기 상태를 자동 업데이트하는 함수
CREATE OR REPLACE FUNCTION update_match_overall_status()
RETURNS TRIGGER AS $$
BEGIN
    -- 해당 경기의 모든 선수 상태를 확인하여 전체 상태 결정
    UPDATE generated_matches 
    SET status = (
        CASE 
            -- 한 명이라도 완료하면 전체 완료
            WHEN EXISTS (
                SELECT 1 FROM match_player_status 
                WHERE match_id = COALESCE(NEW.match_id, OLD.match_id) 
                AND status = 'completed'
            ) THEN 'completed'
            -- 한 명이라도 진행중이면 전체 진행중
            WHEN EXISTS (
                SELECT 1 FROM match_player_status 
                WHERE match_id = COALESCE(NEW.match_id, OLD.match_id) 
                AND status = 'in_progress'
            ) THEN 'in_progress'
            -- 모두 취소하면 전체 취소
            WHEN (
                SELECT COUNT(*) FROM match_player_status 
                WHERE match_id = COALESCE(NEW.match_id, OLD.match_id) 
                AND status = 'cancelled'
            ) = (
                SELECT COUNT(*) FROM match_player_status 
                WHERE match_id = COALESCE(NEW.match_id, OLD.match_id)
            ) THEN 'cancelled'
            -- 기본값은 예정
            ELSE 'scheduled'
        END
    ),
    updated_at = NOW()
    WHERE id = COALESCE(NEW.match_id, OLD.match_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 선수 상태 변경 시 전체 경기 상태 자동 업데이트 트리거
CREATE TRIGGER trigger_update_match_overall_status
    AFTER INSERT OR UPDATE OR DELETE ON match_player_status
    FOR EACH ROW
    EXECUTE FUNCTION update_match_overall_status();

-- 기존 generated_matches의 모든 경기에 대해 4명 선수의 초기 상태 레코드 생성
INSERT INTO match_player_status (match_id, user_id, status)
SELECT 
    gm.id as match_id,
    p.user_id,
    'scheduled' as status
FROM generated_matches gm
CROSS JOIN (
    SELECT team1_player1_id as profile_id FROM generated_matches WHERE team1_player1_id IS NOT NULL
    UNION 
    SELECT team1_player2_id FROM generated_matches WHERE team1_player2_id IS NOT NULL
    UNION 
    SELECT team2_player1_id FROM generated_matches WHERE team2_player1_id IS NOT NULL
    UNION 
    SELECT team2_player2_id FROM generated_matches WHERE team2_player2_id IS NOT NULL
) players
JOIN profiles p ON p.id = players.profile_id
WHERE gm.id IN (
    SELECT DISTINCT id FROM generated_matches 
    WHERE team1_player1_id = players.profile_id 
       OR team1_player2_id = players.profile_id 
       OR team2_player1_id = players.profile_id 
       OR team2_player2_id = players.profile_id
)
ON CONFLICT (match_id, user_id) DO NOTHING;

-- 새로운 generated_matches가 추가될 때 자동으로 선수 상태 레코드 생성하는 함수
CREATE OR REPLACE FUNCTION create_match_player_status_records()
RETURNS TRIGGER AS $$
BEGIN
    -- 4명의 선수에 대해 초기 상태 레코드 생성
    INSERT INTO match_player_status (match_id, user_id, status)
    SELECT 
        NEW.id,
        p.user_id,
        'scheduled'
    FROM profiles p
    WHERE p.id IN (NEW.team1_player1_id, NEW.team1_player2_id, NEW.team2_player1_id, NEW.team2_player2_id)
    AND p.user_id IS NOT NULL
    ON CONFLICT (match_id, user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 새 경기 생성 시 선수 상태 레코드 자동 생성 트리거
CREATE TRIGGER trigger_create_match_player_status
    AFTER INSERT ON generated_matches
    FOR EACH ROW
    EXECUTE FUNCTION create_match_player_status_records();

-- 확인용 쿼리
SELECT 
    'match_player_status 테이블 생성 완료' as message,
    COUNT(*) as total_records
FROM match_player_status;
