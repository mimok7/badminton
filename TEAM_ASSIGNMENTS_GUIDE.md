# 팀 구성 저장 시스템 설정 가이드

## 1. 데이터베이스 테이블 생성

### Supabase에서 SQL 실행하기

1. **Supabase 대시보드 접속**
   - https://supabase.com 접속
   - 프로젝트 선택

2. **SQL Editor 열기**
   - 왼쪽 메뉴에서 `SQL Editor` 클릭
   - `New query` 버튼 클릭

3. **SQL 실행**
   - `sql/create_team_assignments.sql` 파일의 내용을 복사
   - SQL Editor에 붙여넣기
   - `Run` 버튼 클릭

4. **확인**
   ```sql
   SELECT * FROM team_assignments LIMIT 1;
   ```
   - 오류 없이 실행되면 성공

## 2. 팀 구성 방식

### 2.1 2팀 (기본)
- **라켓팀 vs 셔틀팀**
- 출석자를 2개 팀으로 균등 분배
- 가장 일반적인 방식

### 2.2 4팀
- **4개 팀으로 분할**
- 많은 인원일 때 유용
- 라켓팀 2개, 셔틀팀 2개로 구성

### 2.3 2명 팀
- **2명씩 한 팀**
- 페어별 경기에 적합
- 자동으로 2명씩 묶어서 팀 생성

### 2.4 사용자 정의
- **직접 드래그 앤 드롭**
- 수동으로 선수를 각 팀에 배치
- 가장 유연한 방식

## 3. 사용 방법

### 팀 구성 페이지 (/team-management)

1. **스케줄 선택**
   - 상단 드롭다운에서 경기 일정 선택
   - 또는 "(출석 기준)"으로 오늘 출석자 사용

2. **팀 구성 방식 선택**
   - 4가지 옵션 중 원하는 방식 클릭
   - 각 옵션의 설명 참고

3. **자동 배정**
   - "🎲 자동 배정" 버튼 클릭
   - 선택한 방식에 따라 자동으로 팀 생성

4. **수동 조정 (선택사항)**
   - 선수 이름을 클릭하여 팀 변경
   - 라켓팀 ↔ 셔틀팀 토글

5. **저장**
   - "💾 배정 저장" 버튼 클릭
   - DB에 저장 (실패 시 자동으로 로컬 스토리지에 저장)

### 경기 생성 페이지 (/admin/players-today)

1. **팀 구성 선택**
   - "팀 구성 기반 생성" 섹션에서 회차 선택
   - 저장된 팀 구성이 자동으로 표시됨

2. **경기 생성**
   - "이 팀 구성으로 경기 생성" 버튼 클릭
   - 선택한 팀의 라켓팀/셔틀팀으로 경기 자동 생성

## 4. 데이터 저장 방식

### DB 우선 저장
```typescript
// 1차 시도: DB에 저장
await supabase.from('team_assignments').insert([{
  assignment_date: '2025-10-18',
  round_number: 1,
  title: '경기일정 2025-10-18 1회차',
  team_type: '2teams',
  racket_team: ['선수1(C1)', '선수2(B2)'],
  shuttle_team: ['선수3(A3)', '선수4(C2)']
}]);

// 2차 시도: 실패 시 로컬 스토리지에 저장
localStorage.setItem('badminton_team_assignments', JSON.stringify(data));
```

### 조회 우선순위
1. **DB 조회** → JSONB 구조로 저장된 데이터
2. **로컬 스토리지** → 구 방식으로 저장된 데이터 (폴백)

## 5. 데이터 구조

### DB 테이블 (team_assignments)
```sql
CREATE TABLE team_assignments (
  id UUID PRIMARY KEY,
  assignment_date DATE NOT NULL,      -- 경기 날짜
  round_number INTEGER NOT NULL,      -- 회차 번호
  title TEXT NOT NULL,                -- 회차 제목
  team_type TEXT NOT NULL,            -- 팀 구성 방식
  racket_team JSONB NOT NULL,         -- 라켓팀 선수 배열
  shuttle_team JSONB NOT NULL,        -- 셔틀팀 선수 배열
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 로컬 스토리지 (badminton_team_assignments)
```json
[
  {
    "round_number": 1,
    "player_name": "선수1(C1)",
    "team_type": "racket",
    "round_title": "경기일정 2025-10-18 1회차",
    "assignment_date": "2025-10-18",
    "created_at": "2025-10-18T10:30:00.000Z"
  }
]
```

## 6. 트러블슈팅

### 팀 구성이 보이지 않을 때
1. **콘솔 확인**
   - F12 → Console 탭
   - "🔍 팀 구성 조회 시작" 로그 확인

2. **데이터 확인**
   - DB: `SELECT * FROM team_assignments WHERE assignment_date = '2025-10-18';`
   - 로컬: `localStorage.getItem('badminton_team_assignments')`

3. **날짜 확인**
   - assignment_date가 오늘 날짜와 일치하는지 확인
   - 시간대 차이로 날짜가 다를 수 있음

### DB 저장 실패 시
- 로컬 스토리지에 자동으로 저장됨
- 콘솔에서 "⚠️ DB 저장 실패" 메시지 확인
- RLS 정책 확인 필요

## 7. 주요 기능

### ✅ 완료된 기능
- ✅ 4가지 팀 구성 방식 (2팀/4팀/2명팀/사용자정의)
- ✅ DB 우선 저장, 로컬 스토리지 폴백
- ✅ 팀 구성 히스토리 관리
- ✅ 경기 생성과 연동
- ✅ 페이지 포커스 시 자동 갱신

### 🔄 향후 개선 사항
- 팀 구성 수정 기능
- 팀 구성 삭제 기능
- 팀 구성 복사 기능
- 드래그 앤 드롭 UI 개선

## 8. 파일 목록

```
sql/create_team_assignments.sql          # DB 테이블 생성 SQL
src/app/team-management/page.tsx         # 팀 구성 관리 페이지
src/app/admin/players-today/page.tsx     # 경기 생성 페이지
src/app/players/components/TeamBasedMatchGeneration.tsx  # 팀 기반 생성 UI
```

## 9. 참고사항

- **DB 테이블 생성은 최초 1회만** 실행하면 됩니다
- **로컬 스토리지는 브라우저별로 독립적**입니다
- **DB 데이터는 모든 기기에서 공유**됩니다
- **페이지 포커스 시 자동으로 최신 데이터** 조회합니다
