import { Player, Match, Team } from '@/types';
import { getTeamFairnessScore, getTeamMatchScore, getTeamScore, jitter, reorderMatchesToAvoidConsecutive, MAX_TEAM_SCORE_DIFF } from './match-helpers';

const isMale = (p: Player) => (p.gender || '').toLowerCase() === 'm' || (p.gender || '').toLowerCase() === 'male' || (p.gender || '').toLowerCase() === 'man';
const isFemale = (p: Player) => (p.gender || '').toLowerCase() === 'f' || (p.gender || '').toLowerCase() === 'female' || (p.gender || '').toLowerCase() === 'woman' || (p.gender || '').toLowerCase() === 'w';

export function createMixedAndSameSexDoublesMatches(players: Player[], numberOfCourts: number, minGamesPerPlayer = 1): Match[] {
  if (!Array.isArray(players) || players.length < 4 || numberOfCourts <= 0) return [];

  const counts: Record<string, number> = {};
  players.forEach(p => { counts[p.id] = 0; });
  const result: Match[] = [];
  const totalPlayers = players.length;
  let targetMatches = Math.ceil((totalPlayers * minGamesPerPlayer) / 4);
  targetMatches = Math.max(targetMatches, Math.ceil(totalPlayers / 4));
  
  console.log(`👫 혼합복식 경기 생성 시작: ${totalPlayers}명, 최소 ${targetMatches}경기`);

  // helper: given 4 players, pick best-balanced pairing
  const bestBalancedPairs = (four: Player[]): { t1: Team; t2: Team } | null => {
    if (four.length !== 4) return null;
    const candidates: [Team, Team][] = [
      [ { player1: four[0], player2: four[1] }, { player1: four[2], player2: four[3] } ],
      [ { player1: four[0], player2: four[2] }, { player1: four[1], player2: four[3] } ],
      [ { player1: four[0], player2: four[3] }, { player1: four[1], player2: four[2] } ],
    ];
    let best: { t1: Team; t2: Team } | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const [a, b] of candidates) {
      const diff = Math.abs(getTeamScore(a) - getTeamScore(b));
      if (diff <= MAX_TEAM_SCORE_DIFF) { best = { t1: a, t2: b }; break; }
      if (diff < bestDiff) { bestDiff = diff; best = { t1: a, t2: b }; }
    }
    return best;
  };
  
  let attempts = 0;
  const maxAttempts = Math.max(100, players.length * minGamesPerPlayer * 10);
  const needsMore = () => players.some(p => counts[p.id] < minGamesPerPlayer);
  
  while (needsMore() && attempts < maxAttempts) {
    // prefer males/females who have lower counts
    const males = players.filter(isMale).sort((a, b) => counts[a.id] - counts[b.id]);
    const females = players.filter(isFemale).sort((a, b) => counts[a.id] - counts[b.id]);
    const unspecified = players.filter(p => !isMale(p) && !isFemale(p)).sort((a, b) => counts[a.id] - counts[b.id]);

    // 남녀 모두 없으면 중단
    if (males.length === 0 && females.length === 0) {
      console.warn('⚠️ 혼합복식: 성별 정보가 있는 선수가 없음');
      break;
    }

    // 혼복 가능한 모든 팀 조합 생성
    const allCandidates: { team: Team; score: number; isMixed: boolean }[] = [];
    
    // 혼복 팀 (남-여)
    if (males.length > 0 && females.length > 0) {
      for (const m of males) {
        for (const f of females) {
          const t: Team = { player1: m, player2: f };
          allCandidates.push({ team: t, score: getTeamScore(t), isMixed: true });
        }
      }
    }
    
    // 미지정 + 남성
    for (const u of unspecified) {
      for (const m of males) {
        const t: Team = { player1: u, player2: m };
        allCandidates.push({ team: t, score: getTeamScore(t), isMixed: false });
      }
    }
    
    // 미지정 + 여성
    for (const u of unspecified) {
      for (const f of females) {
        const t: Team = { player1: u, player2: f };
        allCandidates.push({ team: t, score: getTeamScore(t), isMixed: false });
      }
    }
    
    // 같은 성별 (미지정 제외)
    for (let i = 0; i < males.length; i++) {
      for (let j = i + 1; j < males.length; j++) {
        const t: Team = { player1: males[i], player2: males[j] };
        allCandidates.push({ team: t, score: getTeamScore(t), isMixed: false });
      }
    }
    for (let i = 0; i < females.length; i++) {
      for (let j = i + 1; j < females.length; j++) {
        const t: Team = { player1: females[i], player2: females[j] };
        allCandidates.push({ team: t, score: getTeamScore(t), isMixed: false });
      }
    }
    
    // 미지정끼리
    for (let i = 0; i < unspecified.length; i++) {
      for (let j = i + 1; j < unspecified.length; j++) {
        const t: Team = { player1: unspecified[i], player2: unspecified[j] };
        allCandidates.push({ team: t, score: getTeamScore(t), isMixed: false });
      }
    }
    
    // 점수로 정렬
    allCandidates.sort((a, b) => a.score - b.score);

    const matches: Match[] = [];
    const used = new Set<string>();

    for (let i = 0; i < allCandidates.length; i++) {
      const t1 = allCandidates[i];
      if (used.has(t1.team.player1.id) || used.has(t1.team.player2.id)) continue;

      // 점수 차이 <= MAX_TEAM_SCORE_DIFF인 상대팀 찾기
      let bestOpponent: { team: Team; diff: number } | null = null;

      for (let j = i + 1; j < allCandidates.length; j++) {
        const t2 = allCandidates[j];
        if (used.has(t2.team.player1.id) || used.has(t2.team.player2.id)) continue;
        if (t1.team.player1.id === t2.team.player1.id || t1.team.player1.id === t2.team.player2.id ||
            t1.team.player2.id === t2.team.player1.id || t1.team.player2.id === t2.team.player2.id) continue;

        const diff = Math.abs(t1.score - t2.score);
        
        // 점수 차이가 MAX_TEAM_SCORE_DIFF 이하면 최적 후보
        if (diff <= MAX_TEAM_SCORE_DIFF) {
          if (!bestOpponent || diff < bestOpponent.diff) {
            bestOpponent = { team: t2.team, diff };
          }
        }
      }

      // MAX_TEAM_SCORE_DIFF 이하의 상대가 없으면 최소 차이 상대 선택
      if (!bestOpponent) {
        let minDiff = Number.POSITIVE_INFINITY;
        for (let j = i + 1; j < allCandidates.length; j++) {
          const t2 = allCandidates[j];
          if (used.has(t2.team.player1.id) || used.has(t2.team.player2.id)) continue;
          if (t1.team.player1.id === t2.team.player1.id || t1.team.player1.id === t2.team.player2.id ||
              t1.team.player2.id === t2.team.player1.id || t1.team.player2.id === t2.team.player2.id) continue;

          const diff = Math.abs(t1.score - t2.score);
          if (diff < minDiff) {
            minDiff = diff;
            bestOpponent = { team: t2.team, diff };
          }
        }
      }

      if (bestOpponent) {
        matches.push({
          id: `match-mixed-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          team1: t1.team,
          team2: bestOpponent.team,
          court: (matches.length % numberOfCourts) + 1
        });
        [t1.team.player1.id, t1.team.player2.id, bestOpponent.team.player1.id, bestOpponent.team.player2.id].forEach(id => used.add(id));
        counts[t1.team.player1.id]++;
        counts[t1.team.player2.id]++;
        counts[bestOpponent.team.player1.id]++;
        counts[bestOpponent.team.player2.id]++;
      }
    }

    // append matches from this attempt
    for (const m of matches) {
      result.push(m);
    }

    attempts++;
  }

  // 최우선: 0회 경기 선수를 절대 남기지 않음 (제한 없음)
  let zeroAttempts = 0;
  const maxZeroAttempts = Math.max(50, players.length * 3);
  
  while (players.some(p => counts[p.id] === 0) && zeroAttempts < maxZeroAttempts) {
    const zeroGamePlayers = players.filter(p => counts[p.id] === 0)
      .sort((a, b) => {
        const aIsMale = isMale(a) ? 0 : 1;
        const bIsMale = isMale(b) ? 0 : 1;
        return aIsMale - bIsMale;
      });
    
    if (zeroGamePlayers.length === 0) break;
    
    console.warn(`⚠️ 혼합복식 - 0회 경기 선수 발견: ${zeroGamePlayers.length}명`);
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
      console.warn('⚠️ 혼합복식 - 0회 선수 매칭 실패: 4명 미만');
      break;
    }
    
    // 혼합복식 우선, 안되면 동성 복식
    const malesP = picks.filter(isMale);
    const femalesP = picks.filter(isFemale);
    let t1: Team | null = null;
    let t2: Team | null = null;
    
    if (malesP.length >= 2 && femalesP.length >= 2) {
      t1 = { player1: malesP[0], player2: femalesP[0] };
      t2 = { player1: malesP[1], player2: femalesP[1] };
    } else {
      const pairing = bestBalancedPairs(picks);
      if (!pairing) {
        console.warn('⚠️ 혼합복식 - 0회 선수 페어링 실패');
        zeroAttempts++;
        continue;
      }
      t1 = pairing.t1;
      t2 = pairing.t2;
    }
    
    if (!t1 || !t2) {
      console.warn('⚠️ 혼합복식 - 0회 선수 팀 구성 실패');
      zeroAttempts++;
      continue;
    }
    
    result.push({ 
      id: `match-mixed-zero-cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 
      team1: t1, 
      team2: t2, 
      court: (result.length % numberOfCourts) + 1 
    });
    
    [t1.player1.id, t1.player2.id, t2.player1.id, t2.player2.id].forEach(id => {
      counts[id] = (counts[id] || 0) + 1;
    });
    
    zeroAttempts++;
  }
  
  // ✅ 모든 선수가 최소 1회 참여했는지 최종 확인
  const stillZero = players.filter(p => counts[p.id] === 0);
  if (stillZero.length > 0) {
    console.error(`❌ 여전히 0회 선수 발견: ${stillZero.length}명 → 강제 포함 처리`);
    
    for (const zeroPlayer of stillZero) {
      const partners = players
        .filter(p => p.id !== zeroPlayer.id)
        .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))
        .slice(0, 2);
      
      if (partners.length < 2) {
        console.warn(`⚠️ 혼합복식 - 0회 선수 ${zeroPlayer.name} 강제 포함 실패: 파트너 부족`);
        continue;
      }
      
      const byCount = [...partners].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
      
      let t1: Team | null = null;
      let t2: Team | null = null;
      const picks = [zeroPlayer, byCount[0], byCount[1], players[0]];
      const malesP = picks.filter(isMale);
      const femalesP = picks.filter(isFemale);
      
      if (malesP.length >= 2 && femalesP.length >= 2) {
        t1 = { player1: malesP[0], player2: femalesP[0] };
        t2 = { player1: malesP[1], player2: femalesP[1] };
      } else {
        const pairing = bestBalancedPairs(picks);
        if (pairing) {
          t1 = pairing.t1;
          t2 = pairing.t2;
        }
      }
      
      if (t1 && t2) {
        result.push({
          id: `match-mixed-final-rescue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          team1: t1,
          team2: t2,
          court: (result.length % numberOfCourts) + 1
        });
        counts[zeroPlayer.id]++;
      }
    }
  }

  // 최종 검증 및 상세 로깅
  const finalMissing = players.filter(p => counts[p.id] < minGamesPerPlayer);
  const zeroGames = players.filter(p => counts[p.id] === 0);
  
  console.log('✅ 혼합복식 경기 생성 완료:');
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
