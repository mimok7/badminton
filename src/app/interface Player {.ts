interface Player {
  id: string;
  name: string;
  // 추후 급수, 성별 등 추가 가능
}

interface Team {
  player1: Player;
  player2: Player;
}

interface Match {
  court: number;
  team1: Team;
  team2: Team;
}

/**
 * 선수를 랜덤으로 섞는 함수 (Fisher-Yates Shuffle 알고리즘)
 * @param array - 섞을 배열
 */
function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

/**
 * 참가 선수들과 코트 수를 기반으로 랜덤 복식 경기를 생성합니다.
 * @param participants - 경기에 참가하는 선수 목록
 * @param numberOfCourts - 사용 가능한 코트 수
 * @returns 생성된 경기 목록
 */
export function createRandomMatches(participants: Player[], numberOfCourts: number): Match[] {
  // 참가자가 4명 미만이거나 코트가 없으면 경기를 생성할 수 없음
  if (participants.length < 4 || numberOfCourts === 0) {
    return [];
  }

  const shuffledPlayers = shuffle(participants);
  const teams: Team[] = [];

  // 2명씩 짝지어 팀 생성
  for (let i = 0; i < shuffledPlayers.length - 1; i += 2) {
    teams.push({ player1: shuffledPlayers[i], player2: shuffledPlayers[i + 1] });
  }

  const matches: Match[] = [];
  let courtIndex = 1;

  // 2팀씩 짝지어 경기 생성
  for (let i = 0; i < teams.length - 1; i += 2) {
    if (courtIndex > numberOfCourts) break; // 사용 가능한 코트가 없으면 중단

    matches.push({
      court: courtIndex,
      team1: teams[i],
      team2: teams[i + 1],
    });
    courtIndex++;
  }

  return matches;
}