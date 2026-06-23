# Badminton Project Status

기준일: 2026-06-13

## 이번에 정리한 내용

- 사용자/관리자 라우트를 route group 기준으로 분리했다.
- 로그인은 한글 이름 기반 검색 후 서버에서 이메일을 찾아 비밀번호 로그인에 사용하도록 바꿨다.
- 미들웨어에서 관리자/일반 사용자 접근 제어와 비밀번호 변경 강제를 공통 처리하도록 정리했다.
- 브라우저 Supabase 클라이언트를 단일 인스턴스로 통일했다.
- `PerformanceMonitor` 기본 마운트를 제거하고 알림 초기화 로그를 개발용으로 제한했다.
- `supabase` CLI 를 로컬 devDependency 로 설치하고 스크립트 실행 흐름을 정리했다.
- `scripts/checkDatabase.js` 의 서비스 롤 키 하드코딩을 제거하고 `.env.local` 기반으로 변경했다.
- Supabase 타입 생성기에서 숫자 PK(`BIGSERIAL` 등)가 `Insert` 에서 필수로 잘못 생성되던 문제를 보정했다.
- `generated_matches`, `match_schedules`, `team_assignments`, `tournaments` 관련 화면들의 타입 불일치를 대거 정리했다.
- 관계 select 에 의존하던 여러 페이지를 실제 스키마 기준의 안전한 정규화 방식으로 정리했다.
- `src/lib/scheduled-matches.ts` 헬퍼를 추가해 사용자 경기 조회 로직을 공통화했다.

## 현재 확인된 상태

- `npx supabase --version` 확인 완료: `2.106.0`
- `npm run type-check` 통과 완료
- 기존 `.next/types` 경로 오류와 주요 Supabase relation 타입 오류를 정리했다.
- 로그인, 사용자 대시보드, 관리자 대시보드, 내 경기 일정, 대회 경기, 정기모임 관리, 경기 결과 API 쪽 타입 문제가 정리된 상태다.

## 현재 남아 있는 메모

- Supabase OpenAPI 기반 타입에는 relation metadata 가 약해서, 복잡한 relation select 는 앞으로도 분리 조회 방식이 더 안전하다.
- `generated_matches.id` 는 실제로 `number` 이므로 신규 코드 작성 시 문자열 가상 ID(`generated_123`)와 DB 실제 ID를 혼동하지 않도록 주의가 필요하다.
- 일부 화면은 동작상 유지 목적으로 `any` / 런타임 정규화를 사용하고 있으므로, 이후 리팩터링 단계에서 공통 DTO 또는 selector 헬퍼로 더 줄일 수 있다.
- DB 스키마를 더 손볼 수 있다면 view 또는 RPC 로 사용자 경기 조회를 묶는 편이 장기적으로 안정적이다.

## 다음 작업 권장 순서

1. `npm run lint` 또는 화면별 수동 점검으로 런타임 회귀 확인
2. 사용자/관리자 도메인 분리 전략에 맞춰 env, auth redirect, cookie 정책 정리
3. 사용자 경기/대시보드 조회용 DB view 또는 RPC 추가 검토
4. 현재 남아 있는 중복 조회 로직을 `src/lib` 공통 헬퍼로 추가 정리

## CLI 사용법

- Supabase CLI 버전 확인
  `npx supabase --version`

- 타입 재생성
  `npm run generate:supabase-types`

- 타입 검사
  `npm run type-check`

- DB 점검 스크립트 실행
  `.env.local` 에 `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 가 있어야 함
  `node scripts/checkDatabase.js`

## 메모

- 지금 단계에서는 별도 MCP 설치가 필수는 아니다.
- 현재 작업 범위에서는 로컬 `supabase` CLI 와 기존 Next/Supabase 구조만으로 충분히 진행 가능하다.
