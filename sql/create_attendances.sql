-- 출석 관리 테이블 생성
-- Supabase에서 실행할 SQL 스크립트

-- attendances 테이블 생성 (일일 출석 기록)
CREATE TABLE IF NOT EXISTS attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    attended_at DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent')),
    match_schedule_id UUID REFERENCES match_schedules(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, attended_at)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_attendances_user_date ON attendances(user_id, attended_at);
CREATE INDEX IF NOT EXISTS idx_attendances_date ON attendances(attended_at);
CREATE INDEX IF NOT EXISTS idx_attendances_schedule ON attendances(match_schedule_id);

-- RLS (Row Level Security) 정책 활성화
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 출석 기록만 조회 가능
CREATE POLICY "Users can view their own attendance" ON attendances
    FOR SELECT USING (auth.uid() = user_id);

-- 사용자는 자신의 출석 기록을 생성 가능
CREATE POLICY "Users can insert their own attendance" ON attendances
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 사용자는 자신의 출석 기록을 수정 가능
CREATE POLICY "Users can update their own attendance" ON attendances
    FOR UPDATE USING (auth.uid() = user_id);

-- 관리자는 모든 출석 기록을 조회 가능
CREATE POLICY "Admins can view all attendances" ON attendances
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 관리자는 모든 출석 기록을 수정 가능
CREATE POLICY "Admins can update all attendances" ON attendances
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 출석 데이터 업데이트 시 updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER trigger_update_attendance_updated_at
    BEFORE UPDATE ON attendances
    FOR EACH ROW EXECUTE FUNCTION update_attendance_updated_at();

-- 출석 통계 뷰 생성 (선택사항)
CREATE OR REPLACE VIEW attendance_stats AS
SELECT
    user_id,
    attended_at,
    status,
    match_schedule_id,
    EXTRACT(YEAR FROM attended_at) as year,
    EXTRACT(MONTH FROM attended_at) as month,
    EXTRACT(WEEK FROM attended_at) as week
FROM attendances
ORDER BY attended_at DESC;

-- 월별 출석 요약 뷰
CREATE OR REPLACE VIEW monthly_attendance_summary AS
SELECT
    user_id,
    EXTRACT(YEAR FROM attended_at) as year,
    EXTRACT(MONTH FROM attended_at) as month,
    COUNT(*) FILTER (WHERE status = 'present') as present_count,
    COUNT(*) FILTER (WHERE status = 'absent') as absent_count,
    COUNT(*) as total_days,
    ROUND(
        COUNT(*) FILTER (WHERE status = 'present')::numeric /
        NULLIF(COUNT(*), 0) * 100, 1
    ) as attendance_rate
FROM attendances
GROUP BY user_id, EXTRACT(YEAR FROM attended_at), EXTRACT(MONTH FROM attended_at)
ORDER BY year DESC, month DESC, user_id;

-- 확인 쿼리
SELECT
    'attendances 테이블 생성 완료' as status,
    COUNT(*) as existing_records
FROM attendances;

-- 테이블 구조 확인
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'attendances'
ORDER BY ordinal_position;
