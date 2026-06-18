-- 목적:
-- 1. public.profiles.id 와 public.profiles.user_id(auth.users.id)를 가능한 한 동일한 값으로 통일
-- 2. profiles.id 를 참조하는 하위 테이블이 프로필 ID 변경을 자동 추적하도록 FK를 ON UPDATE CASCADE로 재구성
-- 3. 이후 신규/연결 프로필도 id = user_id 규칙을 자동 유지
--
-- 주의:
-- - user_id 가 NULL 인 placeholder 프로필은 그대로 유지됩니다.
-- - 실행 전 백업 권장

BEGIN;

-- 0) 충돌 가능성 사전 점검
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles p1
    JOIN public.profiles p2
      ON p1.user_id = p2.id
     AND p1.id <> p2.id
    WHERE p1.user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'profiles.id 를 user_id 로 변경할 때 충돌하는 행이 있습니다. 먼저 수동 정리가 필요합니다.';
  END IF;
END;
$$;

-- 1) profiles(id) 참조 FK를 ON UPDATE CASCADE 로 재구성
DO $$
BEGIN
  IF to_regclass('public.generated_matches') IS NOT NULL THEN
    ALTER TABLE public.generated_matches DROP CONSTRAINT IF EXISTS generated_matches_team1_player1_id_fkey;
    ALTER TABLE public.generated_matches DROP CONSTRAINT IF EXISTS generated_matches_team1_player2_id_fkey;
    ALTER TABLE public.generated_matches DROP CONSTRAINT IF EXISTS generated_matches_team2_player1_id_fkey;
    ALTER TABLE public.generated_matches DROP CONSTRAINT IF EXISTS generated_matches_team2_player2_id_fkey;

    ALTER TABLE public.generated_matches
      ADD CONSTRAINT generated_matches_team1_player1_id_fkey
        FOREIGN KEY (team1_player1_id) REFERENCES public.profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
      ADD CONSTRAINT generated_matches_team1_player2_id_fkey
        FOREIGN KEY (team1_player2_id) REFERENCES public.profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
      ADD CONSTRAINT generated_matches_team2_player1_id_fkey
        FOREIGN KEY (team2_player1_id) REFERENCES public.profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
      ADD CONSTRAINT generated_matches_team2_player2_id_fkey
        FOREIGN KEY (team2_player2_id) REFERENCES public.profiles(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF to_regclass('public.attendances') IS NOT NULL THEN
    ALTER TABLE public.attendances DROP CONSTRAINT IF EXISTS attendances_user_id_fkey;
    ALTER TABLE public.attendances
      ADD CONSTRAINT attendances_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF to_regclass('public.challenge_requests') IS NOT NULL THEN
    ALTER TABLE public.challenge_requests DROP CONSTRAINT IF EXISTS challenge_requests_challenger_id_fkey;
    ALTER TABLE public.challenge_requests DROP CONSTRAINT IF EXISTS challenge_requests_partner_id_fkey;
    ALTER TABLE public.challenge_requests DROP CONSTRAINT IF EXISTS challenge_requests_opponent1_id_fkey;
    ALTER TABLE public.challenge_requests DROP CONSTRAINT IF EXISTS challenge_requests_opponent2_id_fkey;

    ALTER TABLE public.challenge_requests
      ADD CONSTRAINT challenge_requests_challenger_id_fkey
        FOREIGN KEY (challenger_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
      ADD CONSTRAINT challenge_requests_partner_id_fkey
        FOREIGN KEY (partner_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
      ADD CONSTRAINT challenge_requests_opponent1_id_fkey
        FOREIGN KEY (opponent1_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
      ADD CONSTRAINT challenge_requests_opponent2_id_fkey
        FOREIGN KEY (opponent2_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF to_regclass('public.match_coin_bets') IS NOT NULL THEN
    ALTER TABLE public.match_coin_bets DROP CONSTRAINT IF EXISTS match_coin_bets_profile_id_fkey;
    ALTER TABLE public.match_coin_bets
      ADD CONSTRAINT match_coin_bets_profile_id_fkey
        FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF to_regclass('public.profile_coin_transactions') IS NOT NULL THEN
    ALTER TABLE public.profile_coin_transactions DROP CONSTRAINT IF EXISTS profile_coin_transactions_profile_id_fkey;
    ALTER TABLE public.profile_coin_transactions DROP CONSTRAINT IF EXISTS profile_coin_transactions_recorded_by_fkey;

    ALTER TABLE public.profile_coin_transactions
      ADD CONSTRAINT profile_coin_transactions_profile_id_fkey
        FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
      ADD CONSTRAINT profile_coin_transactions_recorded_by_fkey
        FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END;
$$;

-- 2) 앞으로 user_id 가 있으면 id 를 같은 값으로 강제
CREATE OR REPLACE FUNCTION public.sync_profile_id_with_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    NEW.id := NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_id_with_user_id ON public.profiles;

CREATE TRIGGER trg_sync_profile_id_with_user_id
  BEFORE INSERT OR UPDATE OF id, user_id
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_id_with_user_id();

-- 3) 기존 linked profile 을 일괄 정리
-- BEFORE UPDATE trigger + ON UPDATE CASCADE 덕분에 참조 테이블도 함께 갱신됩니다.
UPDATE public.profiles
SET user_id = user_id,
    updated_at = NOW()
WHERE user_id IS NOT NULL
  AND id <> user_id;

-- 4) 규칙 위반 방지용 체크 제약
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_matches_user_id_chk;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_matches_user_id_chk
  CHECK (user_id IS NULL OR id = user_id);

-- 5) auth signup/link trigger 도 동일 규칙을 따르도록 교체
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  matched_profile_id UUID;
BEGIN
  SELECT p.id
    INTO matched_profile_id
  FROM public.profiles p
  WHERE p.user_id = NEW.id
  LIMIT 1;

  IF matched_profile_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id
    INTO matched_profile_id
  FROM public.profiles p
  WHERE p.email = NEW.email
    AND p.user_id IS NULL
  ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
  LIMIT 1;

  IF matched_profile_id IS NOT NULL THEN
    UPDATE public.profiles
    SET user_id = NEW.id,
        email = COALESCE(NEW.email, email),
        username = COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'username', ''), username),
        full_name = COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), full_name),
        role = COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role', ''), role, 'user'),
        updated_at = NOW()
    WHERE id = matched_profile_id;

    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (
    id,
    user_id,
    email,
    username,
    full_name,
    role,
    skill_level
  )
  VALUES (
    NEW.id,
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role', ''), 'user'),
    'E2'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET id = EXCLUDED.id,
      email = EXCLUDED.email,
      updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_signup();

COMMIT;

-- 실행 후 점검용
SELECT
  COUNT(*) AS total_profiles,
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS linked_profiles,
  COUNT(*) FILTER (WHERE user_id IS NOT NULL AND id = user_id) AS linked_profiles_aligned,
  COUNT(*) FILTER (WHERE user_id IS NOT NULL AND id <> user_id) AS linked_profiles_misaligned
FROM public.profiles;
