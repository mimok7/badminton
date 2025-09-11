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

  let attempts = 0;
  const maxAttempts = Math.max(20, players.length * minGamesPerPlayer * 3);
  const needsMore = () => players.some(p => counts[p.id] < minGamesPerPlayer);
  let stalled = 0;
  // Hard-cap by targetMatches to avoid runaway growth; coverage is handled by a swap pass later
  while (result.length < targetMatches && attempts < maxAttempts) {
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

  // Final coverage (swap-based): ensure everyone gets at least minGames without increasing match count
  const getIds = (m: Match) => [m.team1.player1.id, m.team1.player2.id, m.team2.player1.id, m.team2.player2.id];
  const isInMatch = (m: Match, pid: string) => getIds(m).includes(pid);
  const missing = players.filter(p => counts[p.id] < minGamesPerPlayer);
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

  // If result length is less than targetMatches, try to create additional matches using lowest-count players
  const needToAdd = targetMatches - result.length;
  if (needToAdd > 0) {
    // repeatedly pick 4 lowest-count players and form best-balanced pairs until reach targetMatches2
    let attemptsAdd = 0;
  while (result.length < targetMatches && attemptsAdd < 50) {
      const pool = [...players].sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));
      const picks: Player[] = [];
      for (const p of pool) { if (picks.length < 4 && !picks.find(x => x.id === p.id)) picks.push(p); }
      if (picks.length < 4) break;
      const pairing = bestBalancedPairs(picks);
      if (!pairing) break;
      const match: Match = { id: `match-rand-fill-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, team1: pairing.t1, team2: pairing.t2, court: (result.length % numberOfCourts) + 1 };
      result.push(match);
      counts[pairing.t1.player1.id]++; counts[pairing.t1.player2.id]++; counts[pairing.t2.player1.id]++; counts[pairing.t2.player2.id]++;
      attemptsAdd += 1;
    }
  }

  return reorderMatchesToAvoidConsecutive(result);
}
