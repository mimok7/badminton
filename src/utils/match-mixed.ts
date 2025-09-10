import { Player, Match, Team } from '@/types';
import { getTeamFairnessScore, getTeamMatchScore, getTeamScore, jitter, reorderMatchesToAvoidConsecutive } from './match-helpers';

const isMale = (p: Player) => (p.gender || '').toLowerCase() === 'm' || (p.gender || '').toLowerCase() === 'male' || (p.gender || '').toLowerCase() === 'man';
const isFemale = (p: Player) => (p.gender || '').toLowerCase() === 'f' || (p.gender || '').toLowerCase() === 'female' || (p.gender || '').toLowerCase() === 'woman' || (p.gender || '').toLowerCase() === 'w';

export function createMixedAndSameSexDoublesMatches(players: Player[], numberOfCourts: number, minGamesPerPlayer = 1): Match[] {
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
    // prefer males/females who have lower counts
    const males = players.filter(isMale).sort((a, b) => counts[a.id] - counts[b.id]);
    const females = players.filter(isFemale).sort((a, b) => counts[a.id] - counts[b.id]);

    const mixedCandidates: { team: Team; score: number; fairness: number }[] = [];
    for (const m of males) for (const f of females) {
      const t: Team = { player1: m, player2: f };
      mixedCandidates.push({ team: t, score: getTeamScore(t), fairness: getTeamFairnessScore(t) });
    }
    mixedCandidates.sort((a, b) => {
      const fa = b.fairness + jitter(0.2) - (a.fairness + jitter(0.2));
      if (Math.abs(fa) > 0.5) return fa;
      const sa = b.score + jitter(0.2) - (a.score + jitter(0.2));
      if (Math.abs(sa) > 0.5) return sa;
      return Math.random() < 0.5 ? -1 : 1;
    });

  const matches: Match[] = [];
  const used = new Set<string>();
  let court = 1;

    for (let i = 0; i < mixedCandidates.length && court <= numberOfCourts; i++) {
      const t1 = mixedCandidates[i].team;
      if (used.has(t1.player1.id) || used.has(t1.player2.id)) continue;

      const cands: { team: Team; score: number; ms: number }[] = [];
      for (let j = i + 1; j < mixedCandidates.length; j++) {
        const t2 = mixedCandidates[j].team;
        if (used.has(t2.player1.id) || used.has(t2.player2.id)) continue;
        if (t1.player1.id === t2.player1.id || t1.player1.id === t2.player2.id || t1.player2.id === t2.player1.id || t1.player2.id === t2.player2.id) continue;
        const ms = getTeamMatchScore(t1, t2);
        if (ms <= 6) cands.push({ team: t2, score: getTeamScore(t2), ms });
      }
      if (cands.length > 0) {
        cands.sort((a, b) => a.ms - b.ms);
        const pick = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
        const match = { id: `match-mixed-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, team1: t1, team2: pick.team, court: court++ };
        matches.push(match);
        [t1.player1.id, t1.player2.id, pick.team.player1.id, pick.team.player2.id].forEach(id => used.add(id));
        counts[t1.player1.id]++; counts[t1.player2.id]++; counts[pick.team.player1.id]++; counts[pick.team.player2.id]++;
      } else {
        // same-sex fallback to avoid excluding players
        // try to pair t1 with another same-sex team of similar score
        const pool = isMale(t1.player1) ? players.filter(isMale) : players.filter(isFemale);
        const sameCands: { team: Team; ms: number }[] = [];
        for (let x = 0; x < pool.length; x++) for (let y = x + 1; y < pool.length; y++) {
          const t2: Team = { player1: pool[x], player2: pool[y] };
          if (used.has(t2.player1.id) || used.has(t2.player2.id)) continue;
          if (t1.player1.id === t2.player1.id || t1.player1.id === t2.player2.id || t1.player2.id === t2.player1.id || t1.player2.id === t2.player2.id) continue;
          const ms = getTeamMatchScore(t1, t2);
          if (ms <= 6) sameCands.push({ team: t2, ms });
        }
        if (sameCands.length > 0) {
          sameCands.sort((a, b) => a.ms - b.ms);
          const pick2 = sameCands[0];
          const match = { id: `match-mixed-fallback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, team1: t1, team2: pick2.team, court: court++ };
          matches.push(match);
          [t1.player1.id, t1.player2.id, pick2.team.player1.id, pick2.team.player2.id].forEach(id => used.add(id));
          counts[t1.player1.id]++; counts[t1.player2.id]++; counts[pick2.team.player1.id]++; counts[pick2.team.player2.id]++;
        }
      }
    }

    // append matches from this attempt
    result.push(...matches);

    // check if everyone reached minGamesPerPlayer
    attempts += 1;
    stalled = matches.length === 0 ? stalled + 1 : 0;
  }

  // Greedy final inclusion if some players still below target
  let guard = 0;
  while (players.some(p => counts[p.id] < minGamesPerPlayer) && guard < 20) {
    const four = [...players].sort((a, b) => counts[a.id] - counts[b.id]).slice(0, 4);
    if (four.length < 4) break;
    // Try to form mixed first, else same-sex
    const males = four.filter(isMale);
    const females = four.filter(isFemale);
    let t1: Team | null = null;
    let t2: Team | null = null;
    if (males.length >= 1 && females.length >= 1) {
      // pair male+female by extremes
      const mSorted = males;
      const fSorted = females;
      if (mSorted.length >= 2 && fSorted.length >= 2) {
        t1 = { player1: mSorted[0], player2: fSorted[fSorted.length - 1] };
        t2 = { player1: fSorted[0], player2: mSorted[mSorted.length - 1] };
      }
    }
    if (!t1 || !t2) {
      // fallback make two same-sex teams by current order
      const byCounts = [...four];
      t1 = { player1: byCounts[0], player2: byCounts[3] };
      t2 = { player1: byCounts[1], player2: byCounts[2] };
    }
    result.push({ id: `match-mixed-greedy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, team1: t1!, team2: t2!, court: (result.length % numberOfCourts) + 1 });
    [t1!.player1.id, t1!.player2.id, t2!.player1.id, t2!.player2.id].forEach(id => counts[id] = (counts[id] || 0) + 1);
    guard += 1;
  }

  return reorderMatchesToAvoidConsecutive(result);
}
