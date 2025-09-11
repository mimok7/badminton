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
  const targetPlayerSlots = totalPlayers * minGamesPerPlayer;
  const targetMatches = Math.ceil(targetPlayerSlots / 4);

  let attempts = 0;
  const maxAttempts = Math.max(20, players.length * minGamesPerPlayer * 6);
  const needsMore = () => players.some(p => counts[p.id] < minGamesPerPlayer);
  let stalled = 0;
  while (result.length < targetMatches && attempts < maxAttempts) {
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
  const remainingSlots = Math.max(0, targetMatches - result.length);
  const allowedThisRound = Math.min(numberOfCourts, remainingSlots);

  for (let i = 0; i < mixedCandidates.length && court <= allowedThisRound; i++) {
      const t1 = mixedCandidates[i].team;
      if (used.has(t1.player1.id) || used.has(t1.player2.id)) continue;

      const cands: { team: Team; score: number; ms: number }[] = [];
      for (let j = i + 1; j < mixedCandidates.length; j++) {
        const t2 = mixedCandidates[j].team;
        if (used.has(t2.player1.id) || used.has(t2.player2.id)) continue;
        if (t1.player1.id === t2.player1.id || t1.player1.id === t2.player2.id || t1.player2.id === t2.player1.id || t1.player2.id === t2.player2.id) continue;
  const ms = getTeamMatchScore(t1, t2);
  const diff = Math.abs(getTeamScore(t1) - getTeamScore(t2));
  // require balanced teams: score diff <= MAX_TEAM_SCORE_DIFF
  if (ms <= 6 && diff <= MAX_TEAM_SCORE_DIFF) cands.push({ team: t2, score: getTeamScore(t2), ms });
      }
      if (cands.length > 0) {
        cands.sort((a, b) => a.ms - b.ms);
        const pick = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
  const match = { id: `match-mixed-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, team1: t1, team2: pick.team, court: court++ };
  if (result.length >= targetMatches) break;
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
          const diff = Math.abs(getTeamScore(t1) - getTeamScore(t2));
          if (ms <= 6 && diff <= MAX_TEAM_SCORE_DIFF) sameCands.push({ team: t2, ms });
        }
        if (sameCands.length > 0) {
          sameCands.sort((a, b) => a.ms - b.ms);
          const pick2 = sameCands[0];
          const match = { id: `match-mixed-fallback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, team1: t1, team2: pick2.team, court: court++ };
          if (result.length >= targetMatches) break;
          matches.push(match);
          [t1.player1.id, t1.player2.id, pick2.team.player1.id, pick2.team.player2.id].forEach(id => used.add(id));
          counts[t1.player1.id]++; counts[t1.player2.id]++; counts[pick2.team.player1.id]++; counts[pick2.team.player2.id]++;
        }
      }
    }

    // append matches from this attempt (but don't exceed target)
    for (const m of matches) {
      if (result.length >= targetMatches) break;
      result.push(m);
    }

    // check if everyone reached minGamesPerPlayer
    attempts += 1;
    stalled = matches.length === 0 ? stalled + 1 : 0;
  }

  // Final coverage: ensure every player gets at least minGames
  let guard = 0;
  // Final coverage: use swaps first; only add new matches if result.length < targetMatches
  while (players.some(p => counts[p.id] < minGamesPerPlayer) && guard < 50) {
    const needers = players.filter(p => counts[p.id] < minGamesPerPlayer).sort((a, b) => counts[a.id] - counts[b.id]);
    const picks: Player[] = [] as any;
    for (const p of needers) { if (picks.length < 4 && !picks.find(x => x.id === p.id)) picks.push(p); }
    if (picks.length < 4) {
      const fillers = [...players].sort((a, b) => counts[a.id] - counts[b.id]).filter(p => !picks.find(x => x.id === p.id));
      for (const p of fillers) { if (picks.length < 4) picks.push(p); }
    }
    if (picks.length < 4) break;
    const malesP = picks.filter(isMale);
    const femalesP = picks.filter(isFemale);
    let t1: Team | null = null;
    let t2: Team | null = null;
    if (malesP.length >= 2 && femalesP.length >= 2) {
      t1 = { player1: malesP[0], player2: femalesP[femalesP.length - 1] };
      t2 = { player1: femalesP[0], player2: malesP[malesP.length - 1] };
    }
  if (!t1 || !t2) {
      // fallback same-sex
      const byCounts = [...picks];
      // choose pairing with best balance (team score diff <= 1 preferred)
      const candidates: [Team, Team][] = [
        [ { player1: byCounts[0], player2: byCounts[1] }, { player1: byCounts[2], player2: byCounts[3] } ],
        [ { player1: byCounts[0], player2: byCounts[2] }, { player1: byCounts[1], player2: byCounts[3] } ],
        [ { player1: byCounts[0], player2: byCounts[3] }, { player1: byCounts[1], player2: byCounts[2] } ],
      ];
      let best: { t1: Team; t2: Team } | null = null;
      let bestDiff = Number.POSITIVE_INFINITY;
        for (const [a, b] of candidates) {
        const diff = Math.abs(getTeamScore(a) - getTeamScore(b));
        if (diff <= MAX_TEAM_SCORE_DIFF) { best = { t1: a, t2: b }; break; }
        if (diff < bestDiff) { bestDiff = diff; best = { t1: a, t2: b }; }
      }
      t1 = best!.t1; t2 = best!.t2;
    }
    if (result.length < targetMatches) {
      result.push({ id: `match-mixed-cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, team1: t1!, team2: t2!, court: (result.length % numberOfCourts) + 1 });
      [t1!.player1.id, t1!.player2.id, t2!.player1.id, t2!.player2.id].forEach(id => counts[id] = (counts[id] || 0) + 1);
    } else {
      // perform swap-based replacements into existing matches to include missing players without increasing match count
      const missing = players.filter(p => counts[p.id] < minGamesPerPlayer);
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
        if (isInMatch(m, newPlayer.id)) return false;
        const diff = Math.abs(getTeamScore(t1c) - getTeamScore(t2c));
        if (diff > MAX_TEAM_SCORE_DIFF) return false;
        if (slot.team === 1) {
          if (slot.pos === 1) m.team1.player1 = newPlayer; else m.team1.player2 = newPlayer;
        } else {
          if (slot.pos === 1) m.team2.player1 = newPlayer; else m.team2.player2 = newPlayer;
        }
        counts[decId] = Math.max(0, (counts[decId] || 0) - 1);
        counts[newPlayer.id] = (counts[newPlayer.id] || 0) + 1;
        return true;
      };
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

  return reorderMatchesToAvoidConsecutive(result);
}
