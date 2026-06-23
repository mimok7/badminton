-- 경기 결과 기반 사용자 코인 시스템
-- 모든 사용자 30코인 일괄 지급
-- 기본 배팅 1코인, 사용자별 최대 3코인까지 설정 가능
-- 패자 코인이 승자에게 이동하는 제로섬 구조

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS coin_balance INTEGER NOT NULL DEFAULT 30,
ADD COLUMN IF NOT EXISTS coin_wins INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS coin_losses INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS coin_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.profiles
SET coin_balance = 30,
    coin_wins = 0,
    coin_losses = 0,
    coin_updated_at = NOW();

COMMENT ON COLUMN public.profiles.coin_balance IS '경기 결과 및 관리자 조정으로 변동되는 사용자 코인 잔액';
COMMENT ON COLUMN public.profiles.coin_wins IS '코인 정산이 반영된 누적 승리 수';
COMMENT ON COLUMN public.profiles.coin_losses IS '코인 정산이 반영된 누적 패배 수';
COMMENT ON COLUMN public.profiles.coin_updated_at IS '코인 정보 마지막 갱신 시각';

CREATE TABLE IF NOT EXISTS public.match_coin_bets (
    id BIGSERIAL PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES public.generated_matches(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    wager_amount INTEGER NOT NULL DEFAULT 1 CHECK (wager_amount BETWEEN 1 AND 3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (match_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_match_coin_bets_match_id
    ON public.match_coin_bets(match_id);

CREATE INDEX IF NOT EXISTS idx_match_coin_bets_profile_id
    ON public.match_coin_bets(profile_id, updated_at DESC);

ALTER TABLE public.match_coin_bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own match coin bets" ON public.match_coin_bets;
DROP POLICY IF EXISTS "Users can insert own match coin bets" ON public.match_coin_bets;
DROP POLICY IF EXISTS "Users can update own match coin bets" ON public.match_coin_bets;
DROP POLICY IF EXISTS "Admins can view all match coin bets" ON public.match_coin_bets;

CREATE POLICY "Users can view own match coin bets" ON public.match_coin_bets
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = match_coin_bets.profile_id
              AND (p.user_id = auth.uid() OR p.id = auth.uid())
        )
    );

CREATE POLICY "Users can insert own match coin bets" ON public.match_coin_bets
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = match_coin_bets.profile_id
              AND (p.user_id = auth.uid() OR p.id = auth.uid())
        )
    );

CREATE POLICY "Users can update own match coin bets" ON public.match_coin_bets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = match_coin_bets.profile_id
              AND (p.user_id = auth.uid() OR p.id = auth.uid())
        )
    );

CREATE POLICY "Admins can view all match coin bets" ON public.match_coin_bets
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE (p.user_id = auth.uid() OR p.id = auth.uid())
              AND p.role = 'admin'
        )
    );

CREATE TABLE IF NOT EXISTS public.profile_coin_transactions (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    match_id BIGINT NOT NULL REFERENCES public.generated_matches(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('win', 'loss')),
    delta INTEGER NOT NULL,
    wager_amount INTEGER NOT NULL DEFAULT 1 CHECK (wager_amount BETWEEN 1 AND 3),
    team_side TEXT NOT NULL CHECK (team_side IN ('team1', 'team2')),
    team1_score INTEGER NOT NULL CHECK (team1_score >= 0),
    team2_score INTEGER NOT NULL CHECK (team2_score >= 0),
    recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (match_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_coin_transactions_profile_id
    ON public.profile_coin_transactions(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_coin_transactions_match_id
    ON public.profile_coin_transactions(match_id);

ALTER TABLE public.profile_coin_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own coin transactions" ON public.profile_coin_transactions;
DROP POLICY IF EXISTS "Admins can view all coin transactions" ON public.profile_coin_transactions;

CREATE POLICY "Users can view own coin transactions" ON public.profile_coin_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = profile_coin_transactions.profile_id
              AND (p.user_id = auth.uid() OR p.id = auth.uid())
        )
    );

CREATE POLICY "Admins can view all coin transactions" ON public.profile_coin_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE (p.user_id = auth.uid() OR p.id = auth.uid())
              AND p.role = 'admin'
        )
    );

