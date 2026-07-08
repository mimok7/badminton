-- =============================================================================
-- 다중 클럽(Multi-Club) 전환 및 이전 대진표 자동 삭제 마이그레이션 스크립트
-- =============================================================================

BEGIN;

-- 1. clubs 테이블 생성
CREATE TABLE IF NOT EXISTS public.clubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 기본 클럽 생성 (기존 데이터 연동용)
DO $$
DECLARE
    v_default_club_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.clubs LIMIT 1) THEN
        INSERT INTO public.clubs (name, code, description)
        VALUES ('기본 클럽', 'DEFAULT', '기존 데이터가 이전된 기본 클럽입니다.')
        RETURNING id INTO v_default_club_id;
    ELSE
        SELECT id INTO v_default_club_id FROM public.clubs ORDER BY created_at ASC LIMIT 1;
    END IF;
END $$;

-- 3. club_members 테이블 생성 (다중 가입 및 클럽별 스탯 관리)
CREATE TABLE IF NOT EXISTS public.club_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'manager', 'member', 'guest')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'banned')),
    
    -- 클럽별 누적 데이터 (기존 profiles의 코인 시스템 대체)
    coin_balance INTEGER NOT NULL DEFAULT 30,
    coin_wins INTEGER NOT NULL DEFAULT 0,
    coin_losses INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(club_id, user_id)
);

-- 기존 profile 사용자들을 기본 클럽의 멤버로 등록 및 코인 정보 이전
DO $$
DECLARE
    v_default_club_id UUID;
BEGIN
    SELECT id INTO v_default_club_id FROM public.clubs ORDER BY created_at ASC LIMIT 1;
    
    INSERT INTO public.club_members (club_id, user_id, role, status, coin_balance, coin_wins, coin_losses)
    SELECT v_default_club_id, id, 
           CASE WHEN role = 'user' THEN 'member' ELSE role END, 
           'active', 
           COALESCE(coin_balance, 30), COALESCE(coin_wins, 0), COALESCE(coin_losses, 0)
    FROM public.profiles
    ON CONFLICT DO NOTHING;
END $$;


-- 4. 각 주요 테이블에 club_id 추가
DO $$
DECLARE
    v_default_club_id UUID;
    t_name TEXT;
BEGIN
    SELECT id INTO v_default_club_id FROM public.clubs ORDER BY created_at ASC LIMIT 1;

    -- 테이블 목록
    FOR t_name IN SELECT unnest(ARRAY[
        'match_schedules', 
        'attendances', 
        'notifications', 
        'team_assignments', 
        'generated_matches', 
        'tournament_matches',
        'match_coin_bets',
        'profile_coin_transactions'
    ]) 
    LOOP
        -- 테이블이 존재하는지 확인
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t_name) THEN
            -- 컬럼이 없는지 확인
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t_name AND column_name = 'club_id') THEN
                EXECUTE format('ALTER TABLE public.%I ADD COLUMN club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE', t_name);
                EXECUTE format('UPDATE public.%I SET club_id = %L WHERE club_id IS NULL', t_name, v_default_club_id);
                EXECUTE format('ALTER TABLE public.%I ALTER COLUMN club_id SET NOT NULL', t_name);
            END IF;
        END IF;
    END LOOP;
END $$;


-- 5. 대진표(generated_matches) 삭제 시 profile_coin_transactions 데이터 보존 처리
-- ON DELETE CASCADE -> ON DELETE SET NULL 로 변경
DO $$
BEGIN
    -- 기존 제약조건 삭제
    ALTER TABLE public.profile_coin_transactions DROP CONSTRAINT IF EXISTS profile_coin_transactions_match_id_fkey;
    
    -- match_id를 NULL 허용으로 변경
    ALTER TABLE public.profile_coin_transactions ALTER COLUMN match_id DROP NOT NULL;
    
    -- SET NULL 제약조건 재설정
    ALTER TABLE public.profile_coin_transactions 
    ADD CONSTRAINT profile_coin_transactions_match_id_fkey 
    FOREIGN KEY (match_id) REFERENCES public.generated_matches(id) ON DELETE SET NULL;
END $$;


-- 6. 대진표 삭제 시 match_coin_bets 삭제 정책은 유지 (혹은 SET NULL)
-- 배팅 기록도 남기고 싶다면 동일하게 처리합니다.
DO $$
BEGIN
    ALTER TABLE public.match_coin_bets DROP CONSTRAINT IF EXISTS match_coin_bets_match_id_fkey;
    ALTER TABLE public.match_coin_bets ALTER COLUMN match_id DROP NOT NULL;
    ALTER TABLE public.match_coin_bets ADD CONSTRAINT match_coin_bets_match_id_fkey 
    FOREIGN KEY (match_id) REFERENCES public.generated_matches(id) ON DELETE SET NULL;
END $$;


-- 7. 만료된 대진표 삭제를 위한 저장 프로시저(RPC)
-- 어제 날짜 이전의 경기 중 종료된(completed) 대진표를 삭제합니다.
CREATE OR REPLACE FUNCTION public.archive_expired_brackets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- match_schedules 중 어제 이전 날짜이면서 완료된 경기에 속한 대진표 삭제
    -- ON DELETE SET NULL 덕분에 코인 기록과 유저 전적(profile_coin_transactions)은 안전하게 남습니다.
    
    DELETE FROM public.generated_matches
    WHERE id IN (
        SELECT g.id 
        FROM public.generated_matches g
        JOIN public.match_schedules ms ON g.club_id = ms.club_id AND g.id = ms.generated_match_id
        WHERE ms.status = 'completed' AND ms.match_date < CURRENT_DATE
    );
    
    -- team_assignments 역시 과거 대진표 삭제
    DELETE FROM public.team_assignments
    WHERE assignment_date < CURRENT_DATE;
    
END;
$$;

COMMIT;

-- 완료되었습니다. 이제 이 스크립트를 Supabase SQL Editor에서 실행하시면 DB 마이그레이션이 완료됩니다.
