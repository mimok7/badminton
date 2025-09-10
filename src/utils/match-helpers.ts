import { Player, Team, Match } from '@/types';

// 레벨별 점수 매핑
export const LEVEL_SCORES: Record<string, number> = {
  // Lowest to highest: E2(1), E1(2), D2(3), D1(4), C2(5), C1(6), B2(7), B1(8), A2(9), A1(10)
  E2: 1,
  E1: 2,
  D2: 3,
  D1: 4,
  C2: 5,
  C1: 6,
  B2: 7,
  B1: 8,
  A2: 9,
  A1: 10,
  // Fallback short labels map to their nearest equivalent
  A: 10,
  B: 8,
  C: 6,
  D: 4,
  E: 2,
  N: 1,
};

export function getLevelScore(level?: string): number {
  const lv = (level || 'E2').toUpperCase();
  return LEVEL_SCORES[lv] ?? 1;
}

export function getPlayerLevelScore(player: Player): number {
  return getLevelScore(player.skill_level);
}

export function getTeamScore(team: Team): number {
  return getPlayerLevelScore(team.player1) + getPlayerLevelScore(team.player2);
}

export function getTeamAverageScore(team: Team): number {
  return getTeamScore(team) / 2;
}

export function getLevelGroup(level?: string): string {
  const lv = (level || 'E2').toUpperCase();
  return lv.charAt(0);
}

export function getTeamBalance(team: Team): number {
  return Math.abs(getPlayerLevelScore(team.player1) - getPlayerLevelScore(team.player2));
}

export function getTeamMatchScore(team1: Team, team2: Team): number {
  const scoreDifference = Math.abs(getTeamScore(team1) - getTeamScore(team2));
  const balanceDifference = Math.abs(getTeamBalance(team1) - getTeamBalance(team2));
  const averageDifference = Math.abs(getTeamAverageScore(team1) - getTeamAverageScore(team2));
  return scoreDifference * 0.7 + balanceDifference * 0.2 + averageDifference * 0.1;
}

export function getTeamFairnessScore(team: Team): number {
  const totalScore = getTeamScore(team);
  const balance = getTeamBalance(team);
  return totalScore - balance * 2;
}

export function jitter(scale = 0.35): number {
  return (Math.random() * 2 - 1) * scale;
}

export function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

export function getMinimumMatchCount(playersOrCount: Player[] | number): number {
  const n = Array.isArray(playersOrCount) ? playersOrCount.length : playersOrCount;
  return Math.ceil(Math.max(0, n) / 4);
}

export function countUniquePlayersInMatches(matches: Match[]): number {
  const ids = new Set<string>();
  for (const m of matches) {
    ids.add(m.team1.player1.id);
    ids.add(m.team1.player2.id);
    ids.add(m.team2.player1.id);
    ids.add(m.team2.player2.id);
  }
  return ids.size;
}

function getMatchPlayerIds(match: Match): Set<string> {
  return new Set<string>([
    match.team1.player1.id,
    match.team1.player2.id,
    match.team2.player1.id,
    match.team2.player2.id,
  ]);
}

export function reorderMatchesToAvoidConsecutive(matches: Match[]): Match[] {
  if (!Array.isArray(matches) || matches.length <= 1) return matches;

  const arr = [...matches];
  const maxPasses = Math.min(5, arr.length);

  const intersects = (a: Match, b: Match) => {
    const A = getMatchPlayerIds(a);
    const B = getMatchPlayerIds(b);
    for (const id of A) if (B.has(id)) return true;
    return false;
  };

  let changed = false;
  for (let pass = 0; pass < maxPasses; pass++) {
    changed = false;
    for (let i = 0; i < arr.length - 1; i++) {
      if (!intersects(arr[i], arr[i + 1])) continue;
      let swapIndex = -1;
      for (let j = arr.length - 1; j > i + 1; j--) {
        if (!intersects(arr[i], arr[j])) {
          const prevOk = j - 1 === i ? true : !intersects(arr[j - 1], arr[i + 1]);
          const nextOk = j + 1 < arr.length ? !intersects(arr[j + 1], arr[j]) : true;
          if (prevOk && nextOk) {
            swapIndex = j;
            break;
          }
        }
      }
      if (swapIndex !== -1) {
        const tmp = arr[i + 1];
        arr[i + 1] = arr[swapIndex];
        arr[swapIndex] = tmp;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return arr;
}
