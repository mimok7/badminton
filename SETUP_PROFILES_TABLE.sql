-- Supabase에서 실행할 SQL 스크립트

-- 1. profiles 테이블이 존재하는지 확인
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'profiles'
);

-- 2. profiles 테이블 생성 (존재하지 않을 경우)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  skill_level TEXT DEFAULT 'N' CHECK (skill_level IN ('A', 'B', 'C', 'D', 'N')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. RLS 정책 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 4. 기본 RLS 정책 생성
DO $$ 
BEGIN
  -- 기존 정책이 있으면 삭제
  DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
  DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
  
  -- 새 정책 생성
  CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);
    
  CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);
    
  CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);
END $$;

-- 5. 자동 프로필 생성 트리거 함수
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, skill_level)
  VALUES (NEW.id, 'user', 'N')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 트리거 생성 (기존 트리거가 있으면 삭제 후 생성)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. 기존 사용자들의 프로필 생성 (없는 경우)
INSERT INTO public.profiles (id, role, skill_level)
SELECT 
  au.id,
  'user',
  'N'
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 8. 확인 쿼리
SELECT 
  au.id,
  au.email,
  p.username,
  p.role,
  p.skill_level,
  p.created_at
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
ORDER BY au.created_at DESC;
