-- 회원가입 시 프로필 연결 시스템 최적화

-- 1. 회원가입 후 프로필 연결을 위한 개선된 트리거 함수
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- 새 사용자가 가입했을 때
  -- 이미 user_id가 연결된 프로필이 있는지 확인
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id) THEN
    -- 이미 연결된 프로필이 있으면 아무것도 하지 않음 (회원가입 페이지에서 이미 연결했음)
    RETURN NEW;
  END IF;

  -- 이메일로 기존 프로필을 찾아서 연결 시도 (첫 번째만 업데이트)
  UPDATE public.profiles 
  SET user_id = NEW.id, email = NEW.email
  WHERE id = (
    SELECT id FROM public.profiles 
    WHERE email = NEW.email AND user_id IS NULL 
    LIMIT 1
  );

  -- 만약 이메일로도 찾을 수 없으면 새 프로필 생성
  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, role, skill_level, email)
    VALUES (NEW.id, 'user', 'E2', NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

-- 2. 기존 트리거 교체
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();

-- 3. 회원가입 시 프로필 연결 상태 확인을 위한 함수
CREATE OR REPLACE FUNCTION public.check_profile_connection(user_email text)
RETURNS TABLE(
  profile_id integer,
  username text,
  user_id uuid,
  is_connected boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as profile_id,
    p.username,
    p.user_id,
    (p.user_id IS NOT NULL) as is_connected
  FROM public.profiles p
  WHERE p.email = user_email OR p.username = user_email;
END;
$$;

-- 4. 사용 가능한 프로필 목록 조회 함수 (회원가입용)
CREATE OR REPLACE FUNCTION public.get_available_profiles()
RETURNS TABLE(
  username text,
  skill_level text,
  skill_label text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.username,
    COALESCE(p.skill_level, 'E2'::text) as skill_level,
    COALESCE(li.name, p.skill_level, 'E2급'::text) as skill_label
  FROM public.profiles p
  LEFT JOIN level_info li ON p.skill_level = li.code
  WHERE p.user_id IS NULL 
    AND p.username IS NOT NULL 
    AND p.username != ''
  ORDER BY p.username;
END;
$$;

-- 5. 확인 쿼리
SELECT 'profile connection system updated' as status;

-- 사용 가능한 프로필 목록 확인
SELECT * FROM public.get_available_profiles() LIMIT 10;
