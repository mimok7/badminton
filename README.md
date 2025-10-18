# 배드민턴 클럽 관리 시스템

라켓 뚱보단을 위한 종합 배드민턴 클럽 관리 시스템입니다.

## 주요 기능

### 🏸 경기 관리
- **경기 생성**: 랜덤, 레벨별, 남녀복식 경기 자동 생성
- **공정한 배정**: 모든 선수가 누락 없이 경기에 참여하도록 보장
- **실시간 게임수 추적**: 각 선수의 경기 참여 횟수 실시간 표시
- **팀 구성 기반 배정**: 라켓팀/셔틀팀 구성으로 경기 자동 배정

### 🏆 대회 관리 (신규)
- **팀 구성 기반 대회**: 오늘의 팀 구성을 선택하여 대회 생성
- **출석 자동 필터링**: 출석한 선수만 자동으로 경기 배정
- **균등 분배 알고리즘**: 1인당 경기수를 설정하여 공정하게 배정
- **경기 타입**: 레벨별/랜덤/혼복 선택 가능
- **점수 입력**: 실시간 점수 입력 및 승패 자동 판정
- **선수별 통계**: 경기수, 승/패/무, 승률 자동 계산

### 📅 경기일 관리
- **일정 관리**: 경기 날짜, 시간, 장소 등록 및 관리
- **참가자 관리**: 경기별 최대 인원 설정 및 참가 신청 관리
- **상태 추적**: 예정/진행중/완료/취소 상태별 관리
- **참가 신청**: 회원이 직접 경기 참가 신청/취소 가능

### 👥 회원 관리
- **출석 관리**: 일별 출석 체크 및 상태 관리 (출석/레슨/불참)
- **레벨 관리**: 선수별 기술 레벨 관리 (랍스터~닭갈비)
- **프로필 관리**: 회원 정보 및 기술 수준 관리

### 📊 대시보드
- **실시간 현황**: 오늘의 출석 현황 실시간 표시
- **통계 정보**: 레벨별, 상태별 회원 분포 현황
- **색상 코딩**: 직관적인 핑크 색상 시스템으로 상태 표시

## 기술 스택

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Authentication, RLS, Realtime)
- **State Management**: React Context API with optimized caching
- **Performance**: Optimized bundle splitting, lazy loading, memoization
- **Deployment**: Vercel

## 성능 최적화

### 🚀 로딩 성능 개선사항
- **Supabase 클라이언트 최적화**: 싱글톤 패턴으로 중복 생성 방지
- **React 메모이제이션**: useCallback, useMemo를 활용한 불필요한 리렌더링 방지
- **데이터 캐싱**: 프로필 및 일정 데이터 5분간 캐싱
- **컴포넌트 최적화**: 로딩 상태 개선 및 레이지 로딩 적용
- **번들 최적화**: Next.js 15의 최신 최적화 기능 활용

### 📊 성능 모니터링
- 개발 환경에서 페이지 로드 시간 자동 측정
- 3초 이상 로딩 시 자동 경고
- Web Vitals 지표 추적

### ⚡ 추가 최적화 기능
- **압축**: Gzip 압축 활성화
- **이미지 최적화**: WebP/AVIF 포맷 지원
- **정적 파일 최적화**: 캐싱 및 CDN 활용

## 데이터베이스 구조

### 핵심 테이블
- `profiles`: 사용자 프로필 정보
- `attendances`: 출석 관리
- `match_schedules`: 경기 일정 관리
- `match_participants`: 경기 참가자 관리
- `level_info`: 레벨 정보 관리
- `team_assignments`: 팀 구성 관리 (라켓팀/셔틀팀)
- `tournaments`: 대회 정보 관리 (신규)
- `tournament_matches`: 대회 경기 정보 (신규)

## 설치 및 실행

### 1. 프로젝트 클론
```bash
git clone [repository-url]
cd badminton-club-management
```

### 2. 의존성 설치
```bash
npm install
# 또는
yarn install
```

### 3. 환경 변수 설정
`.env.local` 파일을 생성하고 다음 변수들을 설정:
```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. 데이터베이스 설정
`sql/create_match_schedules.sql` 파일을 Supabase에서 실행하여 필요한 테이블들을 생성합니다.

### 5. 개발 서버 실행
```bash
npm run dev
# 또는
yarn dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인합니다.

## 페이지 구조

- `/` - 홈페이지
- `/dashboard` - 대시보드 (출석 현황)
- `/players` - 경기 생성 페이지
- `/match-registration` - 경기 참가 신청
- `/match-schedule` - 경기일 관리 (관리자)
- `/admin` - 관리자 페이지
- `/admin/players-today` - 오늘 경기 생성/배정 (팀 구성 기반)
- `/tournament-bracket` - 대회 대진표 (신규)
- `/my-tournament-matches` - 내 대회 경기 (신규)

## 주요 알고리즘

### 공정한 경기 배정
모든 경기 생성 방식에서 참여자가 누락되지 않도록 하는 알고리즘:

1. **기본 경기 생성**: 4명씩 그룹으로 기본 경기 생성
2. **남은 선수 처리**: 
   - 1명 남음: 기존 참여자 3명과 추가 경기
   - 2명 남음: 기존 참여자 2명과 추가 경기  
   - 3명 남음: 기존 참여자 1명과 추가 경기
3. **참여 추적**: 모든 선수의 경기 참여 횟수 실시간 추적

### 레벨 시스템
- **랍스터**: 최고 레벨
- **소갈비 (A)**: 상급
- **돼지갈비 (B)**: 중상급
- **양갈비 (C)**: 중급
- **닭갈비 (D)**: 초중급
- **E**: 초급
- **N**: 미지정

## 보안 및 권한

- **RLS (Row Level Security)**: Supabase RLS를 통한 데이터 보안
- **인증**: Supabase Auth를 통한 사용자 인증
- **권한 관리**: 관리자/일반 사용자 구분

## 배포

이 프로젝트는 [Vercel Platform](https://vercel.com)에 배포됩니다.

1. GitHub에 코드 푸시
2. Vercel에서 프로젝트 연결
3. 환경 변수 설정
4. 자동 배포

## 개발 가이드

### 새로운 기능 추가 시
1. 타입 정의 (`src/types.ts`)
2. 컴포넌트 작성
3. 데이터베이스 스키마 수정 (필요시)
4. RLS 정책 업데이트 (필요시)

### 코드 스타일
- TypeScript 엄격 모드 사용
- Tailwind CSS로 스타일링
- 컴포넌트 단위 개발
- console.log를 활용한 디버깅

## 문의 및 지원

배드민턴 클럽 관련 문의는 관리자에게 연락하세요.

## 관련 문서

- [대회 시스템 가이드](./TOURNAMENT_SYSTEM_GUIDE.md) - 대회 시스템 상세 가이드
- [일반 경기 시스템 가이드](./RECURRING_MATCH_GUIDE.md) - 일반 경기 시스템
- [경기 시스템 설정](./SETUP_MATCH_SYSTEM.md) - 경기 시스템 설정 방법
- [데이터베이스 스키마](./database_schema.sql) - 전체 DB 스키마
