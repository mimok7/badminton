-- attendances 테이블 RLS 정책 업데이트
-- Supabase에서 실행하여 출석 기록 권한 문제를 해결하세요

-- 기존 정책들 삭제
DROP POLICY IF EXISTS "Users can insert their own attendance" ON attendances;
DROP POLICY IF EXISTS "Users can insert their own attendance v2" ON attendances;
DROP POLICY IF EXISTS "Users can update their own attendance" ON attendances;
DROP POLICY IF EXISTS "Users can update their own attendance v2" ON attendances;

-- 새로운 정책들 생성 (관리자 권한 포함)
CREATE POLICY "Users can insert attendance v3" ON attendances
    FOR INSERT WITH CHECK (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Users can update attendance v3" ON attendances
    FOR UPDATE USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 확인 메시지
SELECT 'attendances 테이블 RLS 정책 업데이트 완료' as status;
