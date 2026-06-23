import { Player, Match, Team } from '@/types';
import { getTeamScore, getTeamFairnessScore, getTeamMatchScore, jitter, getMinimumMatchCount, countUniquePlayersInMatches, reorderMatchesToAvoidConsecutive, MAX_TEAM_SCORE_DIFF } from './match-helpers';

export function createBalancedDoublesMatches(players: Player[], numberOfCourts: number, minGamesPerPlayer = 1): Match[] {
  if (!Array.isArray(players) || players.length < 4 || numberOfCourts <= 0) return [];

  const normalized = players.map(p => ({ ...p, skill_level: (p.skill_level || 'E2').toUpperCase() }));

  // 레벨(점수) 높은 순서로 정렬 - 고수부터 배정
  const getPlayerScore = (p: Player) => getTeamScore({ player1: p, player2: p });
  const sortedBySkill = [...normalized].sort((a, b) => getPlayerScore(b) - getPlayerScore(a));
  
  console.log('📊 레벨별 경기 생성 시작:');
  console.log(`  - 총 선수: ${normalized.length}명`);
  console.log(`  - 목표 최소 경기: ${minGamesPerPlayer}회/인`);
  console.log(`  - 레벨 순서: ${sortedBySkill.slice(0, 5).map(p => `${p.name}(${p.skill_level})`).join(', ')}...`);

  const buildPossibleTeams = (pool: Player[]): { team: Team; score: number; fairness: number }[] => {
    const teams: { team: Team; score: number; fairness: number }[] = [];
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const team: Team = { player1: pool[i], player2: pool[j] };
        teams.push({ team, score: getTeamScore(team), fairness: getTeamFairnessScore(team) });
      }
    }
    // prefer teams composed of players who have been used less
    teams.sort((a, b) => {
      const f = (b.fairness + jitter(0.25)) - (a.fairness + jitter(0.25));
      if (Math.abs(f) > 0.5) return f;
      const s = (b.score + jitter(0.25)) - (a.score + jitter(0.25));
      if (Math.abs(s) > 0.5) return s;
      return Math.random() < 0.5 ? -1 : 1;
    });
    return teams;
  };

  const createRound = (pool: Player[], maxCourts: number): { matches: Match[]; used: Set<string> } => {
    const used = new Set<string>();
    const matches: Match[] = [];
    
    // 레벨(점수) 높은 순서로 정렬된 풀 사용
    const sortedPool = [...pool].sort((a, b) => getPlayerScore(b) - getPlayerScore(a));
    const possible = buildPossibleTeams(sortedPool);
    let court = 1;

    for (let i = 0; i < possible.length && court <= maxCourts; i++) {
      const t1 = possible[i];
      const p1 = t1.team.player1.id; const p2 = t1.team.player2.id;
      if (used.has(p1) || used.has(p2)) continue;

      const candidates: { team: Team; score: number; diff: number; index: number }[] = [];
      for (let j = i + 1; j < possible.length; j++) {
        const t2 = possible[j];
        const q1 = t2.team.player1.id; const q2 = t2.team.player2.id;
        if (used.has(q1) || used.has(q2)) continue;
        if (p1 === q1 || p1 === q2 || p2 === q1 || p2 === q2) continue;
        const diff = Math.abs(t1.score - t2.score);
        // enforce tight balance: team scores must be tied or differ by at most 1
        if (diff > 1) continue;
        candidates.push({ team: t2.team, score: t2.score, diff, index: j });
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.diff - b.diff);
        const K = Math.min(3, candidates.length);
        const picked = candidates[Math.floor(Math.random() * K)];
        matches.push({ id: `match-balanced-d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, team1: t1.team, team2: picked.team, court });
        used.add(p1); used.add(p2); used.add(picked.team.player1.id); used.add(picked.team.player2.id);
        court += 1;
      }
    }
    return { matches, used };
  };

  const result: Match[] = [];
  const counts: Record<string, number> = {};
  normalized.forEach(p => { counts[p.id] = 0; });

  // helper to pick the best pairing among 4 players such that team score diff <= 1 if possible
  const bestBalancedPairs = (four: Player[]): { t1: Team; t2: Team } | null => {
    if (four.length !== 4) return null;
    const combos: [Team, Team][] = [
      [ { player1: four[0], player2: four[1] }, { player1: four[2], player2: four[3] } ],
      [ { player1: four[0], player2: four[2] }, { player1: four[1], player2: four[3] } ],
      [ { player1: four[0], player2: four[3] }, { player1: four[1], player2: four[2] } ],
    ];
    // first try to find any with diff <= MAX_TEAM_SCORE_DIFF
    for (const [a, b] of combos) {
      const diff = Math.abs(getTeamScore(a) - getTeamScore(b));
      if (diff <= MAX_TEAM_SCORE_DIFF) return { t1: a, t2: b };
    }
    // otherwise pick the minimum-diff combination to avoid deadlock
    let best: { t1: Team; t2: Team } | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const [a, b] of combos) {
      const diff = Math.abs(getTeamScore(a) - getTeamScore(b));
      if (diff < bestDiff) { bestDiff = diff; best = { t1: a, t2: b }; }
    }
    return best;
  };

  // Determine how many matches we should aim to create so distribution is even
  // 모든 선수가 최소 경기에 참여할 수 있도록 계산
  const totalPlayers = normalized.length;
  let targetMatches = Math.ceil((totalPlayers * minGamesPerPlayer) / 4);
  
  // 실제로는 선수들이 자동으로 여러 경기에 참여할 수 있으므로, 모든 선수가 참여하기 위한 최소 경기 수
  // 최악의 경우 일부 선수가 여러 경기에 참여해야 할 수도 있음을 감안
  const estimatedMatches = Math.ceil(totalPlayers * minGamesPerPlayer / 4);
  targetMatches = Math.max(estimatedMatches, Math.ceil(totalPlayers / 4));

  console.log(`  - 목표 경기수: 최소 ${targetMatches}개 (${totalPlayers}명 × ${minGamesPerPlayer}회 ÷ 4)`);

  let attempts = 0;
  const maxAttempts = Math.max(100, players.length * minGamesPerPlayer * 10);
  const needsMore = () => normalized.some(p => counts[p.id] < minGamesPerPlayer);
  
  while (needsMore() && attempts < maxAttempts) {
    // 경기 수가 가장 적은 선수들을 우선으로 선택 (반드시 4명)
    let needPlayers = normalized.filter(p => counts[p.id] < minGamesPerPlayer)
      .sort((a, b) => {
        const countDiff = counts[a.id] - counts[b.id]; // 경기 수 적은 순 (우선순위 1)
        if (countDiff !== 0) return countDiff;
        return getPlayerScore(b) - getPlayerScore(a); // 레벨 높은 순 (우선순위 2)
      });
    
    // 미달자가 4명 미만이면 경기 수 적은 다른 선수로 보충
    if (needPlayers.length < 4) {
      const others = normalized.filter(p => !needPlayers.find(x => x.id === p.id))
        .sort((a, b) => {
          const countDiff = counts[a.id] - counts[b.id];
          if (countDiff !== 0) return countDiff;
          return getPlayerScore(b) - getPlayerScore(a);
        });
      for (const p of others) {
        if (needPlayers.length < 4) needPlayers.push(p);
      }
    }
    
    if (needPlayers.length < 4) {
      console.warn('⚠️ 경기 생성 중단: 4명 미만');
      break;
    }
    
    const { matches: round } = createRound(needPlayers, numberOfCourts);
    
    if (!round || round.length === 0) {
      attempts += 1;
      continue;
    }
    
    // 경기 추가 및 카운트 업데이트
    for (const m of round) {
      result.push(m);
      counts[m.team1.player1.id] = (counts[m.team1.player1.id] || 0) + 1;
      counts[m.team1.player2.id] = (counts[m.team1.player2.id] || 0) + 1;
      counts[m.team2.player1.id] = (counts[m.team2.player1.id] || 0) + 1;
      counts[m.team2.player2.id] = (counts[m.team2.player2.id] || 0) + 1;
    }
    
    attempts += 1;
  }

  // 최우선: 0회 경기 선수를 절대 남기지 않음 (제한 없음)
  let zeroAttempts = 0;
  const maxZeroAttempts = Math.max(50, normalized.length * 3);
  
  while (normalized.some(p => counts[p.id] === 0) && zeroAttempts < maxZeroAttempts) {
    const zeroGamePlayers = normalized.filter(p => counts[p.id] === 0)
      .sort((a, b) => getPlayerScore(b) - getPlayerScore(a));
    
    if (zeroGamePlayers.length === 0) break;
    
    console.warn(`⚠️ 0회 경기 선수 발견: ${zeroGamePlayers.length}명`);
    console.warn(`   선수: ${zeroGamePlayers.slice(0, 5).map(p => `${p.name}(${p.skill_level})`).join(', ')}${zeroGamePlayers.length > 5 ? '...' : ''}`);
    
    // 0회 선수 중 첫 2명 + 경기 수 적은 다른 선수 2명으로 구성
    const picks: Player[] = [];
    
    // 0회 선수 최대 2명 포함 (서로 다른 팀에 배치되도록)
    picks.push(zeroGamePlayers[0]);
    if (zeroGamePlayers.length > 1) picks.push(zeroGamePlayers[1]);
    
    // 나머지는 경기 수가 적은 다른 선수로 채우기
    const others = normalized
      .filter(p => !picks.find(x => x.id === p.id))
      .sort((a, b) => {
        const countDiff = counts[a.id] - counts[b.id];
        if (countDiff !== 0) return countDiff;
        return getPlayerScore(b) - getPlayerScore(a);
      });
    
    for (const p of others) {
      if (picks.length < 4) picks.push(p);
    }
    
    if (picks.length < 4) {
      console.warn('⚠️ 0회 선수 매칭 실패: 4명 미만');
      break;
    }
    
    // 스킬 레벨로 정렬하여 균형잡힌 페어링
    const bySkill = [...picks].sort((a, b) => getPlayerScore(a) - getPlayerScore(b));
    const pairing = bestBalancedPairs([bySkill[0], bySkill[1], bySkill[2], bySkill[3]]);
    
    if (!pairing) {
      console.warn('⚠️ 0회 선수 페어링 실패');
      zeroAttempts++;
      continue;
    }
    
    result.push({ 
      id: `match-zero-cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 
      team1: pairing.t1, 
      team2: pairing.t2, 
      court: (result.length % numberOfCourts) + 1 
    });
    
    [pairing.t1.player1.id, pairing.t1.player2.id, pairing.t2.player1.id, pairing.t2.player2.id].forEach(id => {
      counts[id] = (counts[id] || 0) + 1;
    });
    
    zeroAttempts++;
  }

  // 미달 선수가 여전히 있으면 추가 경기 생성
  if (normalized.some(p => counts[p.id] < minGamesPerPlayer)) {
    let remaining = [...normalized]
      .filter(p => counts[p.id] < minGamesPerPlayer)
      .sort((a, b) => {
        const countDiff = counts[a.id] - counts[b.id];
        if (countDiff !== 0) return countDiff;
        return getPlayerScore(b) - getPlayerScore(a);
      });
    
    let retryCount = 0;
    const maxRetry = Math.max(30, remaining.length * 2);
    
    while (remaining.length >= 4 && retryCount < maxRetry) {
      const { matches: round, used } = createRound(remaining, numberOfCourts);
      
      if (round.length === 0) {
        retryCount++;
        continue;
      }
      
      for (const m of round) {
        result.push(m);
        counts[m.team1.player1.id]++; 
        counts[m.team1.player2.id]++; 
        counts[m.team2.player1.id]++; 
        counts[m.team2.player2.id]++;
      }
      
      remaining = remaining.filter(p => !used.has(p.id) && counts[p.id] < minGamesPerPlayer);
      retryCount++;
    }
  }



  // ✅ 모든 선수가 최소 1회 참여했는지 최종 확인
  const stillZero = normalized.filter(p => counts[p.id] === 0);
  if (stillZero.length > 0) {
    console.error(`❌ 여전히 0회 선수 발견: ${stillZero.length}명 → 강제 포함 처리`);
    
    // 마지막 시도: 0회 선수들을 강제로 포함
    for (const zeroPlayer of stillZero) {
      // 경기 수가 가장 많은 선수 2명 찾기 (그들과 함께 경기할 사람)
      const partners = normalized
        .filter(p => p.id !== zeroPlayer.id)
        .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))
        .slice(0, 2);
      
      if (partners.length < 2) {
        console.warn(`⚠️ 0회 선수 ${zeroPlayer.name} 강제 포함 실패: 파트너 부족`);
        continue;
      }
      
      // 파트너 중 경기 수가 많은 순서로 정렬하여 페어링
      const byCount = [...partners].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
      const pairing = bestBalancedPairs([zeroPlayer, byCount[0], byCount[1], normalized[0]]);
      
      if (pairing) {
        result.push({
          id: `match-final-rescue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          team1: pairing.t1,
          team2: pairing.t2,
          court: (result.length % numberOfCourts) + 1
        });
        counts[zeroPlayer.id]++;
      }
    }
  }

  // 최종 검증 및 상세 로깅
  const finalMissing = normalized.filter(p => counts[p.id] < minGamesPerPlayer);
  const zeroGames = normalized.filter(p => counts[p.id] === 0);
  const allParticipated = normalized.every(p => counts[p.id] > 0);
  
  console.log('✅ 레벨별 경기 생성 완료:');
  console.log(`  - 생성된 경기: ${result.length}개`);
  console.log(`  - 참가한 선수: ${normalized.filter(p => counts[p.id] > 0).length}명 / ${normalized.length}명`);
  
  // 경기 수 분포
  const distribution: Record<number, number> = {};
  normalized.forEach(p => {
    const count = counts[p.id] || 0;
    distribution[count] = (distribution[count] || 0) + 1;
  });
  console.log('  - 경기 수 분포:', distribution);
  
  // 최종 검증
  if (zeroGames.length > 0) {
    console.error(`❌ 치명적: ${zeroGames.length}명이 경기에 한 번도 참여하지 못함!`);
    console.error(`   선수: ${zeroGames.map(p => `${p.name}(${p.skill_level})`).join(', ')}`);
  } else {
    console.log(`✅ 모든 선수 참여 완료!`);
  }
  
  if (finalMissing.length > 0) {
    console.warn(`⚠️ ${finalMissing.length}명이 목표 ${minGamesPerPlayer}회 미달:`);
    finalMissing.forEach(p => {
      console.warn(`   - ${p.name}(${p.skill_level}): ${counts[p.id] || 0}회`);
    });
  }
  
  // 전체 참가 현황 (상위 10명만 샘플 출력)
  const participationStatus = normalized
    .map(p => ({
      name: p.name,
      level: p.skill_level,
      games: counts[p.id] || 0,
      status: (counts[p.id] || 0) >= minGamesPerPlayer ? '✓' : '✗'
    }))
    .sort((a, b) => b.games - a.games);
  
  console.log('  - 참가 현황 (상위 10명):');
  participationStatus.slice(0, 10).forEach(p => {
    console.log(`    ${p.status} ${p.name}(${p.level}): ${p.games}회`);
  });

  return reorderMatchesToAvoidConsecutive(result);
}
