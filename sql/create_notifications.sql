-- 알림 시스템을 위한 notifications 테이블 생성

-- notifications 테이블 생성
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'general',
    related_match_id UUID NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE NULL
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- RLS 정책 설정
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 알림만 조회 가능
CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

-- 사용자는 자신의 알림을 읽음 처리할 수 있음
CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- 관리자는 모든 알림을 삽입할 수 있음 (시스템 알림 발송용)
CREATE POLICY "Admins can insert notifications" ON notifications
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
        OR auth.uid() = user_id -- 사용자는 자신에게만 알림 생성 가능
    );

-- 알림 타입별 분류를 위한 ENUM 또는 CHECK 제약조건 (선택사항)
ALTER TABLE notifications 
ADD CONSTRAINT check_notification_type 
CHECK (type IN ('general', 'match_preparation', 'match_result', 'schedule_change', 'system'));

-- 알림 통계 뷰 생성 (선택사항)
-- 참고: VIEW는 기본 테이블의 RLS 정책을 상속받으므로 별도 RLS 설정이 불필요함
CREATE OR REPLACE VIEW user_notification_stats AS
SELECT 
    user_id,
    COUNT(*) as total_notifications,
    COUNT(*) FILTER (WHERE is_read = FALSE) as unread_count,
    COUNT(*) FILTER (WHERE is_read = TRUE) as read_count,
    MAX(created_at) as latest_notification
FROM notifications
GROUP BY user_id;

COMMENT ON TABLE notifications IS '사용자 알림 시스템 - 경기 준비, 결과, 일정 변경 등 알림 저장';
COMMENT ON COLUMN notifications.type IS '알림 유형: general, match_preparation, match_result, schedule_change, system';
COMMENT ON COLUMN notifications.related_match_id IS '관련 경기 ID (경기 관련 알림인 경우)';
