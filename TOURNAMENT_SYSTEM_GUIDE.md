# 대회 시스템 가이드

## 개요
배드민턴 대회 관리 시스템으로, 팀 구성 기반 대회 생성, 경기 자동 배정, 점수 입력 및 통계 관리 기능을 제공합니다.

## 주요 기능

### 1. 팀 구성 기반 대회 생성
- 오늘 생성된 팀 구성(라켓팀/셔틀팀)을 선택하여 대회 생성
- 출석한 선수만 자동으로 필터링하여 경기 배정
- 1인당 경기수 설정 가능 (1~10경기)
- 경기 타입 선택: 레벨별 / 랜덤 / 혼복

### 2. 경기 자동 생성 알고리즘
- **균등 분배 알고리즘**: 모든 선수가 설정된 경기수만큼 고르게 경기하도록 배정
- **우선순위 기반 매칭**: 경기 수가 적은 선수들을 우선 배정
- **레벨 밸런싱**: 팀 간 레벨 차이를 최소화하여 공정한 경기 구성

### 3. 점수 입력 및 관리
- 각 경기별 점수 입력 가능
- 자동 승패 판정 (무승부 포함)
- 실시간 경기 상태 업데이트 (대기중/진행중/완료)

### 4. 선수별 통계
- 경기수, 승/패/무 기록
- 승률 자동 계산
- 대회별 성적 관리

## 데이터베이스 스키마

### tournaments 테이블
```sql
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,                    -- 대회명
  tournament_date DATE NOT NULL,          -- 대회 날짜
  round_number INTEGER NOT NULL,          -- 회차
  match_type TEXT NOT NULL DEFAULT 'random', -- 경기 타입 (level_based/random/mixed_doubles)
  team_assignment_id UUID,                -- 팀 구성 ID (외래키)
  team_type TEXT NOT NULL,                -- 팀 타입 (2teams/3teams/4teams/pairs)
  total_teams INTEGER NOT NULL,           -- 총 경기 수
  matches_per_player INTEGER NOT NULL,    -- 1인당 경기수
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tournaments_date ON tournaments(tournament_date);
CREATE INDEX idx_tournaments_round ON tournaments(round_number);
```

### tournament_matches 테이블
```sql
CREATE TABLE tournament_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,                 -- 라운드 번호
  match_number INTEGER NOT NULL,          -- 경기 번호
  team1 TEXT[] NOT NULL,                  -- 팀 1 선수 배열
  team2 TEXT[] NOT NULL,                  -- 팀 2 선수 배열
  court TEXT NOT NULL,                    -- 코트 번호
  scheduled_time TIMESTAMP,               -- 예정 시간
  status TEXT NOT NULL DEFAULT 'pending', -- 상태 (pending/in_progress/completed)
  score_team1 INTEGER,                    -- 팀 1 점수
  score_team2 INTEGER,                    -- 팀 2 점수
  winner TEXT,                            -- 승자 (team1/team2/draw)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tournament_matches_tournament ON tournament_matches(tournament_id);
CREATE INDEX idx_tournament_matches_status ON tournament_matches(status);
```

### team_assignments 테이블 (기존)
```sql
CREATE TABLE team_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_number INTEGER NOT NULL,
  assignment_date DATE NOT NULL,
  title TEXT,
  team_type TEXT NOT NULL,
  racket_team TEXT[],                     -- 라켓팀 선수 배열
  shuttle_team TEXT[],                    -- 셔틀팀 선수 배열
  pairs_data JSONB,                       -- 페어 데이터
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 파일 구조

```
src/
├── app/
│   ├── admin/
│   │   ├── players-today/
│   │   │   └── page.tsx              # 오늘 경기 생성/배정 (팀 구성 기반)
│   │   └── tournament-matches/
│   │       └── page.tsx              # 대회 관리 (레거시)
│   ├── tournament-bracket/
│   │   └── page.tsx                  # 대회 대진표 열람 및 점수 입력
│   └── my-tournament-matches/
│       └── page.tsx                  # 선수별 대회 경기 조회
├── utils/
│   └── match-utils.ts                # 경기 생성 알고리즘
└── sql/
    ├── create_tournament_tables.sql  # 대회 테이블 생성
    └── add_match_type_column.sql     # match_type 컬럼 추가
