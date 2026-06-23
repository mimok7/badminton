-- member_level_votes 테이블 생성
CREATE TABLE IF NOT EXISTS public.member_level_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_level TEXT NOT NULL REFERENCES public.level_info(code) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(voter_id, subject_id)
);

-- RLS 활성화
ALTER TABLE public.member_level_votes ENABLE ROW LEVEL SECURITY;

-- 정책 설정
DROP POLICY IF EXISTS "Allow select for authenticated users" ON public.member_level_votes;
DROP POLICY IF EXISTS "Allow insert for own votes" ON public.member_level_votes;
DROP POLICY IF EXISTS "Allow update for own votes" ON public.member_level_votes;
DROP POLICY IF EXISTS "Allow delete for own votes" ON public.member_level_votes;

CREATE POLICY "Allow select for authenticated users" ON public.member_level_votes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for own votes" ON public.member_level_votes
  FOR INSERT WITH CHECK (auth.uid() = voter_id);

CREATE POLICY "Allow update for own votes" ON public.member_level_votes
  FOR UPDATE USING (auth.uid() = voter_id);

CREATE POLICY "Allow delete for own votes" ON public.member_level_votes
  FOR DELETE USING (auth.uid() = voter_id);

-- updated_at 자동 업데이트 함수 생성 (존재하지 않는 경우 대비)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql 
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- updated_at 트리거 연결
DROP TRIGGER IF EXISTS on_member_level_votes_updated ON public.member_level_votes;
CREATE TRIGGER on_member_level_votes_updated
  BEFORE UPDATE ON public.member_level_votes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- level_info 테이블의 RLS 활성화 및 모든 사용자 SELECT 허용 정책 설정
ALTER TABLE public.level_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select for everyone" ON public.level_info;
CREATE POLICY "Allow select for everyone" ON public.level_info
  FOR SELECT USING (true);

-- member_rating_settings 테이블 생성
CREATE TABLE IF NOT EXISTS public.member_rating_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 초기 설정 레코드 추가 (없는 경우)
INSERT INTO public.member_rating_settings (id, start_date, end_date)
VALUES (1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- RLS 활성화
ALTER TABLE public.member_rating_settings ENABLE ROW LEVEL SECURITY;

-- 정책 설정 (모든 사용자는 SELECT 가능, 관리자만 INSERT/UPDATE/DELETE 가능)
DROP POLICY IF EXISTS "Allow select for everyone" ON public.member_rating_settings;
CREATE POLICY "Allow select for everyone" ON public.member_rating_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all for admin users" ON public.member_rating_settings;
CREATE POLICY "Allow all for admin users" ON public.member_rating_settings
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 투표 결과 기반 profiles.skill_level 자동 계산 및 업데이트 함수 생성
CREATE OR REPLACE FUNCTION public.update_profile_skill_level_from_votes()
RETURNS TRIGGER AS $$
DECLARE
    target_subject_id UUID;
    avg_score NUMERIC;
    target_level_code TEXT;
BEGIN
    -- 이벤트 발생 데이터에 따른 대상 subject_id 식별
    IF (TG_OP = 'DELETE') THEN
        target_subject_id := OLD.subject_id;
    ELSE
        target_subject_id := NEW.subject_id;
    END IF;

    -- 해당 회원에 대한 모든 투표의 level_info 점수 평균 계산
    SELECT AVG(l.score) INTO avg_score
    FROM public.member_level_votes v
    JOIN public.level_info l ON v.skill_level = l.code
    WHERE v.subject_id = target_subject_id;

    IF avg_score IS NOT NULL THEN
        -- 평균 점수와 가장 절댓값 차이가 작은 급수 코드 검색
        SELECT code INTO target_level_code
        FROM public.level_info
        WHERE score IS NOT NULL
        ORDER BY ABS(score - avg_score) ASC, score DESC
        LIMIT 1;

        -- 계산된 등급 코드로 회원 프로필 갱신
        IF target_level_code IS NOT NULL THEN
            UPDATE public.profiles
            SET skill_level = target_level_code, updated_at = NOW()
            WHERE id = target_subject_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 트리거 바인딩 (투표 변경 발생 후 동작)
DROP TRIGGER IF EXISTS trigger_update_profile_skill_level ON public.member_level_votes;
CREATE TRIGGER trigger_update_profile_skill_level
AFTER INSERT OR UPDATE OR DELETE ON public.member_level_votes
FOR EACH ROW
EXECUTE FUNCTION public.update_profile_skill_level_from_votes();
