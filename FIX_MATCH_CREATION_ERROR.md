# 경기 생성 오류 수정 가이드

## 문제 상황
- **403 Forbidden 오류**: `match_schedules` 테이블에 경기를 생성할 때 발생
- **Multiple GoTrueClient instances 경고**: Supabase 클라이언트가 여러 번 초기화됨
- **404 오류**: `admin/backup` 경로 (이 오류는 백업 페이지가 없어서 발생하므로 무시 가능)

## 해결 방법

### 1단계: Supabase RLS 정책 수정 (필수)

Supabase Dashboard에서 다음 SQL을 실행하세요:

1. Supabase 프로젝트 대시보드 접속
2. 왼쪽 메뉴에서 **SQL Editor** 클릭
3. 새 쿼리 생성
4. 아래 파일의 내용을 복사하여 실행:

```
sql/fix_match_schedules_rls.sql
```

이 SQL은 다음을 수행합니다:
- 기존의 잘못된 RLS 정책 삭제
- 인증된 사용자가 경기를 생성할 수 있도록 새 정책 추가
- 관리자가 모든 경기와 참가자를 관리할 수 있도록 권한 부여

### 2단계: 코드 수정 확인 (이미 완료됨)

다음 파일들이 수정되었습니다:

1. **src/lib/supabase.ts**: 싱글톤 패턴 적용
2. **src/app/match-schedule/page.tsx**: Supabase 클라이언트 싱글톤 사용
3. **src/app/admin/players-today/page.tsx**: Supabase 클라이언트 싱글톤 사용
4. **src/app/players/utils.ts**: Supabase 클라이언트 싱글톤 사용
5. **src/app/team-management/page.tsx**: Supabase 클라이언트 싱글톤 사용

### 3단계: 애플리케이션 재시작

```powershell
# 개발 서버 재시작
npm run dev
```

## 테스트 방법

1. 관리자 계정으로 로그인
2. 경기 일정 페이지(`/match-schedule`)로 이동
3. "새 경기 일정 만들기" 클릭
4. 경기 정보 입력 후 저장
5. 403 오류 없이 정상적으로 경기가 생성되는지 확인

## 추가 확인 사항

### GoTrueClient 경고가 계속 나타나는 경우

브라우저 콘솔에서 다음을 확인:
- 여러 컴포넌트에서 `createClientComponentClient()`를 직접 호출하고 있는지 확인
- 모든 곳에서 `getSupabaseClient()`를 사용하도록 변경

### 여전히 403 오류가 발생하는 경우

1. Supabase Dashboard에서 RLS 정책이 제대로 적용되었는지 확인:
   - Table Editor → match_schedules → Policies 탭 확인
   - "Authenticated users can insert match schedules" 정책이 있어야 함

2. 사용자가 제대로 인증되었는지 확인:
   ```typescript
   const { data: { user } } = await supabase.auth.getUser();
   console.log('Current user:', user);
   ```

3. profiles 테이블에 사용자의 role이 제대로 설정되어 있는지 확인:
   ```sql
   SELECT id, role FROM profiles WHERE id = 'your-user-id';
   ```

## 문제가 계속되는 경우

다음 정보를 확인해주세요:
1. Supabase 프로젝트 URL과 Anon Key가 `.env.local`에 올바르게 설정되어 있는지
2. 브라우저 콘솔의 전체 에러 메시지
3. Supabase Dashboard의 Logs에서 발생한 에러 상세 내용
