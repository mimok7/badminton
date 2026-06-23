-- 1. profiles 테이블에 avatar_url 컬럼 추가
-- (Supabase SQL Editor에서 이 쿼리를 실행해 주세요)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- [참고] Storage 버킷 및 정책 관련 설정
-- storage.objects 테이블 소유자 권한 에러가 발생하는 경우, 
-- 아래 쿼리 대신 Supabase 웹 대시보드 UI를 통해 'avatars' 버킷을 생성하고 정책을 적용하는 것을 권장합니다.
-- 자세한 설정 방법은 답변 안내를 참고해 주세요.

