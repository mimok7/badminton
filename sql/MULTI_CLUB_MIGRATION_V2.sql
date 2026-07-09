-- =============================================================================
-- 다중 클럽(Multi-Club) 전환 마이그레이션 V2 스크립트
-- 1차 마이그레이션에서 누락된 핵심 테이블에 club_id를 추가합니다.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_default_club_id UUID;
    t_name TEXT;
BEGIN
    -- 1. 기본 클럽(Default Club) 확인. 만약 없으면 오류 발생(1차 마이그레이션 선행 필요)
    SELECT id INTO v_default_club_id FROM public.clubs ORDER BY created_at ASC LIMIT 1;
    
    IF v_default_club_id IS NULL THEN
        RAISE EXCEPTION '기본 클럽이 존재하지 않습니다. MULTI_CLUB_MIGRATION.sql이 먼저 실행되어야 합니다.';
    END IF;

    -- 2. 대상 테이블 목록 (15개)
    FOR t_name IN SELECT unnest(ARRAY[
        'match_sessions',
        'match_participants',
        'match_results',
        'match_player_status',
        'recurring_match_templates',
        'tournaments',
        'courts',
        'products',
        'product_purchases',
        'surveys',
        'survey_responses',
        'challenge_requests',
        'member_level_votes',
        'member_rating_settings',
        'match_wager_proposals'
    ]) 
    LOOP
        -- 테이블이 존재하는지 확인
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t_name) THEN
            -- 컬럼이 없는지 확인
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t_name AND column_name = 'club_id') THEN
                -- 1) 컬럼 추가 (null 허용으로 먼저 생성)
                EXECUTE format('ALTER TABLE public.%I ADD COLUMN club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE', t_name);
                -- 2) 기존 데이터에 대해 기본 클럽 ID 설정
                EXECUTE format('UPDATE public.%I SET club_id = %L WHERE club_id IS NULL', t_name, v_default_club_id);
                -- 3) NOT NULL 제약조건 추가
                EXECUTE format('ALTER TABLE public.%I ALTER COLUMN club_id SET NOT NULL', t_name);
            END IF;
        END IF;
    END LOOP;
END $$;

COMMIT;

-- 스크립트 실행 완료 메시지:
-- 이 스크립트를 Supabase SQL Editor에서 실행하시면 누락된 테이블에 club_id 추가가 완료됩니다.
