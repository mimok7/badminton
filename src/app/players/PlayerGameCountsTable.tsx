import { Player, Match } from '@/types';

interface PlayerGameCountsTableProps {
  todayPlayers: Player[];
  playerGameCounts: Record<string, number>;
  myUserId: string | null;
  matches: Match[]; // 경기 정보 추가
}

interface TeamInfo {
  teamMembers: string;
  opponentMembers: string;
}

const PlayerGameCountsTable: React.FC<PlayerGameCountsTableProps> = ({ todayPlayers, playerGameCounts, myUserId, matches }) => {
  // 플레이어 ID로 팀 정보(팀원, 상대팀)를 찾는 헬퍼 함수
  const getTeamInfo = (playerId: string): TeamInfo => {
    const match = matches.find(m =>
      m.team1.player1.id === playerId || m.team1.player2.id === playerId ||
      m.team2.player1.id === playerId || m.team2.player2.id === playerId
    );

    if (match) {
      let team, opponent;
      if (match.team1.player1.id === playerId || match.team1.player2.id === playerId) {
        team = match.team1;
        opponent = match.team2;
      } else {
        team = match.team2;
        opponent = match.team1;
      }

      const teamMembers = `${team.player1.name}, ${team.player2.name}`;
      const opponentMembers = `${opponent.player1.name}, ${opponent.player2.name}`;

      return { teamMembers, opponentMembers };
    }

    return { teamMembers: "", opponentMembers: "" }; // 매칭 정보가 없는 경우 빈 문자열 반환
  };

  return (

    <div className="mb-4">
      <h4 className="font-semibold mb-1">회원별 게임 수</h4>
      <table className="w-full border text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="border px-2 py-1">이름</th>
            <th className="border px-2 py-1">우리 팀</th>
            <th className="border px-2 py-1">상대 팀</th>
            <th className="border px-2 py-1">게임 수</th>
          </tr>
        </thead>
        <tbody>
          {todayPlayers.map((p) => (
            <tr key={p.id} className={myUserId === p.id ? "font-bold text-blue-700" : ""}>
              <td className="border px-2 py-1">{p.name}{myUserId === p.id && <span className="ml-1 text-xs text-blue-500">(본인)</span>}</td>
              <td className="border px-2 py-1 text-center">{getTeamInfo(p.id).teamMembers}</td>
              <td className="border px-2 py-1 text-center">{getTeamInfo(p.id).opponentMembers}</td>
              <td className="border px-2 py-1 text-center">{playerGameCounts[p.id] || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PlayerGameCountsTable;