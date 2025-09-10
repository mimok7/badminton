import { Player, Match, Team } from '@/types';
import { shuffle, getLevelGroup, getTeamScore, getTeamMatchScore, reorderMatchesToAvoidConsecutive } from './match-helpers';

export function createRandomBalancedDoublesMatches(players: Player[], numberOfCourts: number, minGamesPerPlayer = 1): Match[] {
  if (!Array.isArray(players) || players.length < 4 || numberOfCourts <= 0) return [];

  const counts: Record<string, number> = {};
  players.forEach(p => { counts[p.id] = 0; });
  const result: Match[] = [];
  const totalPlayers = players.length;
  const targetPlayerSlots = totalPlayers * minGamesPerPlayer;
  const targetMatches = Math.ceil(targetPlayerSlots / 4);

  let attempts = 0;
  const maxAttempts = Math.max(20, players.length * minGamesPerPlayer * 6);
  const needsMore = () => players.some(p => counts[p.id] < minGamesPerPlayer);
  let stalled = 0;
  while ((result.length < targetMatches || needsMore()) && attempts < maxAttempts) {
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
    for (let i = 0; i + 1 < teamWithScore.length && made < numberOfCourts; i += 2) {
      const t1 = teamWithScore[i].team;
      const t2 = teamWithScore[i + 1].team;
      const match: Match = { id: `match-rand-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, team1: t1, team2: t2, court: made + 1 };
      result.push(match);
      counts[t1.player1.id]++; counts[t1.player2.id]++; counts[t2.player1.id]++; counts[t2.player2.id]++;
      made += 1;
    }
    attempts += 1;
    stalled = result.length === before ? stalled + 1 : 0;
  }

  // Greedy final inclusion if some players still below target
  let guard = 0;
  while (players.some(p => counts[p.id] < minGamesPerPlayer) && guard < 20) {
    const four = [...players].sort((a, b) => counts[a.id] - counts[b.id]).slice(0, 4);
    if (four.length < 4) break;
    // random but maintain balance by alternating
    const pairA: Team = { player1: four[0], player2: four[3] };
    const pairB: Team = { player1: four[1], player2: four[2] };
    result.push({ id: `match-rand-greedy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, team1: pairA, team2: pairB, court: (result.length % numberOfCourts) + 1 });
    [pairA.player1.id, pairA.player2.id, pairB.player1.id, pairB.player2.id].forEach(id => counts[id] = (counts[id] || 0) + 1);
    guard += 1;
  }

  return reorderMatchesToAvoidConsecutive(result);
}
