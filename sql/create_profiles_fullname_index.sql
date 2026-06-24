-- profiles 테이블의 full_name 컬럼에 B-tree 인덱스 생성
-- 로그인 이메일 자동완성 시 이름 검색 성능 개선용
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON public.profiles (full_name);
