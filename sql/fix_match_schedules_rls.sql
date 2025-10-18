-- match_schedules 테이블 RLS 정책 수정
-- 403 Forbidden 오류 해결

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Authenticated users can insert match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Users can update their own match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Users can delete their own match schedules" ON match_schedules;

-- 새로운 정책 생성: 인증된 사용자는 경기 일정을 생성할 수 있음
CREATE POLICY "Authenticated users can insert match schedules" ON match_schedules
    FOR INSERT 
    WITH CHECK (auth.uid() IS NOT NULL);

-- 새로운 정책 생성: 관리자 또는 작성자가 수정 가능
CREATE POLICY "Admins and creators can update match schedules" ON match_schedules
    FOR UPDATE 
    USING (
        auth.uid() IS NOT NULL AND (
            auth.uid() = created_by OR 
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.role = 'admin'
            )
        )
    );

-- 새로운 정책 생성: 관리자 또는 작성자가 삭제 가능
CREATE POLICY "Admins and creators can delete match schedules" ON match_schedules
    FOR DELETE 
    USING (
        auth.uid() IS NOT NULL AND (
            auth.uid() = created_by OR 
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.role = 'admin'
            )
        )
    );

-- match_participants 테이블 정책도 수정
DROP POLICY IF EXISTS "Users can register for matches" ON match_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON match_participants;
DROP POLICY IF EXISTS "Users can cancel their own participation" ON match_participants;

-- 관리자는 모든 참가자를 관리할 수 있도록 정책 추가
CREATE POLICY "Users can register for matches" ON match_participants
    FOR INSERT 
    WITH CHECK (
        auth.uid() IS NOT NULL AND (
            auth.uid() = user_id OR
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.role = 'admin'
            )
        )
    );

CREATE POLICY "Users and admins can update participation" ON match_participants
    FOR UPDATE 
    USING (
        auth.uid() IS NOT NULL AND (
            auth.uid() = user_id OR
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.role = 'admin'
            )
        )
    );

CREATE POLICY "Users and admins can delete participation" ON match_participants
    FOR DELETE 
    USING (
        auth.uid() IS NOT NULL AND (
            auth.uid() = user_id OR
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.role = 'admin'
            )
        )
    );
