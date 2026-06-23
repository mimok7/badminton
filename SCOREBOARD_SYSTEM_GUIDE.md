# 대회 심판 점수판 시스템 가이드

이 문서는 배드민턴 대회 경기 중 심판이 실시간으로 점수를 기록하고, 사용자들이 진행 상황을 열람할 수 있는 **점수판 시스템**의 구현 내용과 체크리스트를 정리한 가이드입니다.

## 1. 개요 및 주요 기능

대회 심판 점수판 시스템은 스마트폰을 비롯한 모바일 기기에 최적화된 전체 화면 점수판을 제공하며, 다음과 같은 주요 기능을 수행합니다.

- **심판 배정**: 관리자 모드의 대진표에서 해당 대회의 참가 선수 중 심판을 지정
- **실시간 점수 입력**: 지정된 심판(또는 관리자)만 점수판 페이지에서 각 팀의 점수를 올리거나 내릴 수 있음 (+1, -1 기능)
- **점수 실시간 동기화**: Supabase Realtime을 통해 관전 중인 사용자들의 점수판 및 대진표 화면에 진행 중인 점수가 즉시 반영
- **경기 완료 처리**: 점수 입력을 마치고 최종 확정 시 경기를 완료 상태로 변경하고 승자(Winner)를 결정
- **권한 기반 접근 제어**: 심판이나 관리자가 아닌 사용자는 점수판 접근 시 자동으로 "읽기 전용 관전 모드"로 동작

---

## 2. 데이터베이스 스키마 (마이그레이션)

`tournament_matches` 테이블에 심판 정보가 추가되었습니다. `add_referee_to_tournament_matches.sql`에 의해 생성됩니다.

```sql
-- referee_id 컬럼 추가 (profiles 테이블 참조)
ALTER TABLE tournament_matches
  ADD COLUMN IF NOT EXISTS referee_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- referee_name 컬럼 추가 (빠른 조회용 비정규화)
ALTER TABLE tournament_matches
  ADD COLUMN IF NOT EXISTS referee_name TEXT;

-- 빠른 조회를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_tournament_matches_referee ON tournament_matches(referee_id);

-- ★ 중요: Supabase Realtime 활성화 필요
-- Dashboard -> Database -> Replication 에서 tournament_matches 테이블을 활성화해야 합니다.
```

---

## 3. 핵심 컴포넌트

### 3.1. 점수판 페이지 (`src/app/(user)/scoreboard/[matchId]/page.tsx`)
- `100vh`, `100vw` 크기의 모바일 최적화 전체화면 UI (매니퓰레이션 방지)
- 좌/우 영역 클릭으로 점수 증가 로직 구현 (Debounce 패턴 적용으로 잦은 API 호출 최적화)
- Supabase `channel('postgres_changes')`를 이용한 관전 모드의 실시간 점수 업데이트 구독

### 3.2. 점수판 API (`src/app/api/scoreboard/[matchId]/route.ts`)
- `GET`: 경기 상세 정보 및 현재 로그인한 사용자의 권한(심판/관리자 여부) 확인
- `PATCH`: 진행 중인 점수 업데이트 (`in_progress` 상태로 변경)
- `POST`: 경기 완료 처리, 최종 점수에 따른 `winner`(`team1`, `team2`, `draw`) 기록 및 `completed` 상태 변경
- **타입 에러 방지 패턴**: Supabase 생성 타입이 DB 스키마와 동기화되지 않았을 때를 대비해, 조회된 데이터를 제네릭 객체(`MatchRow = Record<string, unknown>`)로 캐스팅한 후 `referee_id`, `referee_name`을 추출하여 사용

### 3.3. 대진표 UI 확장 (`src/components/tournament/TournamentBracketView.tsx`)
- **관리자 기능**: 경기별 심판을 선택하는 드롭다운 메뉴 추가 및 `/api/admin/tournaments`의 PATCH 엔드포인트 호출
- **사용자 기능**: 진행 중인 경기에 "🔴 LIVE 보기" 및 점수 표시
- 대진표 내에서도 Supabase Realtime을 구독하여, 대진표 목록 화면에서 진행 중인 경기의 점수 변화를 즉시 시각화

---

## 4. 완수된 구현 체크리스트

다음은 본 시스템 구현 시 수행된 작업 목록이며, 추후 시스템 확장 또는 유지 보수 시 참고합니다.

- [x] **DB 마이그레이션**: `tournament_matches` 테이블에 심판 필드 추가 및 Realtime 셋업
- [x] **점수판 API 개발**: 점수 갱신, 경기 종료, 권한 체크 핸들러 개발 완료
- [x] **전체화면 점수판 UI 개발**: 실시간 동기화, 권한 제어, 모바일 친화적 조작 구현 완료
- [x] **관리자 심판 배정 기능**: `TournamentBracketView.tsx` 내 심판 배정 기능 및 API 연동
- [x] **대진표 실시간 상태 표시**: 대진표에 현재 진행 점수 및 상태 뱃지 라이브 연동
- [x] **타입 안정성 보완**: `referee_id`, `referee_name` 필드의 미생성 타입 관련 오류를 우회하여 프로덕션 빌드 성공

## 5. 알려진 문제 및 향후 개선점
- **Supabase 타입 생성**: 향후 DB 테이블 변경 시 `npm run generate:supabase-types` 를 실행하여 `referee_id`, `referee_name`이 공식 타입에 포함될 경우 API 내의 캐스팅 코드를 제거하고 엄격한 타입 지정을 도입할 수 있습니다.
- **점수 수정 (Undo)**: 경기 종료 후 결과 정정은 관리자 화면(결과 관리)에서 수동으로 지원하도록 설계되었으나, 필요에 따라 점수판 내 수정 모드 도입을 검토할 수 있습니다.
