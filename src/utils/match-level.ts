import { Player, Match, Team } from '@/types';
import { getTeamScore, getTeamFairnessScore, getTeamMatchScore, jitter, getMinimumMatchCount, countUniquePlayersInMatches, reorderMatchesToAvoidConsecutive } from './match-helpers';

export function createBalancedDoublesMatches(players: Player[], numberOfCourts: number, minGamesPerPlayer = 1): Match[] {
  if (!Array.isArray(players) || players.length < 4 || numberOfCourts <= 0) return [];

  const normalized = players.map(p => ({ ...p, skill_level: (p.skill_level || 'E2').toUpperCase() }));

  const buildPossibleTeams = (pool: Player[]): { team: Team; score: number; fairness: number }[] => {
    const teams: { team: Team; score: number; fairness: number }[] = [];
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const team: Team = { player1: pool[i], player2: pool[j] };
        teams.push({ team, score: getTeamScore(team), fairness: getTeamFairnessScore(team) });
      }
    }
  // prefer teams composed of players who have been used less (we'll compute priority lightly by fairness+score)
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
    const possible = buildPossibleTeams(pool);
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
        if (diff > 4) continue;
        candidates.push({ team: t2.team, score: t2.score, diff, index: j });
      }
      if (candidates.length > 0) {
        // prefer opponents where combined players have lower usage (handled implicitly by ordering in possible)
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

  // Determine how many matches we should aim to create so distribution is even
  const totalPlayers = normalized.length;
  const targetPlayerSlots = totalPlayers * minGamesPerPlayer; // desired player-participations
  const targetMatches = Math.ceil(targetPlayerSlots / 4);

  let attempts = 0;
  const maxAttempts = Math.max(20, players.length * minGamesPerPlayer * 6);
  const needsMore = () => normalized.some(p => counts[p.id] < minGamesPerPlayer);
  let stalled = 0;
  while ((result.length < targetMatches || needsMore()) && attempts < maxAttempts) {
    // pool prefers players who still need matches; if too few, include everyone but ordering keeps low-count first
    let needPlayers = normalized.filter(p => counts[p.id] < minGamesPerPlayer);
    if (needPlayers.length < 4) {
      // include all players as fillers, but sort by counts ascending so low-use players are prioritized
      needPlayers = [...normalized].sort((a, b) => counts[a.id] - counts[b.id]);
    }
    const before = result.length;
    const { matches: round } = createRound(needPlayers, numberOfCourts);
    if (!round || round.length === 0) {
      attempts += 1;
      stalled += 1;
      if (stalled >= 3) break; // avoid infinite loops when no progress is possible
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

  // If still not everyone satisfied, try a best-effort final pass filling with players who have lower counts
  if (normalized.some(p => counts[p.id] < minGamesPerPlayer)) {
    // compute players sorted by counts ascending and repeatedly try to make matches until we cannot
    let remaining = [...normalized].sort((a, b) => counts[a.id] - counts[b.id]);
    while (remaining.length >= 4 && result.length < targetMatches) {
      const { matches: round, used } = createRound(remaining, numberOfCourts);
      if (round.length === 0) break;
      for (const m of round) {
        if (result.length >= targetMatches) break;
        result.push(m);
        counts[m.team1.player1.id]++; counts[m.team1.player2.id]++; counts[m.team2.player1.id]++; counts[m.team2.player2.id]++;
      }
      remaining = remaining.filter(p => !used.has(p.id));
    }
  }

  // Greedy final inclusion: if some players still below target, create extra matches using the 4 lowest-count players repeatedly
  const skillOf = (p: Player) => getTeamScore({ player1: p, player2: p });
  let guard = 0;
  while (normalized.some(p => counts[p.id] < minGamesPerPlayer) && guard < 20) {
    const four = [...normalized].sort((a, b) => counts[a.id] - counts[b.id] || skillOf(a) - skillOf(b)).slice(0, 4);
    if (four.length < 4) break;
    // pair to balance: sort by skill and pair extremes
    const bySkill = [...four].sort((a, b) => skillOf(a) - skillOf(b));
    const t1: Team = { player1: bySkill[0], player2: bySkill[3] };
    const t2: Team = { player1: bySkill[1], player2: bySkill[2] };
    result.push({ id: `match-balanced-greedy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, team1: t1, team2: t2, court: (result.length % numberOfCourts) + 1 });
    [t1.player1.id, t1.player2.id, t2.player1.id, t2.player2.id].forEach(id => counts[id] = (counts[id] || 0) + 1);
    guard += 1;
  }

  return reorderMatchesToAvoidConsecutive(result);
}
