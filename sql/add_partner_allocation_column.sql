-- 1. match_participants 테이블에 partner_user_id 컬럼 추가
ALTER TABLE public.match_participants ADD COLUMN IF NOT EXISTS partner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. attendances 테이블에도 partner_user_id 컬럼 추가 (출석부 기준 자동 매칭 지원)
ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS partner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_match_participants_partner ON public.match_participants(partner_user_id);
CREATE INDEX IF NOT EXISTS idx_attendances_partner ON public.attendances(partner_user_id);
