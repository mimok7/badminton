-- 배드민턴 경기 관리 시스템 데이터베이스 스키마
-- Supabase에서 실행할 SQL 스크립트

-- =============================================================================
-- 1. 기본 사용자 프로필 테이블
-- ===============================================================-- notifications RLS 정책
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 기존 정책들 삭제 (있다면)
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can insert notifications" ON notifications;

-- 사용자는 자신의 알림만 조회 가능
CREATE POLICY "Users can view own notifications v2" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

-- 사용자는 자신의 알림을 읽음 처리할 수 있음
CREATE POLICY "Users can update own notifications v2" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- 관리자는 모든 알림을 삽입할 수 있음 (시스템 알림 발송용)
CREATE POLICY "Admins can insert notifications v2" ON notifications
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE user_id = auth.uid()
            AND profiles.role = 'admin'
        )
        OR auth.uid() = user_id
    );-- profiles 테이블 (auth.users와 연결)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  skill_level TEXT DEFAULT 'N' CHECK (skill_level IN ('A', 'B', 'C', 'D', 'N')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- profiles 테이블 RLS 정책
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 기존 정책들 삭제 (있다면)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- 사용자는 자신의 프로필만 조회 가능
CREATE POLICY "Users can view own profile v2" ON profiles
    FOR SELECT USING (auth.uid() = id);

-- 사용자는 자신의 프로필을 수정 가능
CREATE POLICY "Users can update own profile v2" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- 사용자는 자신의 프로필을 생성 가능
CREATE POLICY "Users can insert own profile v2" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- =============================================================================
-- 2. 경기 일정 관리 테이블
-- =============================================================================

-- match_schedules 테이블 (관리자가 생성하는 경기 일정)
CREATE TABLE IF NOT EXISTS match_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    location VARCHAR(255) NOT NULL,
    max_participants INTEGER NOT NULL DEFAULT 20,
    current_participants INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- match_schedules 인덱스
CREATE INDEX IF NOT EXISTS idx_match_schedules_date ON match_schedules(match_date);
CREATE INDEX IF NOT EXISTS idx_match_schedules_status ON match_schedules(status);

-- match_schedules RLS 정책
ALTER TABLE match_schedules ENABLE ROW LEVEL SECURITY;

-- 기존 정책들 삭제 (있다면)
DROP POLICY IF EXISTS "Anyone can view match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Authenticated users can insert match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Users can update their own match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Users can delete their own match schedules" ON match_schedules;

-- 경기 일정 조회 정책 (모든 사용자)
CREATE POLICY "Anyone can view match schedules v2" ON match_schedules
    FOR SELECT USING (true);

-- 경기 일정 생성 정책 (관리자만)
CREATE POLICY "Admin users can insert match schedules v2" ON match_schedules
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 경기 일정 수정 정책 (관리자만)
CREATE POLICY "Admin users can update match schedules v2" ON match_schedules
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 경기 일정 삭제 정책 (관리자만)
CREATE POLICY "Admin users can delete match schedules v2" ON match_schedules
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- =============================================================================
-- 3. 참가자 관리 테이블 (참가 신청 및 참석 상태)
-- =============================================================================

-- match_participants 테이블 (사용자의 경기 참가 신청)
CREATE TABLE IF NOT EXISTS match_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_schedule_id UUID NOT NULL REFERENCES match_schedules(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'cancelled', 'attended', 'absent')),
    notes TEXT,
    UNIQUE(match_schedule_id, user_id)
);

-- match_participants 인덱스
CREATE INDEX IF NOT EXISTS idx_match_participants_schedule ON match_participants(match_schedule_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_user ON match_participants(user_id);

-- match_participants RLS 정책
ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;

-- 기존 정책들 삭제 (있다면)
DROP POLICY IF EXISTS "Anyone can view match participants" ON match_participants;
DROP POLICY IF EXISTS "Users can register for matches" ON match_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON match_participants;
DROP POLICY IF EXISTS "Users can cancel their own participation" ON match_participants;

-- 참가자 목록 조회 정책 (모든 사용자)
CREATE POLICY "Anyone can view match participants v2" ON match_participants
    FOR SELECT USING (true);

-- 참가 신청 정책 (본인만)
CREATE POLICY "Users can register for matches v2" ON match_participants
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 참가 상태 수정 정책 (본인만)
CREATE POLICY "Users can update their own participation v2" ON match_participants
    FOR UPDATE USING (auth.uid() = user_id);

-- 참가 취소 정책 (본인만)
CREATE POLICY "Users can cancel their own participation v2" ON match_participants
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- 4. 출석 관리 테이블 (일일 출석 체크)
-- =============================================================================

-- attendances 테이블 (일일 출석 기록)
CREATE TABLE IF NOT EXISTS attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    attended_at DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent')),
    match_schedule_id UUID REFERENCES match_schedules(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, attended_at)
);

