'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface TeamAssignment {
  id: string;
  round_number: number; // 회차
  player_name: string;
  team_type: 'racket' | 'shuttle'; // 라켓팀 또는 셔틀팀
  created_at: string;
}

interface RoundSummary {
  round: number;
  racket_team: string[];
  shuttle_team: string[];
  total_players: number;
}

export default function TeamManagementPage() {
  const supabase = createClientComponentClient();
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [todayPlayers, setTodayPlayers] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, 'racket' | 'shuttle'>>({});
  const [loading, setLoading] = useState(true);

  // 오늘 출석한 선수들 조회
  const fetchTodayPlayers = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      
      // 출석 데이터 조회
      const { data: attendanceData, error } = await supabase
        .from('attendances')
        .select('user_id, status')
        .eq('attended_at', today)
        .eq('status', 'present'); // 출석한 선수만
        
      if (error) {
        console.error('출석 데이터 조회 오류:', error);
        return;
      }
      
      if (!attendanceData || attendanceData.length === 0) {
        console.log('오늘 출석한 선수가 없습니다.');
        return;
      }
      
      // 프로필 정보 조회 (스킬 레벨 포함)
      const userIds = attendanceData.map(a => a.user_id);
      const { data: profilesData, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, full_name, skill_level')
        .in('id', userIds);
        
      if (profileError) {
        console.error('프로필 조회 오류:', profileError);
        return;
      }
      
      // 레벨 정보도 함께 가져오기
      const { data: levelData, error: levelError } = await supabase
        .from('level_info')
        .select('code, name');
        
      const levelMap: Record<string, string> = {};
      if (levelData) {
        levelData.forEach((level: any) => {
          if (level.code) {
            levelMap[level.code.toLowerCase()] = level.name || level.code.toUpperCase();
          }
        });
      }
      
      const playerNamesWithLevel = profilesData?.map(p => {
        const playerName = p.username || p.full_name || `선수-${p.id.substring(0, 4)}`;
        const skillLevel = p.skill_level ? String(p.skill_level).toLowerCase() : 'n';
        const levelCode = skillLevel.toUpperCase();
        return `${playerName}(${levelCode})`;
      }) || [];
      
      setTodayPlayers(playerNamesWithLevel);
    } catch (error) {
      console.error('선수 조회 중 오류:', error);
    }
  };

  // 기존 회차 데이터 조회
  const fetchRoundsData = async () => {
    try {
      // team_assignments 테이블이 없다면 생성 필요
      const { data, error } = await supabase
        .from('team_assignments')
        .select('*')
        .order('round_number', { ascending: true });
        
      if (error) {
        console.error('회차 데이터 조회 오류:', error);
        // 테이블이 없는 경우 빈 배열로 설정
        if (error.code === '42P01') {
          console.log('team_assignments 테이블이 없습니다. 수동으로 관리합니다.');
          setRounds([]);
          return;
        }
      }
      
      if (data) {
        // 회차별로 그룹화
        const roundsMap: Record<number, RoundSummary> = {};
        
        data.forEach((assignment: TeamAssignment) => {
          if (!roundsMap[assignment.round_number]) {
            roundsMap[assignment.round_number] = {
              round: assignment.round_number,
              racket_team: [],
              shuttle_team: [],
              total_players: 0
            };
          }
          
          if (assignment.team_type === 'racket') {
            roundsMap[assignment.round_number].racket_team.push(assignment.player_name);
          } else {
            roundsMap[assignment.round_number].shuttle_team.push(assignment.player_name);
          }
          roundsMap[assignment.round_number].total_players++;
        });
        
        const roundsArray = Object.values(roundsMap);
        setRounds(roundsArray);
        
        // 다음 회차 번호 설정
        const maxRound = Math.max(...roundsArray.map(r => r.round), 0);
        setCurrentRound(maxRound + 1);
      }
    } catch (error) {
      console.error('데이터 조회 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 팀 배정 저장
  const saveTeamAssignments = async () => {
    try {
      if (Object.keys(assignments).length === 0) {
        alert('팀 배정을 먼저 해주세요.');
        return;
      }
      
      const assignmentData = Object.entries(assignments).map(([playerName, teamType]) => ({
        round_number: currentRound,
        player_name: playerName,
        team_type: teamType,
        created_at: new Date().toISOString()
      }));
      
      // 로컬 스토리지에 저장 (DB 테이블이 없는 경우)
      const existingData = JSON.parse(localStorage.getItem('badminton_team_assignments') || '[]');
      const newData = [...existingData, ...assignmentData];
      localStorage.setItem('badminton_team_assignments', JSON.stringify(newData));
      
      // 상태 업데이트
      const racketPlayers = Object.entries(assignments)
        .filter(([_, team]) => team === 'racket')
        .map(([name, _]) => name);
      const shuttlePlayers = Object.entries(assignments)
        .filter(([_, team]) => team === 'shuttle')
        .map(([name, _]) => name);
        
      const newRound: RoundSummary = {
        round: currentRound,
        racket_team: racketPlayers,
        shuttle_team: shuttlePlayers,
        total_players: Object.keys(assignments).length
      };
      
      setRounds([...rounds, newRound]);
      setCurrentRound(currentRound + 1);
      setAssignments({});
      
      alert(`${currentRound}회차 팀 배정이 저장되었습니다.`);
    } catch (error) {
      console.error('저장 중 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  // 로컬 스토리지에서 데이터 불러오기
  const loadFromLocalStorage = () => {
    try {
      const data = JSON.parse(localStorage.getItem('badminton_team_assignments') || '[]');
      
      if (data.length === 0) {
        setRounds([]);
        return;
      }
      
      const roundsMap: Record<number, RoundSummary> = {};
      
      data.forEach((assignment: TeamAssignment) => {
        if (!roundsMap[assignment.round_number]) {
          roundsMap[assignment.round_number] = {
            round: assignment.round_number,
            racket_team: [],
            shuttle_team: [],
            total_players: 0
          };
        }
        
        if (assignment.team_type === 'racket') {
          roundsMap[assignment.round_number].racket_team.push(assignment.player_name);
        } else {
          roundsMap[assignment.round_number].shuttle_team.push(assignment.player_name);
        }
        roundsMap[assignment.round_number].total_players++;
      });
      
      const roundsArray = Object.values(roundsMap);
      setRounds(roundsArray);
      
      const maxRound = Math.max(...roundsArray.map(r => r.round), 0);
      setCurrentRound(maxRound + 1);
    } catch (error) {
      console.error('로컬 데이터 불러오기 오류:', error);
      setRounds([]);
    }
  };

  // 자동 팀 배정 (랜덤)
  const autoAssignTeams = () => {
    if (todayPlayers.length === 0) {
      alert('출석한 선수가 없습니다.');
      return;
    }
    
    const shuffled = [...todayPlayers].sort(() => Math.random() - 0.5);
    const half = Math.ceil(shuffled.length / 2);
    
    const newAssignments: Record<string, 'racket' | 'shuttle'> = {};
    
    shuffled.forEach((player, index) => {
      newAssignments[player] = index < half ? 'racket' : 'shuttle';
    });
    
    setAssignments(newAssignments);
  };

  // 팀 배정 변경
  const togglePlayerTeam = (playerName: string) => {
    setAssignments(prev => ({
      ...prev,
      [playerName]: prev[playerName] === 'racket' ? 'shuttle' : 'racket'
    }));
  };

  useEffect(() => {
    const initializeData = async () => {
      await fetchTodayPlayers();
      await fetchRoundsData();
      // DB에서 실패한 경우 로컬 스토리지에서 불러오기
      loadFromLocalStorage();
    };
    
    initializeData();
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">데이터 로딩 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8 text-center">회차별 라켓팀 / 셔틀팀 관리</h1>
      
      {/* 현재 출석자 및 팀 배정 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">
          {currentRound}회차 팀 배정 
          <span className="text-sm text-gray-600 ml-2">
            (출석자: {todayPlayers.length}명)
          </span>
        </h2>
        
        {todayPlayers.length === 0 ? (
          <p className="text-gray-500">오늘 출석한 선수가 없습니다.</p>
        ) : (
          <>
            <div className="flex gap-4 mb-4">
              <button
                onClick={autoAssignTeams}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
              >
                자동 배정
              </button>
              <button
                onClick={saveTeamAssignments}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
                disabled={Object.keys(assignments).length === 0}
              >
                배정 저장
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 라켓팀 */}
              <div className="border rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 text-blue-600">
                  🏸 라켓팀 ({Object.values(assignments).filter(t => t === 'racket').length}명)
                </h3>
                <div className="space-y-2">
                  {todayPlayers.map(player => (
                    <div 
                      key={player}
                      className={`p-2 rounded border cursor-pointer transition-colors ${
                        assignments[player] === 'racket' 
                          ? 'bg-blue-100 border-blue-300' 
                          : assignments[player] === 'shuttle'
                          ? 'bg-gray-100 border-gray-300'
                          : 'bg-white border-gray-200 hover:bg-blue-50'
                      }`}
                      onClick={() => togglePlayerTeam(player)}
                    >
                      {player}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* 셔틀팀 */}
              <div className="border rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 text-purple-600">
                  🏃‍♂️ 셔틀팀 ({Object.values(assignments).filter(t => t === 'shuttle').length}명)
                </h3>
                <div className="space-y-2">
                  {todayPlayers.map(player => (
                    <div 
                      key={player}
                      className={`p-2 rounded border cursor-pointer transition-colors ${
                        assignments[player] === 'shuttle' 
                          ? 'bg-purple-100 border-purple-300' 
                          : assignments[player] === 'racket'
                          ? 'bg-gray-100 border-gray-300'
                          : 'bg-white border-gray-200 hover:bg-purple-50'
                      }`}
                      onClick={() => togglePlayerTeam(player)}
                    >
                      {player}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* 회차별 히스토리 테이블 */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h2 className="text-xl font-semibold">회차별 팀 구성 현황</h2>
        </div>
        
        {rounds.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            아직 저장된 회차가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    회차
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    라켓팀 🏸
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    셔틀팀 🏃‍♂️
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    총 인원
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rounds.sort((a, b) => b.round - a.round).map((round) => (
                  <tr key={round.round} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {round.round}회차
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="flex flex-wrap gap-1">
                        {round.racket_team.map((player, index) => (
                          <span 
                            key={index}
                            className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                          >
                            {player}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {round.racket_team.length}명
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="flex flex-wrap gap-1">
                        {round.shuttle_team.map((player, index) => (
                          <span 
                            key={index}
                            className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded"
                          >
                            {player}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {round.shuttle_team.length}명
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {round.total_players}명
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
