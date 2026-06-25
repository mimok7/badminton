-- 1. 설문조사 테이블 생성
CREATE TABLE IF NOT EXISTS public.surveys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    question TEXT NOT NULL,
    description TEXT NULL,
    options JSONB NOT NULL, -- 예: ["참석", "불참", "미정"]
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    max_responses INTEGER NULL, -- 전체 선착순 마감 인원수 (NULL 이면 제한 없음)
    option_limits JSONB NULL, -- 각 선택 항목별 선착순 마감 인원수 (예: {"참석": 10, "불참": 5})
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 설문조사 응답 테이블 생성
CREATE TABLE IF NOT EXISTS public.survey_responses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    selected_option TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_survey UNIQUE (survey_id, user_id)
);

-- 3. notifications 테이블에 survey_id 추가 및 제약조건 수정
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS survey_id UUID REFERENCES public.surveys(id) ON DELETE SET NULL;

-- 기존 알림 타입 제약조건 삭제 후 'survey' 포함하여 재등록
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS check_notification_type;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('general', 'match_preparation', 'match_result', 'schedule_change', 'system', 'survey'));

-- 4. RLS 정책 활성화
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- 5. RLS 정책 정의
DROP POLICY IF EXISTS "Allow authenticated users to read surveys" ON public.surveys;
CREATE POLICY "Allow authenticated users to read surveys" ON public.surveys
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow admins to modify surveys" ON public.surveys;
CREATE POLICY "Allow admins to modify surveys" ON public.surveys
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Users can view own survey responses" ON public.survey_responses;
CREATE POLICY "Users can view own survey responses" ON public.survey_responses
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own survey responses" ON public.survey_responses;
CREATE POLICY "Users can insert own survey responses" ON public.survey_responses
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own survey responses" ON public.survey_responses;
CREATE POLICY "Users can update own survey responses" ON public.survey_responses
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own survey responses" ON public.survey_responses;
CREATE POLICY "Users can delete own survey responses" ON public.survey_responses
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 코멘트 추가
COMMENT ON TABLE public.surveys IS '알림 시스템 내 설문조사 정보';
COMMENT ON TABLE public.survey_responses IS '사용자별 설문조사 응답';