```

## 주요 페이지

### 1. `/admin/players-today` - 오늘 경기 생성/배정
**기능:**
- 출석 체크 및 관리
- 오늘의 팀 구성 조회
- 팀 구성 기반 경기 자동 생성
- 레벨별/랜덤/혼복/수동 경기 생성
- 생성된 경기 배정 및 관리

**사용 흐름:**
1. 출석 데이터 확인
2. 팀 구성 선택 (선택사항)
3. 1인당 경기수 설정
4. 경기 타입 선택
5. 경기 생성 버튼 클릭
6. 생성된 경기 확인 및 배정

**팀 구성 선택 시 동작:**
- 선택한 팀 구성의 라켓팀/셔틀팀 선수 중 **출석한 선수만** 필터링
- 출석하지 않은 선수는 자동으로 제외
- 콘솔에 상세한 매칭 로그 출력

### 2. `/tournament-bracket` - 대회 대진표
**기능:**
- 팀 구성 기반 대회 생성
- 생성된 대회 목록 조회
- 경기 일정 표시
- 점수 입력/수정
- 선수별 통계 (선택적)

**사용 흐름:**
1. 오늘의 팀 구성 선택
2. 대회 설정 (1인당 경기수, 경기 타입)
3. 대회 생성
4. 생성된 대회 클릭하여 경기 목록 확인
5. 각 경기에 점수 입력

### 3. `/my-tournament-matches` - 내 대회 경기
**기능:**
- 로그인한 선수의 대회 경기만 조회
- 경기 일정 확인
- 점수 및 결과 확인

## 핵심 알고리즘

### 1. 팀 구성 기반 경기 생성

```typescript
// players-today/page.tsx의 handleTeamBasedTournamentGeneration 함수

const handleTeamBasedGeneration = async () => {
  // 1. 선택한 팀 구성 찾기
  const selectedTeam = availableTeams.find(t => t.round === selectedTeamRound);
  
  // 2. 출석한 선수 목록 조회
  const presentPlayers = todayPlayers.filter(p => p.status === 'present');
  
  // 3. 출석한 선수를 Map으로 변환 (이름 → 선수 정보)
  const presentPlayersMap = new Map();
  presentPlayers.forEach(p => {
    presentPlayersMap.set(p.name.trim().toLowerCase(), p);
  });
  
  // 4. 팀 구성에서 선수 이름 파싱 및 매칭
  const parsePlayerName = (nameWithLevel: string) => {
    const match = nameWithLevel.match(/^(.+?)\(([A-Z0-9]+)\)$/);
    if (match) {
      return { name: match[1].trim(), level: match[2].toLowerCase() };
    }
    return { name: nameWithLevel.trim(), level: 'e2' };
  };
  
  // 5. 라켓팀에서 출석한 선수만 필터링
  const racketPlayers = [];
  selectedTeam.racket.forEach((nameWithLevel) => {
    const parsed = parsePlayerName(nameWithLevel);
    const presentPlayer = presentPlayersMap.get(parsed.name.toLowerCase());
    
    if (presentPlayer) {
      racketPlayers.push({
        id: presentPlayer.id,
        name: presentPlayer.name,
        skill_level: normalizeLevel(presentPlayer.skill_level),
        // ... 기타 정보
      });
    }
  });
  
  // 6. 셔틀팀도 동일하게 처리
  const shuttlePlayers = [...]; // 동일한 로직
  
  // 7. 모든 선수 합치기
  const allPlayers = [...racketPlayers, ...shuttlePlayers];
  
  // 8. 경기 생성 (match-utils 사용)
  const { createBalancedDoublesMatches } = await import('@/utils/match-utils');
  const generated = createBalancedDoublesMatches(
    allPlayers, 
    maxCourts, 
    perPlayerMinGames
  );
};
```

### 2. 균등 분배 경기 생성

```typescript
// utils/match-utils.ts의 createBalancedDoublesMatches 함수

