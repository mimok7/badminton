-- 사용자 도전 요청 시스템
-- 오늘 참가 선수 중 현재 대기/진행중 경기가 없는 선수만 도전 대상으로 사용

CREATE TABLE IF NOT EXISTS public.challenge_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_date DATE NOT NULL DEFAULT CURRENT_DATE,
    challenger_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    opponent1_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    opponent2_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'held', 'cancelled')),
    partner_response TEXT NOT NULL DEFAULT 'pending' CHECK (partner_response IN ('pending', 'accepted', 'held')),
    opponent1_response TEXT NOT NULL DEFAULT 'pending' CHECK (opponent1_response IN ('pending', 'accepted', 'held')),
    opponent2_response TEXT NOT NULL DEFAULT 'pending' CHECK (opponent2_response IN ('pending', 'accepted', 'held')),
    note TEXT,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT challenge_requests_unique_members CHECK (
        challenger_id <> partner_id
        AND challenger_id <> opponent1_id
        AND challenger_id <> opponent2_id
        AND partner_id <> opponent1_id
        AND partner_id <> opponent2_id
        AND opponent1_id <> opponent2_id
    )
);

CREATE INDEX IF NOT EXISTS idx_challenge_requests_challenge_date
    ON public.challenge_requests(challenge_date, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_challenge_requests_challenger_id
    ON public.challenge_requests(challenger_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_challenge_requests_partner_id
    ON public.challenge_requests(partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_challenge_requests_opponents
    ON public.challenge_requests(opponent1_id, opponent2_id, created_at DESC);

ALTER TABLE public.challenge_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view involved challenge requests" ON public.challenge_requests;
DROP POLICY IF EXISTS "Users can create own challenge requests" ON public.challenge_requests;
DROP POLICY IF EXISTS "Users can update involved challenge requests" ON public.challenge_requests;
DROP POLICY IF EXISTS "Admins can view all challenge requests" ON public.challenge_requests;

CREATE POLICY "Users can view involved challenge requests" ON public.challenge_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE (p.user_id = auth.uid() OR p.id = auth.uid())
              AND p.id IN (
                  challenge_requests.challenger_id,
                  challenge_requests.partner_id,
                  challenge_requests.opponent1_id,
                  challenge_requests.opponent2_id
              )
        )
    );

CREATE POLICY "Users can create own challenge requests" ON public.challenge_requests
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE (p.user_id = auth.uid() OR p.id = auth.uid())
              AND p.id = challenge_requests.challenger_id
        )
    );

CREATE POLICY "Users can update involved challenge requests" ON public.challenge_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE (p.user_id = auth.uid() OR p.id = auth.uid())
              AND p.id IN (
                  challenge_requests.challenger_id,
                  challenge_requests.partner_id,
                  challenge_requests.opponent1_id,
                  challenge_requests.opponent2_id
              )
        )
    );

CREATE POLICY "Admins can view all challenge requests" ON public.challenge_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE (p.user_id = auth.uid() OR p.id = auth.uid())
              AND p.role = 'admin'
        )
    );

COMMENT ON TABLE public.challenge_requests IS '오늘 참가 선수 중 현재 대기/진행중 경기가 없는 선수끼리 만드는 도전 요청';
COMMENT ON COLUMN public.challenge_requests.status IS '도전 전체 상태: pending, accepted, held, cancelled';
COMMENT ON COLUMN public.challenge_requests.partner_response IS '파트너 응답 상태';
COMMENT ON COLUMN public.challenge_requests.opponent1_response IS '상대 1 응답 상태';
COMMENT ON COLUMN public.challenge_requests.opponent2_response IS '상대 2 응답 상태';
