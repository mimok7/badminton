-- 1. profiles 테이블에 is_guest 컬럼 추가
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT FALSE;

-- 2. 만료된 게스트 자동 삭제 함수 정의 (SECURITY DEFINER로 auth.users 삭제 권한 확보)
CREATE OR REPLACE FUNCTION delete_expired_guests()
RETURNS void AS $$
DECLARE
    guest_record RECORD;
BEGIN
    FOR guest_record IN 
        SELECT id FROM public.profiles 
        WHERE is_guest = TRUE 
        AND created_at < CURRENT_DATE
    LOOP
        DELETE FROM auth.users WHERE id = guest_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. pg_cron 스케줄러 등록 (지원되는 경우)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_extension 
        WHERE extname = 'pg_cron'
    ) THEN
        -- 기존 스케줄 제거
        PERFORM cron.unschedule('delete-guests-midnight');
        -- 매일 자정 실행
        PERFORM cron.schedule('delete-guests-midnight', '0 0 * * *', 'SELECT delete_expired_guests()');
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
