import { Player, Match, Team } from '@/types';
import { shuffle, getLevelGroup, getTeamScore, getTeamMatchScore, reorderMatchesToAvoidConsecutive, MAX_TEAM_SCORE_DIFF } from './match-helpers';

export function createRandomBalancedDoublesMatches(players: Player[], numberOfCourts: number, minGamesPerPlayer = 1): Match[] {
  if (!Array.isArray(players) || players.length < 4 || numberOfCourts <= 0) return [];

  const counts: Record<string, number> = {};
  players.forEach(p => { counts[p.id] = 0; });
  const result: Match[] = [];
  const totalPlayers = players.length;
  const targetPlayerSlots = totalPlayers * minGamesPerPlayer;
  const targetMatches = Math.ceil(targetPlayerSlots / 4);
  
  console.log(`🎲 랜덤 경기 생성 시작: ${totalPlayers}명, 목표 ${targetMatches}경기`);

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
  const maxAttempts = Math.max(20, players.length * minGamesPerPlayer * 3);
  const needsMore = () => players.some(p => counts[p.id] < minGamesPerPlayer);
  let stalled = 0;
  const maxStalled = 5;
  
  // Hard-cap by targetMatches to avoid runaway growth; coverage is handled by a swap pass later
  while (result.length < targetMatches && attempts < maxAttempts && stalled < maxStalled) {
    // shuffle but favor players with lower counts by sorting then shuffling chunks
    const pool = shuffle([...players].sort((a, b) => counts[a.id] - counts[b.id]));
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

    const teamWithScore = teams.map(t => ({ team: t, score: getTeamScore(t) })).sort((a, b) => a.score - b.score);
  const before = result.length;
  let made = 0;
  const remainingSlots = Math.max(0, targetMatches - result.length);
  const allowedThisRound = Math.min(numberOfCourts, remainingSlots);
    const usedTeamIdx = new Set<number>();
  for (let i = 0; i < teamWithScore.length && made < allowedThisRound; i++) {
      if (usedTeamIdx.has(i)) continue;
      const t1 = teamWithScore[i];
      // find best partner with diff 0 or 1
      let pickedIdx = -1;
      for (let j = i + 1; j < teamWithScore.length; j++) {
        if (usedTeamIdx.has(j)) continue;
        const t2 = teamWithScore[j];
  const diff = Math.abs(t1.score - t2.score);
  if (diff <= MAX_TEAM_SCORE_DIFF) { pickedIdx = j; break; }
      }
      if (pickedIdx === -1) continue; // skip if no suitable opponent; try next i
      const t2 = teamWithScore[pickedIdx];
  const match: Match = { id: `match-rand-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, team1: t1.team, team2: t2.team, court: made + 1 };
  // ensure we don't exceed global targetMatches
  if (result.length >= targetMatches) break;
  result.push(match);
      counts[t1.team.player1.id]++; counts[t1.team.player2.id]++; counts[t2.team.player1.id]++; counts[t2.team.player2.id]++;
      usedTeamIdx.add(i); usedTeamIdx.add(pickedIdx);
      made += 1;
    }
    attempts += 1;
    stalled = result.length === before ? stalled + 1 : 0;
  }

  // 🚨 최우선: 0회 경기 선수를 절대 남기지 않음 (단, targetMatches 초과 금지)
  let zeroAttempts = 0;
  const maxZeroAttempts = 20;
  while (result.length < targetMatches && zeroAttempts < maxZeroAttempts) {
    const zeroNow = players.filter(p => counts[p.id] === 0);
    if (zeroNow.length === 0) break;
    
    console.warn(`⚠️ 랜덤 경기 - 0회 경기 선수 발견: ${zeroNow.length}명`);
    console.warn(`   선수: ${zeroNow.map(p => `${p.name}(${p.skill_level})`).join(', ')}`);
    
    // 0회 선수 중 4명 선택
    const picks: Player[] = [];
    for (const p of zeroNow) {
      if (picks.length < 4) picks.push(p);
    }
    
    // 4명 미만이면 경기 수 적은 선수로 보충
    if (picks.length < 4) {
      const fillers = [...players]
        .filter(p => !picks.find(x => x.id === p.id))
        .sort((a, b) => counts[a.id] - counts[b.id]);
      for (const p of fillers) {
        if (picks.length < 4) picks.push(p);
      }
    }
    
    if (picks.length < 4) {
      console.error('❌ 랜덤 경기 - 4명 구성 실패, 중단');
      break;
    }
    
    const pairing = bestBalancedPairs(picks);
    if (!pairing) {
      console.error('❌ 랜덤 경기 - 팀 페어링 실패');
      zeroAttempts++;
      continue;
    }
    
    const t1 = pairing.t1;
    const t2 = pairing.t2;
    
    result.push({ 
      id: `match-rand-zero-cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, 
      team1: t1, 
      team2: t2, 
      court: (result.length % numberOfCourts) + 1 
    });
    
    [t1.player1.id, t1.player2.id, t2.player1.id, t2.player2.id].forEach(id => {
      counts[id] = (counts[id] || 0) + 1;
    });
    
    zeroAttempts++;
  }

  // Final coverage (swap-based): ensure everyone gets at least minGames without increasing match count
  const getIds = (m: Match) => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id];
  const isInMatch = (m: Match, pid: string) => getIds(m).includes(pid);
  const missing = players.filter(p => counts[p.id] < minGamesPerPlayer);
  
  if (missing.length > 0 && result.length > 0) {
    // Precompute slots: [matchIndex, team, slotKey]
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
      // clone current teams to test balance
      const t1 = { player1: m.team1.player1, player2: m.team1.player2 } as Team;
      const t2 = { player1: m.team2.player1, player2: m.team2.player2 } as Team;
      if (slot.team === 1) {
        if (slot.pos === 1) t1.player1 = newPlayer; else t1.player2 = newPlayer;
      } else {
        if (slot.pos === 1) t2.player1 = newPlayer; else t2.player2 = newPlayer;
      }
  const diff = Math.abs(getTeamScore(t1) - getTeamScore(t2));
  if (diff > MAX_TEAM_SCORE_DIFF) return false;
      // commit swap
      if (slot.team === 1) {
        if (slot.pos === 1) m.team1.player1 = newPlayer; else m.team1.player2 = newPlayer;
      } else {
        if (slot.pos === 1) m.team2.player1 = newPlayer; else m.team2.player2 = newPlayer;
      }
      counts[decId] = Math.max(0, (counts[decId] || 0) - 1);
      counts[newPlayer.id] = (counts[newPlayer.id] || 0) + 1;
      return true;
    };

    // Greedy swap-in for each missing player
    for (const p of missing) {
      if (counts[p.id] >= minGamesPerPlayer) continue;
      let swapped = false;
      const slots = collectSlots()
        .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0)); // prefer replacing high-count players
      for (const s of slots) {
        if ((counts[s.id] || 0) <= minGamesPerPlayer) continue; // don't take from a min-only player
        const m = result[s.mi];
        if (isInMatch(m, p.id)) continue; // avoid duplicate in same match
        if (replaceInMatchIfBalanced(s, p)) { swapped = true; break; }
      }
      // If no high-count slot found, allow taking from equal-count but keep unique-in-match
      if (!swapped) {
        const slots2 = collectSlots();
        for (const s of slots2) {
          const m = result[s.mi];
          if (isInMatch(m, p.id)) continue;
          if (replaceInMatchIfBalanced(s, p)) { swapped = true; break; }
        }
      }
    }
  }

  // 🚨 중요: targetMatches에 도달하지 못한 경우 추가 경기 생성 (필수!)
  if (result.length < targetMatches) {
    console.warn(`⚠️ 랜덤 경기 - 목표 미달: ${result.length}개 / ${targetMatches}개, 추가 경기 생성 중...`);
    let attemptsAdd = 0;
    const maxAttemptsAdd = Math.max(50, (targetMatches - result.length) * 10);
    
    while (result.length < targetMatches && attemptsAdd < maxAttemptsAdd) {
      // 경기 수가 적은 선수 우선 선택
      const pool = [...players].sort((a, b) => {
        const countDiff = (counts[a.id] || 0) - (counts[b.id] || 0);
        if (countDiff !== 0) return countDiff;
        return Math.random() - 0.5; // 같은 경기 수면 랜덤
      });
      
      const picks: Player[] = [];
      for (const p of pool) { 
        if (picks.length < 4 && !picks.find(x => x.id === p.id)) {
          picks.push(p);
        }
      }
      
      if (picks.length < 4) {
        console.error(`❌ 랜덤 경기 - 4명 구성 실패 (현재 ${picks.length}명), 중단`);
        break;
      }
      
      const pairing = bestBalancedPairs(picks);
      if (!pairing) {
        console.error('❌ 랜덤 경기 - 팀 페어링 실패');
        attemptsAdd++;
        continue;
      }
      
      const match: Match = { 
        id: `match-rand-fill-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, 
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
    console.warn(`⚠️ 랜덤 경기 - 경기 수 초과 감지: ${result.length}개 → ${targetMatches}개로 조정`);
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
  const finalMissing = players.filter(p => counts[p.id] < minGamesPerPlayer);
  const zeroGames = players.filter(p => counts[p.id] === 0);
  
  console.log('✅ 랜덤 경기 생성 완료:');
  console.log(`  - 목표 경기: ${targetMatches}개`);
  console.log(`  - 생성된 경기: ${result.length}개`);
  console.log(`  - 참가한 선수: ${players.filter(p => counts[p.id] > 0).length}명 / ${players.length}명`);
  
  // 경기 수 부족 경고
  if (result.length < targetMatches) {
    console.error(`❌ 치명적: 목표 경기 수 미달! ${result.length}개 / ${targetMatches}개`);
    console.error(`   부족한 경기: ${targetMatches - result.length}개`);
  }
  
  // 경기 수 분포
  const distribution: Record<number, number> = {};
  players.forEach(p => {
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

  return reorderMatchesToAvoidConsecutive(result);
}
