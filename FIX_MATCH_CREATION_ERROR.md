# 경기 생성 오류 수정 가이드

## 문제 상황
- **401 Unauthorized 오류**: 세션이 만료되었거나 로그인하지 않은 상태에서 경기 생성 시도
- **403 Forbidden 오류**: `match_schedules` 테이블에 경기를 생성할 때 RLS 정책 문제
- **Multiple GoTrueClient instances 경고**: Supabase 클라이언트가 여러 번 초기화됨
- **LoginPage setState 경고**: 렌더링 중 router.push() 호출
- **404 오류**: `admin/backup` 경로 (백업 페이지가 없어서 발생, 무시 가능)

## 해결 방법

### 1단계: Supabase RLS 정책 수정 (필수)

⚠️ **중요**: 이 단계를 먼저 실행해야 경기 생성이 가능합니다!

1. Supabase 프로젝트 대시보드 접속: https://supabase.com/dashboard
2. 왼쪽 메뉴에서 **SQL Editor** 클릭
3. "New query" 클릭
4. 아래 파일의 내용을 복사하여 실행:

```
c:\Users\saint\badminton\sql\fix_match_schedules_rls.sql
```

이 SQL은 다음을 수행합니다:
- ✅ 기존의 잘못된 RLS 정책 삭제
- ✅ 인증된 사용자가 경기를 생성할 수 있도록 새 정책 추가
- ✅ 관리자가 모든 경기와 참가자를 관리할 수 있도록 권한 부여

### 2단계: 코드 수정 확인 (자동 완료됨)

다음 파일들이 자동으로 수정되었습니다:

1. **src/lib/supabase.ts**
   - ✅ 싱글톤 패턴으로 완전히 재작성
   - ✅ 자동 세션 갱신 활성화 (`autoRefreshToken: true`)
   - ✅ 고유 저장소 키로 충돌 방지 (`storageKey: 'badminton-auth-token'`)
   - ✅ Multiple GoTrueClient 경고 완전 해결

2. **src/app/login/page.tsx**
   - ✅ 렌더링 중 `router.push()` 호출을 `useEffect`로 이동
   - ✅ setState 경고 해결

3. **src/hooks/useUser.ts**
   - ✅ 싱글톤 Supabase 클라이언트 사용

4. **src/app/match-schedule/page.tsx**
   - ✅ 경기 생성 전 세션 확인 로직 추가
   - ✅ 401 에러 시 자동으로 로그인 페이지로 이동
   - ✅ 상세한 에러 메시지 제공

5. **src/app/admin/players-today/page.tsx**
   - ✅ 싱글톤 Supabase 클라이언트 사용

6. **src/app/players/utils.ts**
   - ✅ 싱글톤 Supabase 클라이언트 사용

7. **src/app/team-management/page.tsx**
   - ✅ 싱글톤 Supabase 클라이언트 사용

### 3단계: 애플리케이션 확인

개발 서버가 http://localhost:3000 에서 실행 중입니다.

## 테스트 방법

### 1. 로그인 확인
1. http://localhost:3000/login 접속
2. 이메일/비밀번호로 로그인
3. 브라우저 콘솔에서 경고 메시지가 없는지 확인

### 2. 경기 생성 테스트
1. 관리자 계정으로 로그인
2. `/match-schedule` 페이지로 이동
3. "새 경기 일정 만들기" 클릭
4. 경기 정보 입력:
   - 날짜: 미래 날짜 선택
   - 시작 시간: 예: 19:00
   - 종료 시간: 예: 21:00
   - 장소: 예: 시민체육관
   - 최대 참가자: 20
5. 저장 버튼 클릭
6. ✅ **403 또는 401 오류 없이 정상적으로 경기가 생성되는지 확인**

### 3. 브라우저 콘솔 확인
브라우저 개발자 도구(F12)를 열고 다음을 확인:
- ✅ "Multiple GoTrueClient instances" 경고가 사라짐
- ✅ "Cannot update a component" 경고가 사라짐
- ✅ 401/403 에러가 발생하지 않음

## 해결된 문제

1. ✅ **401 Unauthorized**: 
   - 세션 확인 로직 추가
   - 자동 세션 갱신 활성화
   - 세션 만료 시 자동으로 로그인 페이지로 이동

2. ✅ **403 Forbidden**: 
   - RLS 정책 수정 (SQL 파일 실행 필요)
   - 인증된 사용자가 경기를 생성할 수 있음

3. ✅ **Multiple GoTrueClient 경고**: 
   - 싱글톤 패턴으로 클라이언트 인스턴스 하나만 생성
   - 고유 저장소 키로 충돌 방지

4. ✅ **LoginPage setState 경고**: 
   - 렌더링 중 router.push() 호출을 useEffect로 이동

5. ⚠️ **404 on admin/backup**: 
   - 백업 페이지가 없음 (필요하면 나중에 추가)

## 추가 확인 사항

### 세션이 자동으로 만료되는 경우

Supabase 기본 세션 만료 시간은 1시간입니다. 다음 설정으로 자동 갱신이 활성화되어 있습니다:
- `autoRefreshToken: true`: 자동으로 토큰 갱신
- `persistSession: true`: 세션을 브라우저에 저장

### RLS 정책이 제대로 적용되었는지 확인

Supabase Dashboard에서:
1. **Table Editor** → `match_schedules` → **Policies** 탭
2. 다음 정책들이 있어야 함:
   - ✅ "Authenticated users can insert match schedules"
   - ✅ "Admins and creators can update match schedules"
   - ✅ "Admins and creators can delete match schedules"

### 사용자 role 확인

관리자 권한이 필요한 경우, `profiles` 테이블에서 role을 확인:

```sql
SELECT id, username, full_name, role 
FROM profiles 
WHERE id = 'your-user-id';
```

role이 'admin'이어야 관리자 기능을 사용할 수 있습니다.

## 문제가 계속되는 경우

### 1. 캐시 삭제
브라우저 캐시와 로컬 스토리지를 삭제:
1. F12 → Application → Local Storage → 모두 삭제
2. F12 → Application → Session Storage → 모두 삭제
3. 페이지 새로고침 (Ctrl+Shift+R)

### 2. 환경 변수 확인
`.env.local` 파일에서:
```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. 로그 확인
- 브라우저 콘솔의 전체 에러 메시지
- Supabase Dashboard → Logs → Auth/API 로그
- 터미널의 서버 로그

### 4. 재로그인
세션 문제가 계속되면:
1. 로그아웃
2. 브라우저 캐시 삭제
3. 다시 로그인

---

## 요약

✅ **필수 실행**: `sql/fix_match_schedules_rls.sql`을 Supabase SQL Editor에서 실행
✅ **자동 완료**: 코드 수정 사항은 이미 적용됨
✅ **테스트**: 로그인 → 경기 생성 테스트
✅ **확인**: 브라우저 콘솔에서 경고/에러 없음 확인

개발 서버: http://localhost:3000
