-- 정기모임 자동 생성 시스템

-- 1. 정기모임 설정 테이블 생성
CREATE TABLE IF NOT EXISTS recurring_match_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=일요일, 1=월요일, ..., 6=토요일
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    location VARCHAR(255) NOT NULL,
    max_participants INTEGER NOT NULL DEFAULT 20,
    is_active BOOLEAN DEFAULT true,
    advance_days INTEGER DEFAULT 7, -- 몇 일 전에 미리 생성할지
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. 정기모임 자동 생성 함수
CREATE OR REPLACE FUNCTION generate_recurring_matches()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    template_record RECORD;
    target_date DATE;
    days_ahead INTEGER;
    matches_created INTEGER := 0;
    current_day INTEGER;
BEGIN
    -- 활성화된 모든 정기모임 템플릿 조회
    FOR template_record IN 
        SELECT * FROM recurring_match_templates 
        WHERE is_active = true
    LOOP
        -- 다음 해당 요일 찾기 (advance_days 만큼 미리 생성)
        current_day := EXTRACT(DOW FROM CURRENT_DATE);
        
        -- 다음 해당 요일까지의 일수 계산
        IF template_record.day_of_week > current_day THEN
            days_ahead := template_record.day_of_week - current_day;
        ELSE
            days_ahead := 7 - current_day + template_record.day_of_week;
        END IF;
        
        -- advance_days 만큼 미리 생성된 일정이 있는지 확인
        FOR i IN 0..template_record.advance_days LOOP
            target_date := CURRENT_DATE + (days_ahead + (i * 7));
            
            -- 해당 날짜에 이미 일정이 있는지 확인
            IF NOT EXISTS (
                SELECT 1 FROM match_schedules 
                WHERE match_date = target_date 
                AND start_time = template_record.start_time
                AND location = template_record.location
            ) THEN
                -- 새 경기 일정 생성
                INSERT INTO match_schedules (
                    match_date,
                    start_time,
                    end_time,
                    location,
                    max_participants,
                    description,
                    created_by
                ) VALUES (
                    target_date,
                    template_record.start_time,
                    template_record.end_time,
                    template_record.location,
                    template_record.max_participants,
                    template_record.name || ' - 정기모임 (' || target_date || ')',
                    template_record.created_by
                );
                
                matches_created := matches_created + 1;
            END IF;
        END LOOP;
    END LOOP;
    
    RETURN matches_created;
END;
$$;

-- 3. 매일 자동 실행을 위한 함수 (Supabase Edge Functions 또는 외부 크론에서 호출)
CREATE OR REPLACE FUNCTION daily_match_generation()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    created_count INTEGER;
    result JSON;
BEGIN
    -- 정기모임 생성
    SELECT generate_recurring_matches() INTO created_count;
    
    -- 결과 반환
    result := json_build_object(
        'success', true,
        'created_matches', created_count,
        'execution_time', CURRENT_TIMESTAMP,
        'message', created_count || '개의 새로운 정기모임이 생성되었습니다.'
    );
    
    RETURN result;
END;
$$;

-- 4. 정기모임 템플릿 관리를 위한 뷰
CREATE OR REPLACE VIEW recurring_templates_view AS
SELECT 
    id,
    name,
    description,
    CASE day_of_week
        WHEN 0 THEN '일요일'
        WHEN 1 THEN '월요일'
        WHEN 2 THEN '화요일'
        WHEN 3 THEN '수요일'
        WHEN 4 THEN '목요일'
        WHEN 5 THEN '금요일'
        WHEN 6 THEN '토요일'
    END as day_name,
    day_of_week,
    start_time,
    end_time,
    location,
    max_participants,
    is_active,
    advance_days,
    created_at
FROM recurring_match_templates
ORDER BY day_of_week, start_time;

-- 5. 샘플 정기모임 템플릿 추가 (예시)
INSERT INTO recurring_match_templates (
    name,
    description,
    day_of_week,
    start_time,
    end_time,
    location,
    max_participants,
    advance_days
) VALUES 
(
    '주말 정기모임',
    '매주 토요일 정기 배드민턴 모임',
    6, -- 토요일
    '14:00',
    '17:00',
    '시민체육관 배드민턴장',
    24,
    14 -- 2주 전에 미리 생성
),
(
    '평일 저녁모임',
    '매주 수요일 저녁 배드민턴',
    3, -- 수요일
    '19:00',
    '21:00',
    '체육관 A',
    16,
    7 -- 1주 전에 미리 생성
);

-- 6. RLS 정책 설정
ALTER TABLE recurring_match_templates ENABLE ROW LEVEL SECURITY;

-- 모든 인증된 사용자가 조회 가능
CREATE POLICY "recurring_templates_select" ON recurring_match_templates 
    FOR SELECT TO authenticated USING (true);

-- 관리자만 생성/수정/삭제 가능 (관리자 프로필 확인)
CREATE POLICY "recurring_templates_admin_only" ON recurring_match_templates 
    FOR ALL TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- 7. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_recurring_templates_active ON recurring_match_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_templates_day ON recurring_match_templates(day_of_week);

-- 8. 확인 쿼리
SELECT 'Recurring match system created successfully' as status;

-- 생성된 템플릿 확인
SELECT * FROM recurring_templates_view;

-- 즉시 한 번 실행해보기
SELECT daily_match_generation() as result;