export function createBalancedDoublesMatches(
  players: Player[], 
  maxCourts: number, 
  minGamesPerPlayer: number
): Match[] {
  const matches: Match[] = [];
  const playerGameCount: Record<string, number> = {};
  
  // 1. 선수별 경기 수 초기화
  players.forEach(p => playerGameCount[p.id] = 0);
  
  // 2. 목표 경기 수 계산
  const targetMatches = Math.ceil((players.length * minGamesPerPlayer) / 4);
  
  // 3. 경기 생성 반복
  let attempts = 0;
  while (attempts < 4 && matches.length < targetMatches) {
    // 가능한 모든 조합 생성
    const possibleMatches = generateAllPossibleMatches(players);
    
    // 우선순위 계산 (경기 수가 적은 선수 우선)
    possibleMatches.forEach(match => {
      const count = [
        match.team1.player1, 
        match.team1.player2,
        match.team2.player1, 
        match.team2.player2
      ].reduce((sum, p) => sum + (playerGameCount[p.id] || 0), 0);
      match.priority = count;
    });
    
    // 우선순위 낮은 순으로 정렬
    possibleMatches.sort((a, b) => a.priority - b.priority);
    
    // 상위 경기 선택
    const selected = possibleMatches[0];
    matches.push(selected);
    
    // 선수별 경기 수 업데이트
    [selected.team1.player1, selected.team1.player2,
     selected.team2.player1, selected.team2.player2].forEach(p => {
      playerGameCount[p.id]++;
    });
    
    attempts++;
  }
  
  return matches;
}
```

### 3. 선수 이름 매칭 로직

```typescript
// 정확한 이름 매칭을 위한 파싱 및 비교

// 1. 레벨 정보 포함된 이름 파싱
const parsePlayerName = (nameWithLevel: string) => {
  // 형식: "김철수(A1)" → { name: "김철수", level: "a1" }
  const match = nameWithLevel.match(/^(.+?)\(([A-Z0-9]+)\)$/);
  if (match) {
    return { 
      name: match[1].trim(), 
      level: match[2].toLowerCase() 
    };
  }
  return { 
    name: nameWithLevel.trim(), 
    level: 'e2' 
  };
};

// 2. 대소문자 구분 없는 이름 비교
const normalizedName = parsed.name.trim().toLowerCase();

// 3. 출석 데이터와 매칭
const presentPlayer = presentPlayersMap.get(normalizedName);

