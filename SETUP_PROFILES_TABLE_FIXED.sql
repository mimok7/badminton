-- Supabase에서 실행할 프로필 테이블 설정 SQL 스크립트

-- 0. 기존 제약조건 확인 및 정리
-- 먼저 기존 외래 키 제약조건이 있다면 제거
ALTER TABLE IF EXISTS profiles DROP CONSTRAINT IF EXISTS profiles_skill_level_fkey;

-- 1. level_info 테이블 생성 (존재하지 않을 경우)
CREATE TABLE IF NOT EXISTS level_info (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 기본 레벨 정보 삽입
INSERT INTO level_info (code, name, description) VALUES
  ('A1', 'A1급', '최상급 실력 - 상위'),
  ('A2', 'A2급', '최상급 실력 - 하위'),
  ('B1', 'B1급', '상급 실력 - 상위'),
  ('B2', 'B2급', '상급 실력 - 하위'),
  ('C1', 'C1급', '중상급 실력 - 상위'),
  ('C2', 'C2급', '중상급 실력 - 하위'),
  ('D1', 'D1급', '중급 실력 - 상위'),
  ('D2', 'D2급', '중급 실력 - 하위'),
  ('E1', 'E1급', '초급 실력 - 상위'),
  ('E2', 'E2급', '초급 실력 - 하위')
ON CONFLICT (code) DO NOTHING;

-- 3. profiles 테이블 생성 (존재하지 않을 경우)
-- 3. profiles 테이블 생성 (존재하지 않을 경우)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  skill_level TEXT DEFAULT 'E2' REFERENCES level_info(code),
  gender TEXT CHECK (gender IN ('M', 'F')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. RLS 정책 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 5. 기본 RLS 정책 생성 (기존 정책 삭제 후)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admin can view all profiles" ON profiles;

-- 사용자는 자신의 프로필 조회 가능
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- 사용자는 자신의 프로필 수정 가능
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- 사용자는 자신의 프로필 생성 가능
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 관리자는 모든 프로필 조회 가능
CREATE POLICY "Admin can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 6. 자동 프로필 생성 트리거 함수
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, skill_level, email)
  VALUES (NEW.id, 'user', 'E2', NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 7. 트리거 생성 (기존 트리거가 있으면 삭제 후 생성)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql 
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 9. updated_at 트리거
DROP TRIGGER IF EXISTS on_profiles_updated ON profiles;

CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 10. 기존 사용자들의 프로필 생성 (없는 경우)
INSERT INTO public.profiles (id, role, skill_level, email)
SELECT 
  au.id,
  'user',
  'E2',
  au.email
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 11. 확인 쿼리 (실행 결과 확인용)
SELECT 
  'profiles 테이블 설정 완료' as status,
  COUNT(*) as total_profiles
FROM profiles;

-- 12. 사용자별 프로필 확인
SELECT 
  au.id,
  au.email,
  COALESCE(p.username, '미설정') as username,
  COALESCE(p.role, '미설정') as role,
  COALESCE(p.skill_level, '미설정') as skill_level,
  p.created_at
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
ORDER BY au.created_at DESC
LIMIT 10;
