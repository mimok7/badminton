-- 기존 profiles 테이블 업데이트 (user_id는 로그인 시 채워질 예정)

-- 1. skill_level 제약조건 업데이트 (A1-E2 레벨 시스템)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_skill_level_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_skill_level_check 
  CHECK (skill_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2'));

-- 2. skill_level 기본값을 E2로 설정
ALTER TABLE profiles ALTER COLUMN skill_level SET DEFAULT 'E2';

-- 3. 기존 데이터에서 유효하지 않은 skill_level을 E2로 업데이트
UPDATE profiles 
SET skill_level = 'E2' 
WHERE skill_level NOT IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E1', 'E2') 
   OR skill_level IS NULL;

-- 4. RLS 정책 업데이트 (user_id 기반) - user_id가 채워진 후 적용됨
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 기존 정책 제거 후 재생성
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admin can view all profiles" ON profiles;

-- 임시로 모든 사용자가 자신의 프로필을 볼 수 있도록 설정 (user_id가 null일 수 있으므로)
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (
    auth.uid() = user_id OR 
    (user_id IS NULL AND auth.uid() IS NOT NULL)
  );

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (
    auth.uid() = user_id OR 
    (user_id IS NULL AND auth.uid() IS NOT NULL)
  );

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR 
    user_id IS NULL
  );

CREATE POLICY "Admin can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id = auth.uid() AND role = 'admin'
    ) OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id IS NULL AND role = 'admin' AND auth.uid() IS NOT NULL
    )
  );

-- 5. 자동 프로필 생성 및 업데이트 트리거 함수 (user_id 채우기)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- 새 사용자의 경우 프로필 생성
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id) THEN
    INSERT INTO public.profiles (user_id, role, skill_level, email)
    VALUES (NEW.id, 'user', 'E2', NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

-- 6. 기존 사용자 로그인 시 user_id 업데이트 함수
CREATE OR REPLACE FUNCTION public.update_user_id_on_login()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- 기존 프로필에서 user_id가 없는 경우 업데이트
  UPDATE public.profiles 
  SET user_id = NEW.id 
  WHERE user_id IS NULL 
    AND email = NEW.email
    AND user_id IS NULL;
  
  -- 프로필이 아예 없는 경우 생성
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.id) THEN
    INSERT INTO public.profiles (user_id, role, skill_level, email)
    VALUES (NEW.id, 'user', 'E2', NEW.email);
  END IF;
  
  RETURN NEW;
END;
$$;

-- 7. 트리거 생성
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 로그인 시 user_id 업데이트를 위한 트리거 (auth.users 업데이트 시)
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.update_user_id_on_login();

-- 8. updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql 
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profiles_updated ON profiles;
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 9. get_all_users RPC 함수 생성 (관리자용)
DROP FUNCTION IF EXISTS get_all_users();

CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE(
  id uuid,
  email text,
  username text,
  full_name text,
  role text,
  skill_level text,
  skill_label text,
  gender text,
  created_at timestamptz
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 현재 사용자가 admin인지 확인
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE (user_id = auth.uid() OR (user_id IS NULL AND auth.uid() IS NOT NULL)) 
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  RETURN QUERY
  SELECT 
    COALESCE(p.user_id, au.id) as id,
    au.email::text,
    p.username,
    p.full_name,
    COALESCE(p.role, 'user'::text) as role,
    COALESCE(p.skill_level, 'E2'::text) as skill_level,
    COALESCE(li.name, p.skill_level, 'E2급'::text) as skill_label,
    p.gender,
    COALESCE(au.created_at, p.updated_at) as created_at
  FROM public.profiles p
  LEFT JOIN auth.users au ON (p.user_id = au.id OR (p.user_id IS NULL AND p.email = au.email))
  LEFT JOIN level_info li ON p.skill_level = li.code
  ORDER BY COALESCE(au.created_at, p.updated_at) DESC;
END;
$$;

-- 10. 확인
SELECT 'profiles 테이블 업데이트 완료' as status, COUNT(*) as total_profiles FROM profiles;

-- 현재 사용자 상태 확인 (user_id가 null인 경우도 표시)
SELECT 
  COALESCE(p.user_id::text, 'NULL') as user_id,
  COALESCE(p.email, '미설정') as email,
  COALESCE(p.username, '미설정') as username,
  COALESCE(p.role, '미설정') as role,
  COALESCE(p.skill_level, '미설정') as skill_level,
  COALESCE(li.name, '레벨 정보 없음') as skill_label
FROM public.profiles p
LEFT JOIN level_info li ON p.skill_level = li.code
ORDER BY COALESCE(p.updated_at, p.id::text) DESC
LIMIT 5;

-- 레벨 정보 확인
SELECT 'level_info 테이블 상태' as info, COUNT(*) as total_levels FROM level_info;
SELECT code, name FROM level_info ORDER BY code;
