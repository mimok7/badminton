-- attendances 테이블 foreign key 수정
-- Supabase에서 실행하여 외래키 제약조건 문제를 해결하세요

-- 기존 foreign key 제약조건 삭제
ALTER TABLE attendances DROP CONSTRAINT IF EXISTS attendances_user_id_fkey;

-- 새로운 foreign key 제약조건 추가 (profiles.id 참조)
ALTER TABLE attendances ADD CONSTRAINT attendances_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- 확인 메시지
SELECT 'attendances 테이블 foreign key 수정 완료' as status;
