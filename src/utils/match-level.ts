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
  const totalPlayers = normalized.length;
  const targetPlayerSlots = totalPlayers * minGamesPerPlayer;
  const targetMatches = Math.ceil(targetPlayerSlots / 4);

  console.log(`  - 목표 경기수: ${targetMatches}개 (${totalPlayers}명 × ${minGamesPerPlayer}회 ÷ 4)`);

  let attempts = 0;
  const maxAttempts = Math.max(20, players.length * minGamesPerPlayer * 6);
  const needsMore = () => normalized.some(p => counts[p.id] < minGamesPerPlayer);
  let stalled = 0;
  
  while ((result.length < targetMatches || needsMore()) && attempts < maxAttempts) {
    // 레벨 높은 순서로 우선 배정: 먼저 경기 수가 적은 선수 중 레벨이 높은 선수부터
    let needPlayers = normalized.filter(p => counts[p.id] < minGamesPerPlayer);
    
    if (needPlayers.length < 4) {
      // 모든 선수를 포함하되 레벨 높은 순 → 경기 수 적은 순으로 정렬
      needPlayers = [...normalized].sort((a, b) => {
        const countDiff = counts[a.id] - counts[b.id];
        if (countDiff !== 0) return countDiff; // 경기 수 적은 순
        return getPlayerScore(b) - getPlayerScore(a); // 레벨 높은 순
      });
    } else {
      // 미달자가 4명 이상이면 그들을 레벨 높은 순으로 정렬
      needPlayers.sort((a, b) => {
        const countDiff = counts[a.id] - counts[b.id];
        if (countDiff !== 0) return countDiff; // 경기 수 적은 순
        return getPlayerScore(b) - getPlayerScore(a); // 레벨 높은 순
      });
    }
    
    const before = result.length;
    const { matches: round } = createRound(needPlayers, numberOfCourts);
    
    if (!round || round.length === 0) {
      attempts += 1;
      stalled += 1;
      if (stalled >= 3) break;
      continue;
    }
    
    // append and update counts
    for (const m of round) {
      if (result.length >= targetMatches) break;
      result.push(m);
      counts[m.team1.player1.id] = (counts[m.team1.player1.id] || 0) + 1;
      counts[m.team1.player2.id] = (counts[m.team1.player2.id] || 0) + 1;
      counts[m.team2.player1.id] = (counts[m.team2.player1.id] || 0) + 1;
      counts[m.team2.player2.id] = (counts[m.team2.player2.id] || 0) + 1;
    }
    
    attempts += 1;
    stalled = result.length === before ? stalled + 1 : 0;
  }

  // 최우선: 0회 경기 선수를 절대 남기지 않음 (단, targetMatches 초과 금지)
  const zeroGamePlayers = normalized.filter(p => counts[p.id] === 0);
  if (zeroGamePlayers.length > 0) {
    console.warn(`⚠️ 0회 경기 선수 발견: ${zeroGamePlayers.length}명`);
    console.warn(`   선수: ${zeroGamePlayers.map(p => `${p.name}(${p.skill_level})`).join(', ')}`);
    
    // 0회 선수들을 반드시 포함시키기 위한 강제 매칭 (targetMatches까지만)
    while (zeroGamePlayers.length > 0 && result.length < targetMatches) {
      const zeroNow = normalized.filter(p => counts[p.id] === 0);
      if (zeroNow.length === 0) break;
      
      // 0회 선수 중 레벨 높은 순으로 4명 선택
      const picks: Player[] = [];
      const sortedZero = [...zeroNow].sort((a, b) => getPlayerScore(b) - getPlayerScore(a));
      
      for (const p of sortedZero) {
        if (picks.length < 4) picks.push(p);
      }
      
      // 4명 미만이면 경기 수 적은 선수로 보충
      if (picks.length < 4) {
        const fillers = [...normalized]
          .filter(p => !picks.find(x => x.id === p.id))
          .sort((a, b) => {
            const countDiff = counts[a.id] - counts[b.id];
            if (countDiff !== 0) return countDiff;
            return getPlayerScore(b) - getPlayerScore(a);
          });
        for (const p of fillers) {
          if (picks.length < 4) picks.push(p);
        }
      }
      
      if (picks.length < 4) break;
      
      const bySkill = [...picks].sort((a, b) => getPlayerScore(a) - getPlayerScore(b));
      const pairing = bestBalancedPairs([bySkill[0], bySkill[1], bySkill[2], bySkill[3]]);
      
      if (!pairing) break;
      
      const t1 = pairing.t1;
      const t2 = pairing.t2;
      
      result.push({ 
        id: `match-zero-cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 
        team1: t1, 
        team2: t2, 
        court: (result.length % numberOfCourts) + 1 
      });
      
      [t1.player1.id, t1.player2.id, t2.player1.id, t2.player2.id].forEach(id => {
        counts[id] = (counts[id] || 0) + 1;
      });
    }
  }

  // If still not everyone satisfied, try a best-effort final pass (targetMatches까지만)
  if (normalized.some(p => counts[p.id] < minGamesPerPlayer) && result.length < targetMatches) {
    let remaining = [...normalized]
      .filter(p => counts[p.id] < minGamesPerPlayer)
      .sort((a, b) => {
        const countDiff = counts[a.id] - counts[b.id];
        if (countDiff !== 0) return countDiff;
        return getPlayerScore(b) - getPlayerScore(a);
      });
      
    while (remaining.length >= 4 && result.length < targetMatches) {
      const { matches: round, used } = createRound(remaining, numberOfCourts);
      if (round.length === 0) break;
      for (const m of round) {
        if (result.length >= targetMatches) break;
        result.push(m);
        counts[m.team1.player1.id]++; 
        counts[m.team1.player2.id]++; 
        counts[m.team2.player1.id]++; 
        counts[m.team2.player2.id]++;
      }
      remaining = remaining.filter(p => !used.has(p.id));
    }
  }

  // Greedy final inclusion: 모든 선수가 최소 1회는 반드시 경기에 참여하도록 보장
  const skillOf = (p: Player) => getPlayerScore(p);
  
  let guard = 0;
  const maxGuard = Math.max(50, normalized.length * 2); // 선수 수에 비례하여 증가
  
  while (normalized.some(p => counts[p.id] < minGamesPerPlayer) && guard < maxGuard) {
    // 우선 순위 1: 최소 경기 미달자 (0회 경기 선수 최우선)
    const zeroGamePlayers = normalized.filter(p => counts[p.id] === 0);
    const needers = normalized.filter(p => counts[p.id] < minGamesPerPlayer)
      .sort((a, b) => {
        // 0회 선수를 최우선으로
        const aZero = counts[a.id] === 0 ? -1000 : 0;
        const bZero = counts[b.id] === 0 ? -1000 : 0;
        return (aZero - bZero) || (counts[a.id] - counts[b.id]) || (skillOf(a) - skillOf(b));
      });
    
    const picks: Player[] = [];
    
    // 0회 경기 선수가 있으면 최소 2명 포함
    if (zeroGamePlayers.length > 0) {
      for (const p of zeroGamePlayers) {
        if (picks.length < 4 && !picks.find(x => x.id === p.id)) picks.push(p);
        if (picks.length >= 2 && zeroGamePlayers.length >= 2) break; // 0회 선수 2명 확보하면 나머지는 다른 선수
      }
    }
    
    // 나머지 미달자로 채우기
    for (const p of needers) { 
      if (picks.length < 4 && !picks.find(x => x.id === p.id)) picks.push(p); 
    }
    
    // 4명 미만이면 전체 선수 풀에서 보충 (경기 수가 적은 순서대로)
    if (picks.length < 4) {
      const fillers = [...normalized]
        .sort((a, b) => counts[a.id] - counts[b.id] || skillOf(a) - skillOf(b))
        .filter(p => !picks.find(x => x.id === p.id));
      for (const p of fillers) { if (picks.length < 4) picks.push(p); }
    }
    
    if (picks.length < 4) {
      console.warn('⚠️ 레벨별 경기 생성: 4명을 구성할 수 없어 중단');
      break;
    }
    
    // 스킬 레벨로 정렬하여 균형잡힌 팀 구성
    const bySkill = [...picks].sort((a, b) => skillOf(a) - skillOf(b));
    const pairing = bestBalancedPairs([bySkill[0], bySkill[1], bySkill[2], bySkill[3]]);
    
    if (!pairing) {
      console.warn('⚠️ 레벨별 경기 생성: 팀 페어링 실패');
      guard += 1;
      continue;
    }
    
    const t1: Team = pairing.t1;
    const t2: Team = pairing.t2;
    if (result.length < targetMatches) {
      result.push({ id: `match-balanced-cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, team1: t1, team2: t2, court: (result.length % numberOfCourts) + 1 });
      [t1.player1.id, t1.player2.id, t2.player1.id, t2.player2.id].forEach(id => counts[id] = (counts[id] || 0) + 1);
    } else {
      // perform swap-based replacement into existing matches to include missing players without increasing match count
      const missing = normalized.filter(p => counts[p.id] < minGamesPerPlayer);
      const getIds = (m: Match) => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id];
      const isInMatch = (m: Match, pid: string) => getIds(m).includes(pid);
      type Slot = { mi: number; team: 1 | 2; pos: 1 | 2; id: string };
      const collectSlots = (): Slot[] => {
        const slots: Slot[] = [];
        for (let mi = 0; mi < result.length; mi++) {
          const m = result[mi];
          slots.push({ mi, team: 1, pos: 1, id: m.team1.player1.id });
          slots.push({ mi, team: 1, pos: 2, id: m.team1.player2.id });
          slots.push({ mi, team: 2, pos: 1, id: m.team2.player1.id });
          slots.push({ mi, team: 2, pos: 2, id: m.team2.player2.id });
        }
        return slots;
      };
      const replaceInMatchIfBalanced = (slot: Slot, newPlayer: Player): boolean => {
        const m = result[slot.mi];
        const decId = slot.id;
        const t1c = { player1: m.team1.player1, player2: m.team1.player2 } as Team;
        const t2c = { player1: m.team2.player1, player2: m.team2.player2 } as Team;
        if (slot.team === 1) {
          if (slot.pos === 1) t1c.player1 = newPlayer; else t1c.player2 = newPlayer;
        } else {
          if (slot.pos === 1) t2c.player1 = newPlayer; else t2c.player2 = newPlayer;
        }
        // prevent duplicates
        if (isInMatch(m, newPlayer.id)) return false;
        const diff = Math.abs(getTeamScore(t1c) - getTeamScore(t2c));
        if (diff > MAX_TEAM_SCORE_DIFF) return false;
        // commit
        if (slot.team === 1) {
          if (slot.pos === 1) m.team1.player1 = newPlayer; else m.team1.player2 = newPlayer;
        } else {
          if (slot.pos === 1) m.team2.player1 = newPlayer; else m.team2.player2 = newPlayer;
        }
        counts[decId] = Math.max(0, (counts[decId] || 0) - 1);
        counts[newPlayer.id] = (counts[newPlayer.id] || 0) + 1;
        return true;
      };
      // attempt greedy swaps for each missing player
      for (const p of missing) {
        if (counts[p.id] >= minGamesPerPlayer) continue;
        let swapped = false;
        const slots = collectSlots().sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
        for (const s of slots) {
          if ((counts[s.id] || 0) <= minGamesPerPlayer) continue;
          const m = result[s.mi];
          if (isInMatch(m, p.id)) continue;
          if (replaceInMatchIfBalanced(s, p)) { swapped = true; break; }
        }
        if (!swapped) {
          // try any slot
          const slots2 = collectSlots();
          for (const s of slots2) {
            const m = result[s.mi];
            if (isInMatch(m, p.id)) continue;
            if (replaceInMatchIfBalanced(s, p)) { swapped = true; break; }
          }
        }
      }
    }
    guard += 1;
  }

  // 🚨 중요: targetMatches에 도달하지 못한 경우 추가 경기 생성 (필수!)
  if (result.length < targetMatches) {
    console.warn(`⚠️ 레벨별 경기 - 목표 미달: ${result.length}개 / ${targetMatches}개, 추가 경기 생성 중...`);
    let attemptsAdd = 0;
    const maxAttemptsAdd = Math.max(50, (targetMatches - result.length) * 10);
    
    while (result.length < targetMatches && attemptsAdd < maxAttemptsAdd) {
      // 경기 수가 적은 선수 중 레벨 높은 순서로 선택
      const pool = [...normalized].sort((a, b) => {
        const countDiff = (counts[a.id] || 0) - (counts[b.id] || 0);
        if (countDiff !== 0) return countDiff;
        return getPlayerScore(b) - getPlayerScore(a); // 레벨 높은 순
      });
      
      const picks: Player[] = [];
      for (const p of pool) { 
        if (picks.length < 4 && !picks.find(x => x.id === p.id)) {
          picks.push(p);
        }
      }
      
      if (picks.length < 4) {
        console.error(`❌ 레벨별 경기 - 4명 구성 실패 (현재 ${picks.length}명), 중단`);
        break;
      }
      
      const bySkill = [...picks].sort((a, b) => getPlayerScore(a) - getPlayerScore(b));
      const pairing = bestBalancedPairs([bySkill[0], bySkill[1], bySkill[2], bySkill[3]]);
      
      if (!pairing) {
        console.error('❌ 레벨별 경기 - 팀 페어링 실패');
        attemptsAdd++;
        continue;
      }
      
      const match: Match = { 
        id: `match-level-fill-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, 
        team1: pairing.t1, 
        team2: pairing.t2, 
        court: (result.length % numberOfCourts) + 1 
      };
      result.push(match);
      counts[pairing.t1.player1.id]++;
      counts[pairing.t1.player2.id]++;
      counts[pairing.t2.player1.id]++;
      counts[pairing.t2.player2.id]++;
      attemptsAdd++;
    }
    
    console.log(`  → 추가 경기 생성 완료: ${result.length}개`);
  }

  // 🚨 중요: targetMatches를 초과한 경기는 제거 (46명 → 12경기 엄수)
  if (result.length > targetMatches) {
    console.warn(`⚠️ 경기 수 초과 감지: ${result.length}개 → ${targetMatches}개로 조정`);
    result.splice(targetMatches); // 초과분 제거
    
    // counts 재계산
    for (const key in counts) {
      counts[key] = 0;
    }
    for (const m of result) {
      counts[m.team1.player1.id] = (counts[m.team1.player1.id] || 0) + 1;
      counts[m.team1.player2.id] = (counts[m.team1.player2.id] || 0) + 1;
      counts[m.team2.player1.id] = (counts[m.team2.player1.id] || 0) + 1;
      counts[m.team2.player2.id] = (counts[m.team2.player2.id] || 0) + 1;
    }
  }

  // 최종 검증 및 상세 로깅
  const finalMissing = normalized.filter(p => counts[p.id] < minGamesPerPlayer);
  const zeroGames = normalized.filter(p => counts[p.id] === 0);
  
  console.log('✅ 레벨별 경기 생성 완료:');
  console.log(`  - 목표 경기: ${targetMatches}개`);
  console.log(`  - 생성된 경기: ${result.length}개`);
  console.log(`  - 참가한 선수: ${normalized.filter(p => counts[p.id] > 0).length}명 / ${normalized.length}명`);
  
  // 경기 수 부족 경고
  if (result.length < targetMatches) {
    console.error(`❌ 치명적: 목표 경기 수 미달! ${result.length}개 / ${targetMatches}개`);
    console.error(`   부족한 경기: ${targetMatches - result.length}개`);
  }
  
  // 경기 수 분포
  const distribution: Record<number, number> = {};
  normalized.forEach(p => {
    const count = counts[p.id] || 0;
    distribution[count] = (distribution[count] || 0) + 1;
  });
  console.log('  - 경기 수 분포:', distribution);
  
  if (zeroGames.length > 0) {
    console.error(`❌ 치명적: ${zeroGames.length}명이 경기에 한 번도 참여하지 못함!`);
    console.error(`   선수: ${zeroGames.map(p => `${p.name}(${p.skill_level})`).join(', ')}`);
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
