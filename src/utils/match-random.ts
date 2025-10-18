import { Player, Match, Team } from '@/types';
import { shuffle, getLevelGroup, getTeamScore, getTeamMatchScore, reorderMatchesToAvoidConsecutive, MAX_TEAM_SCORE_DIFF } from './match-helpers';

export function createRandomBalancedDoublesMatches(players: Player[], numberOfCourts: number, minGamesPerPlayer = 1): Match[] {
  if (!Array.isArray(players) || players.length < 4 || numberOfCourts <= 0) return [];

  const counts: Record<string, number> = {};
  players.forEach(p => { counts[p.id] = 0; });
  const result: Match[] = [];
  const totalPlayers = players.length;
  let targetMatches = Math.ceil((totalPlayers * minGamesPerPlayer) / 4);
  targetMatches = Math.max(targetMatches, Math.ceil(totalPlayers / 4));
  
  console.log(`🎲 랜덤 경기 생성 시작: ${totalPlayers}명, 최소 ${targetMatches}경기`);

  // helper: given 4 players, pick best-balanced pairing preferring diff <= MAX_TEAM_SCORE_DIFF
  const bestBalancedPairs = (four: Player[]): { t1: Team; t2: Team } | null => {
    if (four.length !== 4) return null;
    const combos: [Team, Team][] = [
      [ { player1: four[0], player2: four[1] }, { player1: four[2], player2: four[3] } ],
      [ { player1: four[0], player2: four[2] }, { player1: four[1], player2: four[3] } ],
      [ { player1: four[0], player2: four[3] }, { player1: four[1], player2: four[2] } ],
    ];
    for (const [a, b] of combos) {
      const diff = Math.abs(getTeamScore(a) - getTeamScore(b));
      if (diff <= MAX_TEAM_SCORE_DIFF) return { t1: a, t2: b };
    }
    let best: { t1: Team; t2: Team } | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const [a, b] of combos) {
      const diff = Math.abs(getTeamScore(a) - getTeamScore(b));
      if (diff < bestDiff) { bestDiff = diff; best = { t1: a, t2: b }; }
    }
    return best;
  };

  let attempts = 0;
  const maxAttempts = Math.max(100, players.length * minGamesPerPlayer * 10);
  const needsMore = () => players.some(p => counts[p.id] < minGamesPerPlayer);
  
  while (needsMore() && attempts < maxAttempts) {
    // shuffle but favor players with lower counts by sorting then shuffling chunks
    let needPlayers = players.filter(p => counts[p.id] < minGamesPerPlayer)
      .sort((a, b) => {
        const countDiff = counts[a.id] - counts[b.id];
        if (countDiff !== 0) return countDiff;
        return Math.random() - 0.5;
      });
    
    // 미달자가 4명 미만이면 경기 수 적은 다른 선수로 보충
    if (needPlayers.length < 4) {
      const others = players.filter(p => !needPlayers.find(x => x.id === p.id))
        .sort((a, b) => {
          const countDiff = counts[a.id] - counts[b.id];
          if (countDiff !== 0) return countDiff;
          return Math.random() - 0.5;
        });
      for (const p of others) {
        if (needPlayers.length < 4) needPlayers.push(p);
      }
    }
    
    if (needPlayers.length < 4) {
      console.warn('⚠️ 랜덤 경기 중단: 4명 미만');
      break;
    }
    
    // shuffle the pool and try to create teams
    const pool = shuffle(needPlayers);
    const used = new Set<string>();
    const teams: Team[] = [];

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (used.has(p.id)) continue;
      let partner = -1;
      const groupP = getLevelGroup(p.skill_level);
      for (let j = pool.length - 1; j > i; j--) {
        const q = pool[j];
        if (used.has(q.id)) continue;
        if (getLevelGroup(q.skill_level) === groupP) continue;
        partner = j; break;
      }
      if (partner !== -1) {
        const q = pool[partner];
        teams.push({ player1: p, player2: q });
        used.add(p.id); used.add(q.id);
      }
    }

    if (teams.length === 0) {
      attempts++;
      continue;
    }

    const teamWithScore = teams.map(t => ({ team: t, score: getTeamScore(t) })).sort((a, b) => a.score - b.score);
    const usedTeamIdx = new Set<number>();
    
    for (let i = 0; i < teamWithScore.length; i++) {
      if (usedTeamIdx.has(i)) continue;
      const t1 = teamWithScore[i];
      // find best partner with diff <= MAX_TEAM_SCORE_DIFF
      let pickedIdx = -1;
      for (let j = i + 1; j < teamWithScore.length; j++) {
        if (usedTeamIdx.has(j)) continue;
        const t2 = teamWithScore[j];
        const diff = Math.abs(t1.score - t2.score);
        if (diff <= MAX_TEAM_SCORE_DIFF) { pickedIdx = j; break; }
      }
      if (pickedIdx === -1) continue;
      const t2 = teamWithScore[pickedIdx];
      result.push({ 
        id: `match-rand-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, 
        team1: t1.team, 
        team2: t2.team, 
        court: (result.length % numberOfCourts) + 1 
      });
      counts[t1.team.player1.id]++; 
      counts[t1.team.player2.id]++; 
      counts[t2.team.player1.id]++; 
      counts[t2.team.player2.id]++;
      usedTeamIdx.add(i); 
      usedTeamIdx.add(pickedIdx);
    }
    
    attempts++;
  }

  // 최우선: 0회 경기 선수를 절대 남기지 않음 (제한 없음)
  let zeroAttempts = 0;
  const maxZeroAttempts = Math.max(50, players.length * 3);
  
  while (players.some(p => counts[p.id] === 0) && zeroAttempts < maxZeroAttempts) {
    const zeroGamePlayers = players.filter(p => counts[p.id] === 0)
      .sort(() => Math.random() - 0.5);
    
    if (zeroGamePlayers.length === 0) break;
    
    console.warn(`⚠️ 랜덤 경기 - 0회 경기 선수 발견: ${zeroGamePlayers.length}명`);
    console.warn(`   선수: ${zeroGamePlayers.slice(0, 5).map(p => `${p.name}(${p.skill_level})`).join(', ')}${zeroGamePlayers.length > 5 ? '...' : ''}`);
    
    // 0회 선수 중 첫 2명 + 경기 수 적은 다른 선수 2명으로 구성
    const picks: Player[] = [];
    
    // 0회 선수 최대 2명 포함
    picks.push(zeroGamePlayers[0]);
    if (zeroGamePlayers.length > 1) picks.push(zeroGamePlayers[1]);
    
    // 나머지는 경기 수가 적은 다른 선수로 채우기
    const others = players
      .filter(p => !picks.find(x => x.id === p.id))
      .sort((a, b) => {
        const countDiff = counts[a.id] - counts[b.id];
        if (countDiff !== 0) return countDiff;
        return Math.random() - 0.5;
      });
    
    for (const p of others) {
      if (picks.length < 4) picks.push(p);
    }
    
    if (picks.length < 4) {
      console.warn('⚠️ 랜덤 경기 - 0회 선수 매칭 실패: 4명 미만');
      break;
    }
    
    const pairing = bestBalancedPairs(picks);
    if (!pairing) {
      console.warn('⚠️ 랜덤 경기 - 0회 선수 페어링 실패');
      zeroAttempts++;
      continue;
    }
    
    result.push({ 
      id: `match-rand-zero-cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 
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
  if (players.some(p => counts[p.id] < minGamesPerPlayer)) {
    let remaining = [...players]
      .filter(p => counts[p.id] < minGamesPerPlayer)
      .sort((a, b) => {
        const countDiff = counts[a.id] - counts[b.id];
        if (countDiff !== 0) return countDiff;
        return Math.random() - 0.5;
      });
    
    let retryCount = 0;
    const maxRetry = Math.max(30, remaining.length * 2);
    
    while (remaining.length >= 4 && retryCount < maxRetry) {
      const pool = shuffle(remaining);
      const used = new Set<string>();
      const teams: Team[] = [];

      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (used.has(p.id)) continue;
        let partner = -1;
        const groupP = getLevelGroup(p.skill_level);
        for (let j = pool.length - 1; j > i; j--) {
          const q = pool[j];
          if (used.has(q.id)) continue;
          if (getLevelGroup(q.skill_level) === groupP) continue;
          partner = j; break;
        }
        if (partner !== -1) {
          const q = pool[partner];
          teams.push({ player1: p, player2: q });
          used.add(p.id); 
          used.add(q.id);
        }
      }

      if (teams.length === 0) {
        retryCount++;
        continue;
      }

      const teamWithScore = teams.map(t => ({ team: t, score: getTeamScore(t) })).sort((a, b) => a.score - b.score);
      const usedTeamIdx = new Set<number>();
      
      for (let i = 0; i < teamWithScore.length; i++) {
        if (usedTeamIdx.has(i)) continue;
        const t1 = teamWithScore[i];
        let pickedIdx = -1;
        for (let j = i + 1; j < teamWithScore.length; j++) {
          if (usedTeamIdx.has(j)) continue;
          const t2 = teamWithScore[j];
          const diff = Math.abs(t1.score - t2.score);
          if (diff <= MAX_TEAM_SCORE_DIFF) { pickedIdx = j; break; }
        }
        if (pickedIdx === -1) continue;
        const t2 = teamWithScore[pickedIdx];
        result.push({ 
          id: `match-rand-retry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, 
          team1: t1.team, 
          team2: t2.team, 
          court: (result.length % numberOfCourts) + 1 
        });
        counts[t1.team.player1.id]++; 
        counts[t1.team.player2.id]++; 
        counts[t2.team.player1.id]++; 
        counts[t2.team.player2.id]++;
        usedTeamIdx.add(i); 
        usedTeamIdx.add(pickedIdx);
      }
      
      remaining = remaining.filter(p => !used.has(p.id) && counts[p.id] < minGamesPerPlayer);
      retryCount++;
    }
  }

  // 최종 검증 및 상세 로깅
  const finalMissing = players.filter(p => counts[p.id] < minGamesPerPlayer);
  const zeroGames = players.filter(p => counts[p.id] === 0);
  
  console.log('✅ 랜덤 경기 생성 완료:');
  console.log(`  - 생성된 경기: ${result.length}개`);
  console.log(`  - 참가한 선수: ${players.filter(p => counts[p.id] > 0).length}명 / ${players.length}명`);
  
  // 경기 수 분포
  const distribution: Record<number, number> = {};
  players.forEach(p => {
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

  return reorderMatchesToAvoidConsecutive(result);
}
