# 경기 일정 관리 시스템 설정

## 📋 개요
관리자가 경기 일정을 생성하고, 일반 사용자가 참가 신청할 수 있는 시스템이 구현되었습니다.

## 🗃️ 데이터베이스 설정

다음 SQL 스크립트를 Supabase SQL Editor에서 실행해주세요:

```sql
-- 경기 일정 관리를 위한 테이블 생성
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

-- 경기 참가자 관리를 위한 테이블 생성
CREATE TABLE IF NOT EXISTS match_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_schedule_id UUID NOT NULL REFERENCES match_schedules(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'cancelled', 'attended', 'absent')),
    notes TEXT,
    UNIQUE(match_schedule_id, user_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_match_schedules_date ON match_schedules(match_date);
CREATE INDEX IF NOT EXISTS idx_match_schedules_status ON match_schedules(status);
CREATE INDEX IF NOT EXISTS idx_match_participants_schedule ON match_participants(match_schedule_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_user ON match_participants(user_id);

-- RLS (Row Level Security) 정책 활성화
ALTER TABLE match_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;

-- 기존 정책들 삭제 (있다면)
DROP POLICY IF EXISTS "Anyone can view match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Admin users can insert match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Admin users can update match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Admin users can delete match schedules" ON match_schedules;
DROP POLICY IF EXISTS "Anyone can view match participants" ON match_participants;
DROP POLICY IF EXISTS "Users can register for matches" ON match_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON match_participants;
DROP POLICY IF EXISTS "Users can cancel their own participation" ON match_participants;

-- 경기 일정 조회 정책 (모든 사용자)
CREATE POLICY "Anyone can view match schedules" ON match_schedules
    FOR SELECT USING (true);

-- 경기 일정 생성 정책 (관리자만)
CREATE POLICY "Admin users can insert match schedules" ON match_schedules
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 경기 일정 수정 정책 (관리자만)
CREATE POLICY "Admin users can update match schedules" ON match_schedules
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 경기 일정 삭제 정책 (관리자만)
CREATE POLICY "Admin users can delete match schedules" ON match_schedules
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 참가자 목록 조회 정책 (모든 사용자)
CREATE POLICY "Anyone can view match participants" ON match_participants
    FOR SELECT USING (true);

-- 참가 신청 정책 (본인만)
CREATE POLICY "Users can register for matches" ON match_participants
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 참가 상태 수정 정책 (본인만)
CREATE POLICY "Users can update their own participation" ON match_participants
    FOR UPDATE USING (auth.uid() = user_id);

-- 참가 취소 정책 (본인만)
CREATE POLICY "Users can cancel their own participation" ON match_participants
    FOR DELETE USING (auth.uid() = user_id);

-- 기존 트리거 삭제 (있다면)
DROP TRIGGER IF EXISTS trigger_update_match_participants_count ON match_participants;

-- 경기 일정의 현재 참가자 수를 자동으로 업데이트하는 트리거 함수
CREATE OR REPLACE FUNCTION update_match_participants_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE match_schedules 
        SET current_participants = (
            SELECT COUNT(*) 
            FROM match_participants 
            WHERE match_schedule_id = NEW.match_schedule_id 
            AND status = 'registered'
        )
        WHERE id = NEW.match_schedule_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE match_schedules 
        SET current_participants = (
            SELECT COUNT(*) 
            FROM match_participants 
            WHERE match_schedule_id = OLD.match_schedule_id 
            AND status = 'registered'
        )
        WHERE id = OLD.match_schedule_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE match_schedules 
        SET current_participants = (
            SELECT COUNT(*) 
            FROM match_participants 
            WHERE match_schedule_id = NEW.match_schedule_id 
            AND status = 'registered'
        )
        WHERE id = NEW.match_schedule_id;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER trigger_update_match_participants_count
    AFTER INSERT OR UPDATE OR DELETE ON match_participants
    FOR EACH ROW EXECUTE FUNCTION update_match_participants_count();
```

## 🎯 주요 기능

### 1. **관리자 전용 - 경기 일정 관리** (`/match-schedule`)
- ✅ 새 경기 일정 생성
- ✅ 기존 경기 상태 변경 (예정/진행중/완료/취소)
- ✅ 참가자 현황 실시간 확인
- ✅ 경기 일정 삭제

### 2. **일반 사용자 - 경기 참가 신청** (`/match-registration`)
- ✅ 예정된 경기 목록 조회
- ✅ 경기 참가 신청/취소
- ✅ 나의 참가 경기 현황 확인
- ✅ 참가자 수 실시간 확인

### 3. **개인 경기 일정 관리** (`/my-schedule`)
- ✅ 나의 예정 경기 목록
- ✅ 지난 경기 참가 이력
- ✅ 개인 통계 (총 참가 경기, 참석 완료, 취소 횟수 등)
- ✅ 경기별 상세 정보

## 🔐 권한 관리

### 관리자 권한
- 경기 일정 생성/수정/삭제
- 모든 경기의 참가자 현황 확인
- 경기 상태 변경

### 일반 사용자 권한  
- 경기 일정 조회
- 자신의 참가 신청/취소
- 자신의 경기 이력 확인

## 📊 자동화 기능

1. **참가자 수 자동 업데이트**: 사용자가 참가 신청/취소할 때마다 경기별 참가자 수가 자동으로 업데이트됩니다.

2. **실시간 상태 반영**: 경기 상태와 참가 현황이 실시간으로 반영됩니다.

3. **데이터 무결성**: 외래키 제약조건과 RLS 정책으로 데이터 보안을 보장합니다.

## 🚀 사용 방법

1. **관리자**: `/match-schedule`에서 경기 일정을 생성합니다.
2. **사용자**: `/match-registration`에서 원하는 경기에 참가 신청합니다.
3. **개인 확인**: `/my-schedule`에서 자신의 경기 일정을 확인합니다.

## 🔄 기존 시스템과의 차이점

### Before (기존 시스템)
- 모든 사용자가 경기를 생성할 수 있음
- 출석 기반의 즉석 경기 생성
- 개인별 경기 이력 관리 부족

### After (새 시스템)
- ✅ 관리자만 경기 일정 생성 가능
- ✅ 사용자는 사전 등록된 경기에 참가 신청
- ✅ 개인별 경기 참가 이력 체계적 관리
- ✅ 실시간 참가자 현황 확인
- ✅ 체계적인 권한 관리

이제 관리자가 체계적으로 경기를 관리하고, 사용자들은 편리하게 경기에 참가할 수 있습니다! 🎉
