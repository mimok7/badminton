# Profile/Auth Sync Runbook

## 사용자가 꼭 해야 하는 일

Supabase Dashboard -> SQL Editor 에서 아래 파일 내용을 그대로 실행:

- [sql/fix_auth_user_creation_trigger.sql](/c:/SHT-DATA/badminton/sql/fix_auth_user_creation_trigger.sql:1)

이 작업은 `auth.users` 생성 시 `public.profiles` placeholder 와 안전하게 연결되도록 트리거를 고치는 단계입니다.

## 그 다음 내가 바로 처리할 일

사용자가 위 SQL 실행을 끝내면, 아래 순서로 바로 실행하면 됩니다.

1. `npm run profiles:sync-auth:apply`
2. `npm run profiles:audit`

## 기대 결과

- `조동균`과 `조인규`가 서로 다른 auth 계정으로 분리됨
- `profiles.user_id IS NULL` placeholder 프로필들이 auth 계정과 연결됨
- `npm run profiles:audit` 결과에서:
  - `미연결 auth 사용자` 0건
  - `중복 연결된 user_id` 0건
  - `충돌로 수동 확인이 필요한 후보` 0건 또는 별도 확인 대상만 남음

## 현재 막힌 이유

- 현재는 Supabase Admin API 의 `createUser` 가 `500 Database error creating new user` 로 실패함
- 앱 코드 문제가 아니라 Supabase 쪽 `auth.users -> profiles` 동기화 과정에서 막히는 상태로 보임
- 그래서 SQL Editor 에서 트리거 수정이 먼저 필요함