// 4. 출석 데이터의 실제 정보 사용
if (presentPlayer) {
  return {
    id: presentPlayer.id,          // 실제 ID
    name: presentPlayer.name,      // 실제 이름 (대소문자 유지)
    skill_level: presentPlayer.skill_level,
    // ... 기타 실제 정보
  };
}
```

## 사용 시나리오

### 시나리오 1: 일반 대회 생성

1. **팀 구성 생성** (`/team-management`)
   - 오늘 날짜로 팀 구성 생성
   - 라켓팀/셔틀팀 선수 배정

2. **출석 체크** (`/admin/players-today`)
   - 참가 선수 출석 확인
   - 자동 또는 수동 출석 체크

3. **경기 생성** (`/admin/players-today`)
   - 팀 구성 선택
   - 1인당 경기수 설정 (예: 3경기)
   - 경기 타입 선택 (예: 레벨별)
   - "경기 생성" 버튼 클릭

4. **결과:**
   - 출석한 선수만으로 경기 자동 생성
   - 각 선수가 3경기씩 고르게 배정됨
   - 레벨을 고려한 밸런스 있는 매칭

### 시나리오 2: 대회 점수 입력

1. **대회 생성** (`/tournament-bracket`)
   - 팀 구성 선택
   - 대회 설정 (1인당 경기수, 타입)
   - 대회 생성

2. **경기 진행 및 점수 입력**
   - 생성된 대회 클릭
   - 각 경기별 "점수 입력" 버튼 클릭
   - 팀 1 점수, 팀 2 점수 입력
   - 저장

3. **결과 확인**
   - 자동 승패 판정
   - 선수별 통계 업데이트
   - 승률 자동 계산

## 문제 해결

### 1. 선수 이름이 매칭되지 않는 경우

**증상:**
- 팀 구성에 선수가 있지만 경기에 배정되지 않음
- 콘솔에 "⚠️ 불참" 로그 출력

**원인:**
- 출석 데이터의 이름과 팀 구성의 이름이 불일치
- 공백, 대소문자, 특수문자 차이

**해결:**
1. 브라우저 콘솔 확인:
   ```
   📋 출석한 선수 목록: [김철수, 이영희, ...]
   📋 라켓팀 구성: [김철수(A1), 이영희(B1), ...]
   ⚠️ 라켓팀 불참: 조영재(A1)
   ```

2. 이름 일치 여부 확인
3. 필요시 출석 데이터 또는 팀 구성 데이터 수정

### 2. 경기 수가 고르게 배정되지 않는 경우

**증상:**
- 일부 선수는 많은 경기, 일부는 적은 경기

**원인:**
- 선수 수가 적거나 경기 수 설정이 높음
- 알고리즘의 시도 횟수 부족

**해결:**
1. 1인당 경기수를 줄임
2. 선수 수를 늘림 (최소 8명 권장)
3. 콘솔 로그에서 분포 확인:
   ```
   📊 경기 수 분포: { '2': 4명, '3': 12명, '4': 2명 }
   ```

### 3. DB 오류 발생

**증상:**
- "tournaments 테이블을 찾을 수 없습니다" 오류
- "match_type 컬럼이 없습니다" 오류

**해결:**
```sql
-- 1. 테이블 생성
\i sql/create_tournament_tables.sql

-- 2. match_type 컬럼 추가 (기존 테이블인 경우)
\i sql/add_match_type_column.sql
```

## 개발 참고사항

### 상태 관리
- `todayPlayers`: 출석한 선수 목록
- `availableTeams`: 오늘의 팀 구성 목록
- `selectedTeamRound`: 선택한 팀 회차
- `matches`: 생성된 경기 목록
- `playerGameCounts`: 선수별 경기 수

### 실시간 업데이트
- Supabase Realtime 사용
- 출석 데이터 변경 시 자동 갱신
- 경기 일정 변경 시 자동 갱신

### 로그 활용
```typescript
console.log('📋 출석한 선수 목록:', ...);
console.log('✅ 라켓팀 매칭:', ...);
console.log('⚠️ 라켓팀 불참:', ...);
console.log('📊 선택한 팀 구성으로 경기 생성:', ...);
```

## 향후 개선 사항

1. **대회 타입 확장**
   - 토너먼트 형식 지원
   - 리그전 형식 지원
   - 플레이오프 시스템

2. **통계 기능 강화**
   - 기간별 성적 분석
   - 선수별 상대 전적
   - 레벨별 승률 통계

3. **알림 기능**
   - 경기 시작 알림
   - 점수 입력 완료 알림
   - 대회 생성 알림

4. **모바일 최적화**
   - 반응형 UI 개선
   - 터치 인터페이스 최적화
   - 오프라인 모드 지원

## 참고 문서

- [RECURRING_MATCH_GUIDE.md](./RECURRING_MATCH_GUIDE.md) - 일반 경기 시스템
- [SETUP_MATCH_SYSTEM.md](./SETUP_MATCH_SYSTEM.md) - 경기 시스템 설정
- [database_schema.sql](./database_schema.sql) - 전체 DB 스키마

## 작성일
2025년 10월 18일

## 버전
1.0.0

## 작성자
배드민턴 매칭 시스템 개발팀
