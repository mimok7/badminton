-- 경기 일정 관리를 위한 테이블 생성
CREATE TABLE IF NOT EXISTS match_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    location VARCHAR(255) NOT NULL,
    max_participants INTEGER NOT NULL DEFAULT 20,
    current_participants INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_match_schedules_date ON match_schedules(match_date);
CREATE INDEX IF NOT EXISTS idx_match_schedules_status ON match_schedules(status);

-- RLS (Row Level Security) 정책 활성화
ALTER TABLE match_schedules ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 경기 일정을 조회할 수 있도록 허용
CREATE POLICY "Anyone can view match schedules" ON match_schedules
    FOR SELECT USING (true);

-- 인증된 사용자만 경기 일정을 생성할 수 있도록 허용 (관리자 권한 추가 고려)
CREATE POLICY "Authenticated users can insert match schedules" ON match_schedules
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 경기 일정 작성자 또는 관리자만 수정할 수 있도록 허용
CREATE POLICY "Users can update their own match schedules" ON match_schedules
    FOR UPDATE USING (
        auth.uid() = created_by OR 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 경기 일정 작성자 또는 관리자만 삭제할 수 있도록 허용
CREATE POLICY "Users can delete their own match schedules" ON match_schedules
    FOR DELETE USING (
        auth.uid() = created_by OR 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 경기 참가자 관리를 위한 테이블 생성
CREATE TABLE IF NOT EXISTS match_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_schedule_id UUID NOT NULL REFERENCES match_schedules(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'cancelled', 'attended', 'absent')),
    notes TEXT,
    UNIQUE(match_schedule_id, user_id)
);

-- 참가자 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_match_participants_schedule ON match_participants(match_schedule_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_user ON match_participants(user_id);

-- 참가자 테이블 RLS 활성화
ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 참가자 목록을 조회할 수 있도록 허용
CREATE POLICY "Anyone can view match participants" ON match_participants
    FOR SELECT USING (true);

-- 인증된 사용자가 자신의 참가 신청을 할 수 있도록 허용
CREATE POLICY "Users can register for matches" ON match_participants
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 사용자가 자신의 참가 상태를 수정할 수 있도록 허용
CREATE POLICY "Users can update their own participation" ON match_participants
    FOR UPDATE USING (auth.uid() = user_id);

-- 사용자가 자신의 참가를 취소할 수 있도록 허용
CREATE POLICY "Users can cancel their own participation" ON match_participants
    FOR DELETE USING (auth.uid() = user_id);

-- 경기 일정의 현재 참가자 수를 자동으로 업데이트하는 트리거 함수
CREATE OR REPLACE FUNCTION update_match_participants_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE match_schedules 
        SET current_participants = (
            SELECT COUNT(*) 
            FROM match_participants 
            WHERE match_schedule_id = NEW.match_schedule_id 
            AND status = 'registered'
        )
        WHERE id = NEW.match_schedule_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE match_schedules 
        SET current_participants = (
            SELECT COUNT(*) 
            FROM match_participants 
            WHERE match_schedule_id = OLD.match_schedule_id 
            AND status = 'registered'
        )
        WHERE id = OLD.match_schedule_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE match_schedules 
        SET current_participants = (
            SELECT COUNT(*) 
            FROM match_participants 
            WHERE match_schedule_id = NEW.match_schedule_id 
            AND status = 'registered'
        )
        WHERE id = NEW.match_schedule_id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER trigger_update_match_participants_count
    AFTER INSERT OR UPDATE OR DELETE ON match_participants
    FOR EACH ROW EXECUTE FUNCTION update_match_participants_count();

-- 샘플 데이터 삽입 (선택사항)
-- INSERT INTO match_schedules (match_date, start_time, end_time, location, max_participants, description)
-- VALUES 
--     ('2024-01-15', '19:00', '21:00', '시민체육관 배드민턴장', 20, '정기 경기일입니다.'),
--     ('2024-01-22', '19:00', '21:00', '시민체육관 배드민턴장', 24, '레벨별 토너먼트가 진행됩니다.'),
--     ('2024-01-29', '18:00', '20:00', '올림픽파크텔 배드민턴장', 16, '새 장소에서 진행되는 경기입니다.');
