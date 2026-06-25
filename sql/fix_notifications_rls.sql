-- notifications 테이블의 RLS 정책 수정 및 관리자 권한 부여

-- 1. 기존에 존재할 수 있는 관리자 관련 select/update/delete 정책 삭제 (오류 방지)
DROP POLICY IF EXISTS "Admins can select all notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can update all notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins can delete all notifications" ON public.notifications;

-- 2. 관리자가 모든 알림을 조회할 수 있도록 SELECT 정책 추가
CREATE POLICY "Admins can select all notifications" ON public.notifications
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- 3. 관리자가 모든 알림을 수정(읽음 처리 등)할 수 있도록 UPDATE 정책 추가
CREATE POLICY "Admins can update all notifications" ON public.notifications
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- 4. 관리자가 모든 알림을 삭제할 수 있도록 DELETE 정책 추가 (API 우회 외 직접 삭제 대비)
CREATE POLICY "Admins can delete all notifications" ON public.notifications
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );
