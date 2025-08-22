import { Player, Team, Match } from '@/types';

/**
 * 레벨별 점수 매핑 (A1이 최고, E2가 최하위)
 * 더 세밀한 점수 차이로 공정한 매칭 구현
 */
const LEVEL_SCORES: Record<string, number> = {
  'A1': 20, 'A2': 18,
  'B1': 16, 'B2': 14,
  'C1': 12, 'C2': 10,
  'D1': 8,  'D2': 6,
  'E1': 4,  'E2': 2,
  // 호환성을 위한 기존 레벨
  'A': 18,  'B': 14,  'C': 10,  'D': 6,   'E': 2,   'N': 2
};

/**
 * 선수의 레벨 점수를 반환
 * @param player - 선수 객체
 * @returns 레벨 점수 (2-20, 높을수록 실력 좋음)
 */
function getPlayerLevelScore(player: Player): number {
  const level = player.skill_level?.toUpperCase() || 'E2';
  return LEVEL_SCORES[level] || 2;
}

/**
 * 팀의 총 레벨 점수를 계산
 * @param team - 팀 객체
 * @returns 팀의 총 레벨 점수
 */
function getTeamScore(team: Team): number {
  return getPlayerLevelScore(team.player1) + getPlayerLevelScore(team.player2);
}

/**
 * 팀의 평균 레벨 점수를 계산 (더 정확한 비교를 위해)
 * @param team - 팀 객체
 * @returns 팀의 평균 레벨 점수
 */
function getTeamAverageScore(team: Team): number {
  return getTeamScore(team) / 2;
}

/**
 * 팀의 레벨 밸런스를 계산 (팀 내 실력차)
 * @param team - 팀 객체
 * @returns 팀 내 실력차 (낮을수록 균형잡힘)
 */
function getTeamBalance(team: Team): number {
  return Math.abs(getPlayerLevelScore(team.player1) - getPlayerLevelScore(team.player2));
}

/**
 * 두 팀 간의 레벨 차이를 계산 (개선된 매칭 알고리즘)
 * @param team1 - 팀 1
 * @param team2 - 팀 2
 * @returns 팀 간 매칭 점수 (낮을수록 좋은 매치)
 */
function getTeamMatchScore(team1: Team, team2: Team): number {
  // 1. 팀 간 총점 차이 (가중치 70%)
  const scoreDifference = Math.abs(getTeamScore(team1) - getTeamScore(team2));
  
  // 2. 팀 내부 밸런스 차이 (가중치 20%)
  const balanceDifference = Math.abs(getTeamBalance(team1) - getTeamBalance(team2));
  
  // 3. 평균 레벨 차이 (가중치 10%)
  const averageDifference = Math.abs(getTeamAverageScore(team1) - getTeamAverageScore(team2));
  
  return (scoreDifference * 0.7) + (balanceDifference * 0.2) + (averageDifference * 0.1);
}

/**
 * 팀 조합의 공정성 점수 계산
 * @param team - 팀 객체
 * @returns 공정성 점수 (높을수록 좋은 팀 구성)
 */
function getTeamFairnessScore(team: Team): number {
  const totalScore = getTeamScore(team);
  const balance = getTeamBalance(team);
  
  // 높은 총점과 낮은 실력차를 선호
  return totalScore - (balance * 2);
}

/**
 * 레벨을 고려한 균형잡힌 혼합복식 경기 생성
 * @param players - 참가 선수 목록 (gender, skill_level 정보 포함)
 * @param numberOfCourts - 코트 수
 * @returns 생성된 경기 목록 (레벨 균형 고려)
 */
export function createBalancedMixedDoublesMatches(
  players: Player[],
  numberOfCourts: number
): Match[] {
  console.log('🎯 최적화된 레벨 균형 고려 혼복 경기 생성 시작');
  
  // 기본 유효성 검사
  if (players.length < 4 || numberOfCourts === 0) {
    console.warn('경기 생성 불가: 참가자 부족 또는 코트 없음');
    return [];
  }

  // 성별로 분리
  const femalePlayers = players.filter((p) => {
    const gender = (p.gender || '').toLowerCase();
    return gender === 'f' || gender === 'female' || gender === 'woman' || gender === 'w';
  });
  
  const malePlayers = players.filter((p) => {
    const gender = (p.gender || '').toLowerCase();
    return gender === 'm' || gender === 'male' || gender === 'man';
  });

  if (femalePlayers.length < 2 || malePlayers.length < 2) {
    console.warn('혼복 생성 불가: 남녀 선수 부족');
    return [];
  }

  // 레벨별로 정렬 (높은 레벨부터)
  const sortedMales = malePlayers.sort((a, b) => getPlayerLevelScore(b) - getPlayerLevelScore(a));
  const sortedFemales = femalePlayers.sort((a, b) => getPlayerLevelScore(b) - getPlayerLevelScore(a));

  console.log('남성 선수 레벨 분포:', sortedMales.map(p => `${p.name}(${p.skill_level}:${getPlayerLevelScore(p)})`));
  console.log('여성 선수 레벨 분포:', sortedFemales.map(p => `${p.name}(${p.skill_level}:${getPlayerLevelScore(p)})`));

  const matches: Match[] = [];
  const usedPlayers = new Set<string>();
  
  // 가능한 모든 혼복 팀 조합 생성 및 평가
  const possibleTeams: { team: Team, score: number, fairness: number }[] = [];
  
  for (let m = 0; m < sortedMales.length; m++) {
    for (let f = 0; f < sortedFemales.length; f++) {
      const team: Team = {
        player1: sortedMales[m],
        player2: sortedFemales[f]
      };
      const score = getTeamScore(team);
      const fairness = getTeamFairnessScore(team);
      possibleTeams.push({ team, score, fairness });
    }
  }

  // 팀을 공정성과 총점으로 정렬 (공정하고 강한 팀 우선)
  possibleTeams.sort((a, b) => {
    // 1차: 공정성 점수로 정렬
    const fairnessDiff = b.fairness - a.fairness;
    if (Math.abs(fairnessDiff) > 1) return fairnessDiff;
    // 2차: 총점으로 정렬
    return b.score - a.score;
  });

  console.log('가능한 팀 조합:', possibleTeams.length, '개');

  let courtNumber = 1;
  
  // 최적의 매칭 찾기
  for (let i = 0; i < possibleTeams.length && courtNumber <= numberOfCourts; i++) {
    const team1Data = possibleTeams[i];

    // 이미 사용된 선수가 포함된 팀은 스킵
    if (usedPlayers.has(team1Data.team.player1.id) || usedPlayers.has(team1Data.team.player2.id)) {
      continue;
    }

    let bestMatch: { team: Team, score: number, matchScore: number } | null = null;
    let bestMatchIndex = -1;

    for (let j = i + 1; j < possibleTeams.length; j++) {
      const team2Data = possibleTeams[j];

      // 이미 사용된 선수가 포함된 팀은 스킵
      if (
        usedPlayers.has(team2Data.team.player1.id) ||
        usedPlayers.has(team2Data.team.player2.id) ||
        // team1과 team2에 겹치는 선수가 있으면 스킵
        team1Data.team.player1.id === team2Data.team.player1.id ||
        team1Data.team.player1.id === team2Data.team.player2.id ||
        team1Data.team.player2.id === team2Data.team.player1.id ||
        team1Data.team.player2.id === team2Data.team.player2.id
      ) {
        continue;
      }

      const matchScore = getTeamMatchScore(team1Data.team, team2Data.team);
      
      // 매칭 점수 제한 (너무 큰 실력차는 제외)
      if (matchScore > 8) continue; // 조정 가능한 임계값
      
      if (!bestMatch || matchScore < bestMatch.matchScore) {
        bestMatch = {
          team: team2Data.team,
          score: team2Data.score,
          matchScore: matchScore
        };
        bestMatchIndex = j;
        // 완벽한 매치면 바로 종료
        if (matchScore <= 2) break;
      }
    }

    if (bestMatch) {
      const match: Match = {
        id: `match-balanced-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        team1: team1Data.team,
        team2: bestMatch.team,
        court: courtNumber++
      };
      
      matches.push(match);
      
      // 사용된 선수들 마킹
      usedPlayers.add(team1Data.team.player1.id);
      usedPlayers.add(team1Data.team.player2.id);
      usedPlayers.add(bestMatch.team.player1.id);
      usedPlayers.add(bestMatch.team.player2.id);
      
      console.log(`⚖️ 경기 ${matches.length}: Team1(${team1Data.score}점) vs Team2(${bestMatch.score}점) - 매칭점수: ${bestMatch.matchScore.toFixed(1)}`);
      console.log(`   Team1: ${team1Data.team.player1.name}(${team1Data.team.player1.skill_level}) + ${team1Data.team.player2.name}(${team1Data.team.player2.skill_level})`);
      console.log(`   Team2: ${bestMatch.team.player1.name}(${bestMatch.team.player1.skill_level}) + ${bestMatch.team.player2.name}(${bestMatch.team.player2.skill_level})`);
      
      // 사용된 팀 조합 제거
      possibleTeams.splice(bestMatchIndex, 1);
    }
  }
  
  // 남은 선수들로 추가 경기 생성 (레벨 고려 없는 일반 방식)
  const remainingPlayers = players.filter(p => !usedPlayers.has(p.id));
  if (remainingPlayers.length >= 4 && courtNumber <= numberOfCourts) {
    console.log(`👥 남은 선수 ${remainingPlayers.length}명으로 추가 경기 생성`);
    const additionalMatches = createMixedDoublesMatches(remainingPlayers, numberOfCourts - courtNumber + 1);
    matches.push(...additionalMatches);
  }
  
  console.log(`✅ 최적화된 레벨 균형 혼복 경기 생성 완료: ${matches.length}개 경기`);
  return matches;
}

/**
 * 레벨을 고려한 균형잡힌 일반 복식 경기 생성
 * @param players - 참가 선수 목록
 * @param numberOfCourts - 코트 수
 * @returns 생성된 경기 목록 (레벨 균형 고려)
 */
export function createBalancedDoublesMatches(
  players: Player[],
  numberOfCourts: number
): Match[] {
  console.log('🎯 레벨 균형 고려 일반복식 경기 생성 시작');
  
  if (players.length < 4 || numberOfCourts === 0) {
    console.warn('경기 생성 불가: 참가자 부족 또는 코트 없음');
    return [];
  }

  // 레벨별로 정렬 (높은 레벨부터)
  const sortedPlayers = players.sort((a, b) => getPlayerLevelScore(b) - getPlayerLevelScore(a));
  
  console.log('선수 레벨 분포:', sortedPlayers.map(p => `${p.name}(${p.skill_level}:${getPlayerLevelScore(p)})`));

  const matches: Match[] = [];
  const usedPlayers = new Set<string>();
  
  // 가능한 모든 팀 조합 생성
  const possibleTeams: { team: Team, score: number }[] = [];
  
  for (let i = 0; i < sortedPlayers.length; i++) {
    for (let j = i + 1; j < sortedPlayers.length; j++) {
      const team: Team = {
        player1: sortedPlayers[i],
        player2: sortedPlayers[j]
      };
      const score = getTeamScore(team);
      possibleTeams.push({ team, score });
    }
  }

  // 팀 점수별로 정렬
  possibleTeams.sort((a, b) => b.score - a.score);

  let courtNumber = 1;
  
  // 최적의 매칭 찾기
  for (let i = 0; i < possibleTeams.length && courtNumber <= numberOfCourts; i++) {
    const team1Data = possibleTeams[i];
    
    // 이미 사용된 선수가 포함된 팀은 스킵
    if (usedPlayers.has(team1Data.team.player1.id) || usedPlayers.has(team1Data.team.player2.id)) {
      continue;
    }
    
    let bestMatch: { team: Team, score: number, difference: number } | null = null;
    let bestMatchIndex = -1;
    
    // team1과 가장 균형잡힌 team2 찾기
    for (let j = i + 1; j < possibleTeams.length; j++) {
      const team2Data = possibleTeams[j];
      
      // 이미 사용된 선수가 포함된 팀은 스킵
      if (usedPlayers.has(team2Data.team.player1.id) || usedPlayers.has(team2Data.team.player2.id)) {
        continue;
      }
      
      const scoreDifference = Math.abs(team1Data.score - team2Data.score);
      
      if (!bestMatch || scoreDifference < bestMatch.difference) {
        bestMatch = {
          team: team2Data.team,
          score: team2Data.score,
          difference: scoreDifference
        };
        bestMatchIndex = j;
      }
      
      // 레벨 차이가 2점 이하면 좋은 매치로 간주
      if (scoreDifference <= 2) break;
    }
    
    // 최적의 매치를 찾았으면 경기 생성
    if (bestMatch) {
      const match: Match = {
        id: `match-balanced-doubles-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        team1: team1Data.team,
        team2: bestMatch.team,
        court: courtNumber++
      };
      
      matches.push(match);
      
      // 사용된 선수들 마킹
      usedPlayers.add(team1Data.team.player1.id);
      usedPlayers.add(team1Data.team.player2.id);
      usedPlayers.add(bestMatch.team.player1.id);
      usedPlayers.add(bestMatch.team.player2.id);
      
      console.log(`⚖️ 복식 경기 ${matches.length}: Team1(${team1Data.score}점) vs Team2(${bestMatch.score}점) - 차이: ${bestMatch.difference}점`);
      console.log(`   Team1: ${team1Data.team.player1.name}(${team1Data.team.player1.skill_level}) + ${team1Data.team.player2.name}(${team1Data.team.player2.skill_level})`);
      console.log(`   Team2: ${bestMatch.team.player1.name}(${bestMatch.team.player1.skill_level}) + ${bestMatch.team.player2.name}(${bestMatch.team.player2.skill_level})`);
      
      // 사용된 팀 조합 제거
      possibleTeams.splice(bestMatchIndex, 1);
    }
  }
  
  console.log(`✅ 레벨 균형 일반복식 경기 생성 완료: ${matches.length}개 경기`);
  return matches;
}

/**
 * 남녀 혼합 복식 경기를 생성하는 함수 (공정한 배정)
 * @param players - 참가 선수 목록 (gender: 'M' | 'F' 정보 포함)
 * @param numberOfCourts - 코트 수 (필수 파라미터로 변경)
 * @returns 생성된 경기 목록 (Match[])
 */
export function createMixedDoublesMatches(
  players: Player[],
  numberOfCourts: number
): Match[] {
  if (players.length < 4 || numberOfCourts === 0) {
    console.warn(
      '혼복 생성 불가: 참가자 부족 또는 코트 없음',
      players.length,
      numberOfCourts
    );
    return [];
  }

  // 성별 분리
  const femalePlayers = players.filter((p) => {
    const gender = (p.gender || '').toLowerCase();
    return gender === 'f' || gender === 'female' || gender === 'woman' || gender === 'w';
  });
  const malePlayers = players.filter((p) => {
    const gender = (p.gender || '').toLowerCase();
    return gender === 'm' || gender === 'male' || gender === 'man';
  });

  if (femalePlayers.length < 2 || malePlayers.length < 2) {
    console.warn('혼복 생성 불가: 남녀 선수 부족', 
      {여성: femalePlayers.map(p => p.name), 남성: malePlayers.map(p => p.name)});
    return [];
  }

  // 실력순 정렬
  const sortedMales = [...malePlayers].sort((a, b) => getPlayerLevelScore(b) - getPlayerLevelScore(a));
  const sortedFemales = [...femalePlayers].sort((a, b) => getPlayerLevelScore(b) - getPlayerLevelScore(a));

  const matches: Match[] = [];
  let courtNumber = 1;
  const usedPlayerIds = new Set<string>();

  // 가능한 모든 남2+여2 조합을 만들어 팀 밸런스가 최소가 되는 조합을 찾음
  const malePairs: [Player, Player][] = [];
  for (let i = 0; i < sortedMales.length; i++) {
    for (let j = i + 1; j < sortedMales.length; j++) {
      malePairs.push([sortedMales[i], sortedMales[j]]);
    }
  }
  const femalePairs: [Player, Player][] = [];
  for (let i = 0; i < sortedFemales.length; i++) {
    for (let j = i + 1; j < sortedFemales.length; j++) {
      femalePairs.push([sortedFemales[i], sortedFemales[j]]);
    }
  }

  // 최적의 매치 조합 찾기
  const candidateMatches: {
    team1: Team, team2: Team, diff: number, allIds: Set<string>
  }[] = [];

  for (const mPair of malePairs) {
    for (const fPair of femalePairs) {
      const allPlayers = [...mPair, ...fPair];
      // 4명 중복 없음 체크
      const ids = allPlayers.map(p => p.id);
      if (new Set(ids).size !== 4) continue;

      // 두 팀 조합 (1,2 vs 3,4)
      const team1: Team = { player1: allPlayers[0], player2: allPlayers[1] };
      const team2: Team = { player1: allPlayers[2], player2: allPlayers[3] };
      const diff = Math.abs(getTeamScore(team1) - getTeamScore(team2));
      candidateMatches.push({ team1, team2, diff, allIds: new Set(ids) });

      // 반대 조합도 추가 (2,3 vs 1,4)
      // (원하는 경우 추가, 여기선 한 조합만 사용)
    }
  }

  // 실력 차이 오름차순으로 정렬
  candidateMatches.sort((a, b) => a.diff - b.diff);

  // 중복 없는 최적 매치 선정
  while (candidateMatches.length > 0 && courtNumber <= numberOfCourts) {
    const foundIdx = candidateMatches.findIndex(
      m => ![...m.allIds].some(id => usedPlayerIds.has(id))
    );
    if (foundIdx === -1) break;
    const match = candidateMatches[foundIdx];
    matches.push({
      id: `match-mixed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      team1: match.team1,
      team2: match.team2,
      court: courtNumber++
    });
    match.allIds.forEach(id => usedPlayerIds.add(id));
    candidateMatches.splice(foundIdx, 1);
  }

  // 남은 선수들로 일반 복식 경기 생성 (중복 없이)
  const remainingPlayers = players.filter(p => !usedPlayerIds.has(p.id));
  if (remainingPlayers.length >= 4 && courtNumber <= numberOfCourts) {
    const additionalMatches = createBalancedDoublesMatches(remainingPlayers, numberOfCourts - courtNumber + 1);
    matches.push(...additionalMatches);
  }

  return matches;
}

/**
 * 배열을 무작위로 섞는 함수 (셔플 알고리즘)
 * @param array - 섞을 배열
 * @returns 섞인 배열의 복사본
 */
function shuffle<T>(array: T[]): T[] {
  const newArray = [...array]; // 원본 배열을 복사하여 수정
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); // 0부터 i 사이의 무작위 index j
    // newArray[i]와 newArray[j] 위치를 swap (ES6 destructuring assignment)
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray; // 섞인 배열의 복사본을 반환 (원본 배열 불변성 유지)
}

/**
 * 최적화된 통합 경기 생성 시스템
 * 레벨 균형을 고려한 최고 품질의 경기 생성
 * @param players - 참가 선수 목록
 * @param numberOfCourts - 코트 수
 * @param preferMixedDoubles - 혼복 우선 여부 (default: true)
 * @returns 생성된 경기 목록
 */
export function createOptimizedMatches(
  players: Player[],
  numberOfCourts: number,
  preferMixedDoubles: boolean = true
): Match[] {
  console.log('🎯 최적화된 통합 경기 생성 시작');
  console.log(`📊 참가자: ${players.length}명, 코트: ${numberOfCourts}개, 혼복우선: ${preferMixedDoubles}`);
  
  // 기본 유효성 검사
  if (players.length < 4 || numberOfCourts === 0) {
    console.warn('경기 생성 불가: 참가자 부족 또는 코트 없음');
    return [];
  }

  // 성별 분포 확인
  const maleCount = players.filter(p => {
    const gender = (p.gender || '').toLowerCase();
    return gender === 'm' || gender === 'male' || gender === 'man';
  }).length;
  const femaleCount = players.length - maleCount;
  
  console.log(`👥 성별 분포: 남성 ${maleCount}명, 여성 ${femaleCount}명`);
  
  let matches: Match[] = [];
  
  // 혼복 우선이고 남녀가 충분한 경우
  if (preferMixedDoubles && maleCount >= 2 && femaleCount >= 2) {
    console.log('🎯 최적화된 혼복 생성 모드');
    matches = createBalancedMixedDoublesMatches(players, numberOfCourts);
  } 
  // 일반 복식으로 진행
  else {
    console.log('🎯 최적화된 일반복식 생성 모드');
    matches = createBalancedDoublesMatches(players, numberOfCourts);
  }
  
  // 결과 요약 출력
  console.log(`✅ 최적화된 경기 생성 완료: ${matches.length}개 경기`);
  
  // 경기별 레벨 분석
  matches.forEach((match, index) => {
    const team1Score = getTeamScore(match.team1);
    const team2Score = getTeamScore(match.team2);
    const matchScore = getTeamMatchScore(match.team1, match.team2);
    console.log(`🏸 경기 ${index + 1}: ${team1Score}점 vs ${team2Score}점 (매칭점수: ${matchScore.toFixed(1)})`);
  });
  
  return matches;
}

/**
 * 기존 호환성을 위한 래퍼 함수들
 */
export { createBalancedMixedDoublesMatches as createMixedMatches };
export { createBalancedDoublesMatches as createDoublesMatches };
