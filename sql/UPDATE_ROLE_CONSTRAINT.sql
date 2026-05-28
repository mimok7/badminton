-- role 제약 조건 업데이트 (manager 역할 추가)
-- Supabase SQL 에디터에서 실행하세요

BEGIN;

-- 기존 제약 조건 제거
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 새 제약 조건 추가 (admin, manager, user)
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('admin', 'manager', 'user'));

COMMIT;
