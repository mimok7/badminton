-- 1. clubs 테이블에 추가 필드 생성
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS address VARCHAR(255);
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS manager_name VARCHAR(100);

-- 2. match_schedules RLS 수정 (클럽 매니저도 수정/삭제 가능하도록)
DROP POLICY IF EXISTS "Admins and creators can update match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Admins and creators can delete match schedules" ON match_schedules;

CREATE POLICY "Admins and creators can update match schedules" ON match_schedules
    FOR UPDATE 
    USING (
        auth.uid() IS NOT NULL AND (
            auth.uid() = created_by OR 
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE (profiles.user_id = auth.uid() OR profiles.id = auth.uid())
                AND profiles.role = 'admin'
            ) OR
            EXISTS (
                SELECT 1 FROM club_members
                WHERE club_members.user_id = auth.uid()
                AND club_members.club_id = match_schedules.club_id
                AND club_members.role IN ('owner', 'admin', 'manager')
            )
        )
    );

CREATE POLICY "Admins and creators can delete match schedules" ON match_schedules
    FOR DELETE 
    USING (
        auth.uid() IS NOT NULL AND (
            auth.uid() = created_by OR 
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE (profiles.user_id = auth.uid() OR profiles.id = auth.uid())
                AND profiles.role = 'admin'
            ) OR
            EXISTS (
                SELECT 1 FROM club_members
                WHERE club_members.user_id = auth.uid()
                AND club_members.club_id = match_schedules.club_id
                AND club_members.role IN ('owner', 'admin', 'manager')
            )
        )
    );