-- attendances 테이블에 필요한 컬럼들 추가 (없는 경우)
DO $$
BEGIN
    -- match_schedule_id 컬럼 추가
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'attendances'
        AND column_name = 'match_schedule_id'
    ) THEN
        ALTER TABLE attendances ADD COLUMN match_schedule_id UUID REFERENCES match_schedules(id) ON DELETE SET NULL;
    END IF;

    -- notes 컬럼 추가
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'attendances'
        AND column_name = 'notes'
    ) THEN
        ALTER TABLE attendances ADD COLUMN notes TEXT;
    END IF;

    -- created_at 컬럼 추가
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'attendances'
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE attendances ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;

    -- updated_at 컬럼 추가
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'attendances'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE attendances ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;

    -- foreign key 제약조건 수정 (필요한 경우)
    -- 기존 foreign key가 auth.users를 참조하는 경우 profiles로 변경
    BEGIN
        -- 기존 foreign key 제약조건 삭제 시도
        ALTER TABLE attendances DROP CONSTRAINT IF EXISTS attendances_user_id_fkey;
        -- 새로운 foreign key 제약조건 추가
        ALTER TABLE attendances ADD CONSTRAINT attendances_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
    EXCEPTION
        WHEN OTHERS THEN
            -- 제약조건 변경에 실패한 경우 무시
            NULL;
    END;
END $$;

-- attendances 인덱스
CREATE INDEX IF NOT EXISTS idx_attendances_user_date ON attendances(user_id, attended_at);
CREATE INDEX IF NOT EXISTS idx_attendances_date ON attendances(attended_at);
CREATE INDEX IF NOT EXISTS idx_attendances_schedule ON attendances(match_schedule_id);

-- attendances RLS 정책
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;

-- 기존 정책들 삭제 (있다면)
DROP POLICY IF EXISTS "Users can view their own attendance" ON attendances;
DROP POLICY IF EXISTS "Users can insert their own attendance" ON attendances;
DROP POLICY IF EXISTS "Users can update their own attendance" ON attendances;
DROP POLICY IF EXISTS "Admins can view all attendances" ON attendances;
DROP POLICY IF EXISTS "Admins can update all attendances" ON attendances;

-- 사용자는 자신의 출석 기록만 조회 가능
CREATE POLICY "Users can view their own attendance v2" ON attendances
    FOR SELECT USING (auth.uid() = user_id);

-- 사용자는 자신의 출석 기록을 생성 가능
CREATE POLICY "Users can insert their own attendance v2" ON attendances
    FOR INSERT WITH CHECK (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    ));

-- 사용자는 자신의 출석 기록을 수정 가능
CREATE POLICY "Users can update their own attendance v2" ON attendances
    FOR UPDATE USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    ));

-- 관리자는 모든 출석 기록을 조회 가능
CREATE POLICY "Admins can view all attendances v2" ON attendances
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 관리자는 모든 출석 기록을 수정 가능
CREATE POLICY "Admins can update all attendances v2" ON attendances
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- =============================================================================
-- 5. 알림 시스템 테이블
-- =============================================================================

-- notifications 테이블
CREATE TABLE IF NOT EXISTS notifications (
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

-- notifications 인덱스
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- notifications RLS 정책
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert notifications" ON notifications
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE user_id = auth.uid()
            AND role = 'admin'
        )
        OR auth.uid() = user_id
    );

-- =============================================================================
-- 6. 자동화 트리거 및 함수
-- =============================================================================

-- 참가자 수 자동 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_match_participants_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE match_schedules
        SET current_participants = (
            SELECT COUNT(*)
            FROM match_participants
            WHERE match_schedule_id = NEW.match_schedule_id
            AND status IN ('registered', 'attended')
        )
        WHERE id = NEW.match_schedule_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE match_schedules
        SET current_participants = (
            SELECT COUNT(*)
            FROM match_participants
            WHERE match_schedule_id = OLD.match_schedule_id
            AND status IN ('registered', 'attended')
        )
        WHERE id = OLD.match_schedule_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE match_schedules
        SET current_participants = (
            SELECT COUNT(*)
            FROM match_participants
            WHERE match_schedule_id = NEW.match_schedule_id
            AND status IN ('registered', 'attended')
        )
        WHERE id = NEW.match_schedule_id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 참가자 수 업데이트 트리거
CREATE TRIGGER trigger_update_match_participants_count
    AFTER INSERT OR UPDATE OR DELETE ON match_participants
    FOR EACH ROW EXECUTE FUNCTION update_match_participants_count();

-- =============================================================================
-- 7. 기존 시스템과의 호환성을 위한 뷰 및 추가 테이블
-- =============================================================================

-- 기존 generated_matches 관련 테이블들 (호환성 유지)
-- (필요시 추가)

-- =============================================================================
-- 8. 샘플 데이터 (개발/테스트용)
-- =============================================================================

-- 샘플 경기 일정 (필요시 주석 해제)
/*
INSERT INTO match_schedules (match_date, start_time, end_time, location, max_participants, description)
VALUES
    (CURRENT_DATE, '19:00', '21:00', '시민체육관 배드민턴장', 20, '오늘 정기 경기'),
    (CURRENT_DATE + INTERVAL '7 days', '19:00', '21:00', '시민체육관 배드민턴장', 24, '다음주 정기 경기')
ON CONFLICT DO NOTHING;
*/

-- =============================================================================
-- 9. 데이터베이스 설정 완료 확인
-- =============================================================================

-- 설정 완료 메시지
DO $$
BEGIN
    RAISE NOTICE '배드민턴 경기 관리 시스템 데이터베이스 스키마 설정이 완료되었습니다.';
    RAISE NOTICE '생성된 테이블들:';
    RAISE NOTICE '  - profiles: 사용자 프로필 정보';
    RAISE NOTICE '  - match_schedules: 경기 일정 정보';
    RAISE NOTICE '  - match_participants: 참가 신청 및 참석 상태';
    RAISE NOTICE '  - attendances: 일일 출석 기록';
    RAISE NOTICE '  - notifications: 알림 시스템';
END $$;