CREATE OR REPLACE FUNCTION public.record_match_result_with_coins(
    p_match_id BIGINT,
    p_winner_team1 BOOLEAN,
    p_team1_score INTEGER,
    p_team2_score INTEGER,
    p_recorded_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_match public.generated_matches%ROWTYPE;
    v_match_result JSONB;
    v_team1_ids UUID[];
    v_team2_ids UUID[];
    v_team1_wagers INTEGER[];
    v_team2_wagers INTEGER[];
    v_winning_ids UUID[];
    v_losing_ids UUID[];
    v_winning_wagers INTEGER[];
    v_losing_wagers INTEGER[];
    v_winning_gains INTEGER[];
    v_profile_id UUID;
    v_old_delta INTEGER;
    v_old_type TEXT;
    v_old_wager INTEGER;
    v_delta INTEGER;
    v_balance INTEGER;
    v_idx INTEGER;
    v_allocated INTEGER := 0;
    v_remainder INTEGER := 0;
    v_losing_total INTEGER := 0;
    v_winning_total INTEGER := 0;
    v_gain INTEGER := 0;
    v_team_side TEXT;
    v_wager INTEGER;
BEGIN
    IF p_team1_score IS NULL OR p_team2_score IS NULL OR p_team1_score < 0 OR p_team2_score < 0 THEN
        RAISE EXCEPTION '점수는 0 이상의 숫자여야 합니다.';
    END IF;

    IF p_team1_score = p_team2_score THEN
        RAISE EXCEPTION '무승부는 저장할 수 없습니다.';
    END IF;

    SELECT *
    INTO v_match
    FROM public.generated_matches
    WHERE id = p_match_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '존재하지 않는 경기입니다. (%).', p_match_id;
    END IF;

    v_team1_ids := ARRAY(
        SELECT value
        FROM unnest(ARRAY[v_match.team1_player1_id, v_match.team1_player2_id]) WITH ORDINALITY AS t(value, ord)
        WHERE value IS NOT NULL
        ORDER BY ord
    );

    v_team2_ids := ARRAY(
        SELECT value
        FROM unnest(ARRAY[v_match.team2_player1_id, v_match.team2_player2_id]) WITH ORDINALITY AS t(value, ord)
        WHERE value IS NOT NULL
        ORDER BY ord
    );

    v_team1_wagers := ARRAY(
        SELECT COALESCE((
            SELECT wager_amount
            FROM public.match_coin_bets b
            WHERE b.match_id = p_match_id
              AND b.profile_id = player_id
        ), 1)
        FROM unnest(v_team1_ids) AS player_id
    );

    v_team2_wagers := ARRAY(
        SELECT COALESCE((
            SELECT wager_amount
            FROM public.match_coin_bets b
            WHERE b.match_id = p_match_id
              AND b.profile_id = player_id
        ), 1)
        FROM unnest(v_team2_ids) AS player_id
    );

    IF p_winner_team1 THEN
        v_winning_ids := v_team1_ids;
        v_winning_wagers := v_team1_wagers;
        v_losing_ids := v_team2_ids;
        v_losing_wagers := v_team2_wagers;
    ELSE
        v_winning_ids := v_team2_ids;
        v_winning_wagers := v_team2_wagers;
        v_losing_ids := v_team1_ids;
        v_losing_wagers := v_team1_wagers;
    END IF;

    SELECT COALESCE(SUM(value), 0)
    INTO v_losing_total
    FROM unnest(v_losing_wagers) AS value;

    SELECT COALESCE(SUM(value), 0)
    INTO v_winning_total
    FROM unnest(v_winning_wagers) AS value;

    IF v_losing_total <= 0 OR v_winning_total <= 0 THEN
        RAISE EXCEPTION '배팅 코인 합계가 올바르지 않습니다.';
    END IF;

    FOR v_idx IN COALESCE(array_lower(v_losing_ids, 1), 1)..COALESCE(array_upper(v_losing_ids, 1), 0) LOOP
        SELECT coin_balance
        INTO v_balance
        FROM public.profiles
        WHERE id = v_losing_ids[v_idx]
        FOR UPDATE;

        IF COALESCE(v_balance, 0) < v_losing_wagers[v_idx] THEN
            RAISE EXCEPTION '패배 팀 선수의 코인이 부족하여 정산할 수 없습니다.';
        END IF;
    END LOOP;

    v_winning_gains := ARRAY[]::INTEGER[];

    FOR v_idx IN COALESCE(array_lower(v_winning_ids, 1), 1)..COALESCE(array_upper(v_winning_ids, 1), 0) LOOP
        v_gain := FLOOR((v_losing_total::NUMERIC * v_winning_wagers[v_idx]::NUMERIC) / v_winning_total::NUMERIC);
        v_winning_gains := array_append(v_winning_gains, v_gain);
        v_allocated := v_allocated + v_gain;
    END LOOP;

    v_remainder := v_losing_total - v_allocated;

    IF v_remainder > 0 THEN
        FOR v_idx IN 1..v_remainder LOOP
            v_winning_gains[v_idx] := v_winning_gains[v_idx] + 1;
        END LOOP;
    END IF;

    INSERT INTO public.match_results (
        match_id,
        winner_team1,
        team1_score,
        team2_score
    )
    VALUES (
        p_match_id,
        p_winner_team1,
        p_team1_score,
        p_team2_score
    )
    ON CONFLICT (match_id) DO UPDATE
    SET winner_team1 = EXCLUDED.winner_team1,
        team1_score = EXCLUDED.team1_score,
        team2_score = EXCLUDED.team2_score;

    FOR v_idx IN COALESCE(array_lower(v_team1_ids, 1), 1)..COALESCE(array_upper(v_team1_ids, 1), 0) LOOP
        v_profile_id := v_team1_ids[v_idx];
        v_wager := v_team1_wagers[v_idx];
        v_team_side := 'team1';
        v_delta := CASE
            WHEN p_winner_team1 THEN v_winning_gains[v_idx]
            ELSE -v_wager
        END;

        SELECT delta, transaction_type, wager_amount
        INTO v_old_delta, v_old_type, v_old_wager
        FROM public.profile_coin_transactions
        WHERE match_id = p_match_id
          AND profile_id = v_profile_id;

        UPDATE public.profiles
        SET coin_balance = coin_balance + (v_delta - COALESCE(v_old_delta, 0)),
            coin_wins = coin_wins
                + (CASE WHEN v_delta > 0 THEN 1 ELSE 0 END)
                - (CASE WHEN COALESCE(v_old_type, '') = 'win' THEN 1 ELSE 0 END),
            coin_losses = coin_losses
                + (CASE WHEN v_delta < 0 THEN 1 ELSE 0 END)
                - (CASE WHEN COALESCE(v_old_type, '') = 'loss' THEN 1 ELSE 0 END),
            coin_updated_at = NOW()
        WHERE id = v_profile_id;

        INSERT INTO public.profile_coin_transactions (
            profile_id,
            match_id,
            transaction_type,
            delta,
            wager_amount,
            team_side,
            team1_score,
            team2_score,
            recorded_by,
            created_at,
            updated_at
        )
        VALUES (
            v_profile_id,
            p_match_id,
            CASE WHEN v_delta > 0 THEN 'win' ELSE 'loss' END,
            v_delta,
            v_wager,
            v_team_side,
            p_team1_score,
            p_team2_score,
            p_recorded_by,
            NOW(),
            NOW()
        )
        ON CONFLICT (match_id, profile_id) DO UPDATE
        SET transaction_type = EXCLUDED.transaction_type,
            delta = EXCLUDED.delta,
            wager_amount = EXCLUDED.wager_amount,
            team_side = EXCLUDED.team_side,
            team1_score = EXCLUDED.team1_score,
            team2_score = EXCLUDED.team2_score,
            recorded_by = EXCLUDED.recorded_by,
            updated_at = NOW();
    END LOOP;

    FOR v_idx IN COALESCE(array_lower(v_team2_ids, 1), 1)..COALESCE(array_upper(v_team2_ids, 1), 0) LOOP
        v_profile_id := v_team2_ids[v_idx];
        v_wager := v_team2_wagers[v_idx];
        v_team_side := 'team2';
        v_delta := CASE
            WHEN p_winner_team1 THEN -v_wager
            ELSE v_winning_gains[v_idx]
        END;

        SELECT delta, transaction_type, wager_amount
        INTO v_old_delta, v_old_type, v_old_wager
        FROM public.profile_coin_transactions
        WHERE match_id = p_match_id
          AND profile_id = v_profile_id;

        UPDATE public.profiles
        SET coin_balance = coin_balance + (v_delta - COALESCE(v_old_delta, 0)),
            coin_wins = coin_wins
                + (CASE WHEN v_delta > 0 THEN 1 ELSE 0 END)
                - (CASE WHEN COALESCE(v_old_type, '') = 'win' THEN 1 ELSE 0 END),
            coin_losses = coin_losses
                + (CASE WHEN v_delta < 0 THEN 1 ELSE 0 END)
                - (CASE WHEN COALESCE(v_old_type, '') = 'loss' THEN 1 ELSE 0 END),
            coin_updated_at = NOW()
        WHERE id = v_profile_id;

        INSERT INTO public.profile_coin_transactions (
            profile_id,
            match_id,
            transaction_type,
            delta,
            wager_amount,
            team_side,
            team1_score,
            team2_score,
            recorded_by,
            created_at,
            updated_at
        )
        VALUES (
            v_profile_id,
            p_match_id,
            CASE WHEN v_delta > 0 THEN 'win' ELSE 'loss' END,
            v_delta,
            v_wager,
            v_team_side,
            p_team1_score,
            p_team2_score,
            p_recorded_by,
            NOW(),
            NOW()
        )
        ON CONFLICT (match_id, profile_id) DO UPDATE
        SET transaction_type = EXCLUDED.transaction_type,
            delta = EXCLUDED.delta,
            wager_amount = EXCLUDED.wager_amount,
            team_side = EXCLUDED.team_side,
            team1_score = EXCLUDED.team1_score,
            team2_score = EXCLUDED.team2_score,
            recorded_by = EXCLUDED.recorded_by,
            updated_at = NOW();
    END LOOP;

    v_match_result := jsonb_build_object(
        'winner', CASE WHEN p_winner_team1 THEN 'team1' ELSE 'team2' END,
        'score', format('%s:%s', p_team1_score, p_team2_score),
        'team1_score', p_team1_score,
        'team2_score', p_team2_score,
        'total_losing_pool', v_losing_total,
        'team1_bets', v_team1_wagers,
        'team2_bets', v_team2_wagers,
        'completed_at', NOW(),
        'recorded_by', p_recorded_by
    );

    UPDATE public.generated_matches
    SET status = 'completed',
        completed_at = NOW(),
        match_result = v_match_result,
        updated_at = NOW()
    WHERE id = p_match_id;

    UPDATE public.match_schedules
    SET status = 'completed',
        match_result = v_match_result,
        updated_at = NOW()
    WHERE generated_match_id = p_match_id;

    RETURN jsonb_build_object(
        'match_id', p_match_id,
        'winner', CASE WHEN p_winner_team1 THEN 'team1' ELSE 'team2' END,
        'score', format('%s:%s', p_team1_score, p_team2_score),
        'default_wager', 1,
        'max_wager', 3,
        'total_losing_pool', v_losing_total
    );
END;
$$;

COMMENT ON FUNCTION public.record_match_result_with_coins(BIGINT, BOOLEAN, INTEGER, INTEGER, UUID)
    IS '경기 결과를 저장하고 경기별 배팅 코인을 기준으로 패자 코인을 승자에게 정산한다.';
