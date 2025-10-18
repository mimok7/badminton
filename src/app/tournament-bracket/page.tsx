'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import AdminShell from '@/components/admin/AdminShell';

interface Player {
  name: string;
  level?: string;
}

interface Match {
  id?: string;
  tournament_id?: string;
  round: number;
  match_number: number;
  team1: string[];
  team2: string[];
  court: string;
  scheduled_time?: string;
  status: 'pending' | 'in_progress' | 'completed';
  score_team1?: number;
  score_team2?: number;
  winner?: 'team1' | 'team2' | 'draw';
}

interface Tournament {
  id: string;
  title: string;
  tournament_date: string;
  round_number: number;
  match_type: string;
  team_type: string;
  total_teams: number;
  matches_per_player: number;
  created_at: string;
}

interface TeamAssignment {
  id: string;
  round_number: number;
  assignment_date: string;
  title: string;
  team_type: '2teams' | '3teams' | '4teams' | 'pairs';
  racket_team?: string[];
  shuttle_team?: string[];
  team1?: string[];
  team2?: string[];
  team3?: string[];
  team4?: string[];
  pairs_data?: Record<string, string[]>;
}

export default function TournamentBracketPage() {
  const supabase = createClientComponentClient();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [availableTeams, setAvailableTeams] = useState<TeamAssignment[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamAssignment | null>(null);
  const [showPlayerAssignments, setShowPlayerAssignments] = useState(true);

  // 로컬 날짜 가져오기
  const getTodayLocal = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    fetchTournaments();
    fetchAvailableTeams();
  }, []);

  const fetchTournaments = async () => {
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('tournament_date', { ascending: false })
        .order('round_number', { ascending: false });

      if (error && error.code !== '42P01') throw error;

      setTournaments(data || []);
      if (data && data.length > 0) {
        handleSelectTournament(data[0]);
      }
    } catch (error) {
      console.error('대회 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMatches = async (tournamentId: string) => {
    try {
      const { data, error } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('match_number', { ascending: true });

      if (error) throw error;

      setMatches(data || []);
    } catch (error) {
      console.error('경기 조회 오류:', error);
    }
  };

  const handleSelectTournament = async (tournament: Tournament) => {
    setSelectedTournament(tournament);
    await fetchMatches(tournament.id);
  };

  const fetchAvailableTeams = async () => {
    try {
      const today = getTodayLocal();
      const { data, error } = await supabase
        .from('team_assignments')
        .select('*')
        .eq('assignment_date', today)
        .order('round_number', { ascending: false });

      if (error) throw error;
      setAvailableTeams(data || []);
    } catch (error) {
      console.error('팀 구성 조회 실패:', error);
    }
  };

  // 팀 구성 기반 경기 생성
  const generateMatchesFromTeam = async (teamAssignment: TeamAssignment, matchesPerPlayer: number, matchType: string) => {
    if (!teamAssignment) return [];

    // 팀 구성에서 선수 목록 추출
    const playerList: string[] = [];

    if (teamAssignment.team_type === 'pairs' && teamAssignment.pairs_data) {
      // 페어에서 선수 추출
      Object.values(teamAssignment.pairs_data).forEach(players => {
        playerList.push(...(Array.isArray(players) ? players : []));
      });
    } else if (teamAssignment.racket_team && teamAssignment.shuttle_team) {
      // 라켓팀과 셔틀팀에서 선수 추출
      playerList.push(...(Array.isArray(teamAssignment.racket_team) ? teamAssignment.racket_team : []));
      playerList.push(...(Array.isArray(teamAssignment.shuttle_team) ? teamAssignment.shuttle_team : []));
    }

    // 중복 제거 및 유효성 검사
    const uniquePlayers = [...new Set(playerList)].filter(p => p && typeof p === 'string').map(p => p.trim());

    if (uniquePlayers.length < 4) {
      console.warn('최소 4명의 선수가 필요합니다.');
      return [];
    }

    // 선수를 ExtendedPlayer로 변환
    const players = uniquePlayers.map((name, idx) => ({
      id: `player-${idx}-${Date.now()}`,
      name,
      skill_level: 'e2',
      skill_label: 'E2 (초급)',
      skill_code: 'e2',
      gender: 'mixed' as const
    }));

    // 경기 타입에 따라 경기 생성 함수 선택
    let generatedMatches: any[] = [];

    try {
      if (matchType === 'level_based') {
        const { createBalancedDoublesMatches } = await import('@/utils/match-utils');
        generatedMatches = createBalancedDoublesMatches(players, 4, 1);
      } else if (matchType === 'random') {
        const { createRandomBalancedDoublesMatches } = await import('@/utils/match-utils');
        generatedMatches = createRandomBalancedDoublesMatches(players, 4, 1);
      } else if (matchType === 'mixed_doubles') {
        const { createMixedAndSameSexDoublesMatches } = await import('@/utils/match-utils');
        generatedMatches = createMixedAndSameSexDoublesMatches(players, 4, 1);
      } else {
        // 기본: 랜덤
        const { createRandomBalancedDoublesMatches } = await import('@/utils/match-utils');
        generatedMatches = createRandomBalancedDoublesMatches(players, 4, 1);
      }
    } catch (e) {
      console.error('경기 생성 함수 로드 오류:', e);
      return [];
    }

    // 12회차로 나누어 배치
    const finalMatches: Match[] = [];
    const maxRounds = 12;
    let currentMatchNumber = 1;
    let roundIndex = 0;

    for (let round = 1; round <= maxRounds; round++) {
      // 각 회차에서 선수 수 / 4 개의 경기 생성
      const matchesPerRound = Math.ceil(uniquePlayers.length / 4);

      for (let i = 0; i < matchesPerRound; i++) {
        if (roundIndex >= generatedMatches.length) {
          // 생성된 경기가 부족하면 랜덤으로 새로운 경기 생성
          const shuffled = [...uniquePlayers].sort(() => Math.random() - 0.5);
          for (let j = 0; j < shuffled.length - 3; j += 4) {
            const group = shuffled.slice(j, j + 4);
            if (group.length !== 4) continue;

            const team1 = [group[0], group[1]];
            const team2 = [group[2], group[3]];
            const courtNumber = ((currentMatchNumber - 1) % 4) + 1;

            finalMatches.push({
              round: round,
              match_number: currentMatchNumber++,
              team1,
              team2,
              court: `Court ${courtNumber}`,
              status: 'pending' as const
            });
          }
          break;
        }

        const match = generatedMatches[roundIndex++];
        const courtNumber = ((currentMatchNumber - 1) % 4) + 1;

        finalMatches.push({
          round: round,
          match_number: currentMatchNumber++,
          team1: match.team1.map((p: any) => p.name || p),
          team2: match.team2.map((p: any) => p.name || p),
          court: `Court ${courtNumber}`,
          status: 'pending' as const
        });
      }
    }

    console.log('🏆 대회 경기 생성 완료:');
    console.log(`- 총 선수: ${uniquePlayers.length}명`);
    console.log(`- 경기 타입: ${matchType}`);
    console.log(`- 총 회차: ${maxRounds}회차`);
    console.log(`- 생성된 경기: ${finalMatches.length}개`);

    return finalMatches;
  };

  // 대회 생성 및 경기 저장
  const createTournamentWithMatches = async (matchesPerPlayer: number, matchType: string) => {
    if (!selectedTeam) {
      alert('팀 구성을 선택해주세요.');
      return;
    }

    try {
      const generatedMatches = await generateMatchesFromTeam(selectedTeam, matchesPerPlayer, matchType);
      
      if (generatedMatches.length === 0) {
        alert('생성할 경기가 없습니다.');
        return;
      }

      // 대회 생성
      const tournamentTitle = `${selectedTeam.title} ${matchType === 'level_based' ? '레벨별' : matchType === 'mixed_doubles' ? '혼복' : '랜덤'} 대회`;
      const { data: tournamentData, error: tournamentError } = await supabase
        .from('tournaments')
        .insert({
          title: tournamentTitle,
          tournament_date: selectedTeam.assignment_date,
          round_number: selectedTeam.round_number,
          match_type: matchType,
          team_assignment_id: selectedTeam.id,
          team_type: selectedTeam.team_type,
          total_teams: generatedMatches.length,
          matches_per_player: matchesPerPlayer
        })
        .select()
        .single();

      if (tournamentError) throw tournamentError;

      // 경기 저장
      const matchesToInsert = generatedMatches.map(match => ({
        ...match,
        tournament_id: tournamentData.id
      }));

      const { error: matchesError } = await supabase
        .from('tournament_matches')
        .insert(matchesToInsert);

      if (matchesError) throw matchesError;

      alert(`대회가 생성되었습니다! (${generatedMatches.length}개 경기)`);
      await fetchTournaments();
      setSelectedTeam(null);
    } catch (error) {
      console.error('대회 생성 오류:', error);
      alert('대회 생성 중 오류가 발생했습니다.');
    }
  };

  // 점수 업데이트 함수
  const updateMatchScore = async (matchId: string, scoreTeam1: number, scoreTeam2: number) => {
    try {
      const winner = scoreTeam1 > scoreTeam2 ? 'team1' : scoreTeam2 > scoreTeam1 ? 'team2' : 'draw';
      
      const { error } = await supabase
        .from('tournament_matches')
        .update({
          score_team1: scoreTeam1,
          score_team2: scoreTeam2,
          winner: winner,
          status: 'completed'
        })
        .eq('id', matchId);

      if (error) throw error;

      // 경기 목록 새로고침
      if (selectedTournament) {
        await fetchMatches(selectedTournament.id);
      }
      
      setEditingMatchId(null);
      alert('점수가 저장되었습니다!');
    } catch (error) {
      console.error('점수 저장 오류:', error);
      alert('점수 저장 중 오류가 발생했습니다.');
    }
  };

  // 선수별 경기 통계 계산
  const getPlayerStats = () => {
    const playerStats: Record<string, { matches: number; wins: number; losses: number; draws: number }> = {};

    matches.forEach((match) => {
      if (match.status !== 'completed') return;

      match.team1.forEach((player) => {
        if (!playerStats[player]) {
          playerStats[player] = { matches: 0, wins: 0, losses: 0, draws: 0 };
        }
        playerStats[player].matches++;
        if (match.winner === 'team1') playerStats[player].wins++;
        else if (match.winner === 'team2') playerStats[player].losses++;
        else playerStats[player].draws++;
      });

      match.team2.forEach((player) => {
        if (!playerStats[player]) {
          playerStats[player] = { matches: 0, wins: 0, losses: 0, draws: 0 };
        }
        playerStats[player].matches++;
        if (match.winner === 'team2') playerStats[player].wins++;
        else if (match.winner === 'team1') playerStats[player].losses++;
        else playerStats[player].draws++;
      });
    });

    return playerStats;
  };

  if (loading) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-xl text-gray-600">로딩 중...</div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <h1 className="text-3xl font-bold mb-6">🏆 대회 대진표</h1>

        {/* 팀 구성 선택 및 경기 생성 */}
        {showPlayerAssignments && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">📋 오늘의 팀 구성</h2>
              <button
                onClick={() => setShowPlayerAssignments(!showPlayerAssignments)}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                {showPlayerAssignments ? '숨기기' : '표시'}
              </button>
            </div>

            {availableTeams.length === 0 ? (
              <p className="text-gray-500">오늘 등록된 팀 구성이 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {/* 팀 구성 목록 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {availableTeams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => {
                        console.log('팀 선택:', team);
                        setSelectedTeam(team);
                      }}
                      className={`text-left border-2 rounded-lg p-4 transition-all ${
                        selectedTeam?.id === team.id
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                      }`}
                    >
                      <div className="font-semibold text-gray-900 mb-1">{team.title}</div>
                      <div className="text-sm text-gray-600">
                        <div>📅 {new Date(team.assignment_date).toLocaleDateString('ko-KR')}</div>
                        <div>🔢 {team.round_number}회차</div>
                        <div>
                          👥 {team.team_type === 'pairs' 
                            ? `${Object.keys(team.pairs_data || {}).length}개 페어`
                            : team.team_type.replace('teams', '팀')}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* 경기 생성 폼 */}
                {selectedTeam && (
                  <div className="border-t pt-4 mt-4">
                    <h3 className="font-semibold mb-3">⚙️ 대회 설정</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      선택된 팀: {selectedTeam.title}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          1인당 경기수
                        </label>
                        <input
                          id="matchesPerPlayer"
                          type="number"
                          min="1"
                          max="10"
                          defaultValue="3"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          경기 타입
                        </label>
                        <select
                          id="matchType"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                          defaultValue="random"
                        >
                          <option value="level_based">🎯 레벨별</option>
                          <option value="random">🎲 랜덤</option>
                          <option value="mixed_doubles">💑 혼복</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const matchesPerPlayer = parseInt((document.getElementById('matchesPerPlayer') as HTMLInputElement)?.value || '3');
                        const matchType = (document.getElementById('matchType') as HTMLSelectElement)?.value || 'random';
                        createTournamentWithMatches(matchesPerPlayer, matchType);
                      }}
                      className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                    >
                      🏆 대회 생성하기
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {/* 대회 선택 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">대회 선택</h2>
        {tournaments.length === 0 ? (
          <p className="text-gray-500">진행 중인 대회가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tournaments.map((tournament) => (
              <button
                key={tournament.id}
                onClick={() => handleSelectTournament(tournament)}
                className={`text-left border-2 rounded-lg p-4 transition-all ${
                  selectedTournament?.id === tournament.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="font-semibold text-gray-900">{tournament.title}</div>
                  {tournament.match_type && (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      tournament.match_type === 'level_based' 
                        ? 'bg-blue-100 text-blue-700'
                        : tournament.match_type === 'mixed_doubles'
                        ? 'bg-pink-100 text-pink-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {tournament.match_type === 'level_based' ? '🎯 레벨별' : tournament.match_type === 'mixed_doubles' ? '💑 혼복' : '🎲 랜덤'}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  <div>📅 {new Date(tournament.tournament_date).toLocaleDateString('ko-KR')}</div>
                  <div>👥 {tournament.total_teams}팀 참가</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 대진표 */}
      {selectedTournament && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-2xl font-bold mb-4">{selectedTournament.title}</h2>
          
          {/* 대회 정보 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-gray-600">날짜:</span>{' '}
                <span className="font-semibold">{new Date(selectedTournament.tournament_date).toLocaleDateString('ko-KR')}</span>
              </div>
              <div>
                <span className="text-gray-600">회차:</span>{' '}
                <span className="font-semibold">{selectedTournament.round_number}회차</span>
              </div>
              <div>
                <span className="text-gray-600">경기 타입:</span>{' '}
                <span className={`font-semibold px-2 py-1 rounded ${
                  selectedTournament.match_type === 'level_based' 
                    ? 'bg-blue-100 text-blue-700'
                    : selectedTournament.match_type === 'mixed_doubles'
                    ? 'bg-pink-100 text-pink-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {selectedTournament.match_type === 'level_based' ? '레벨별' : selectedTournament.match_type === 'mixed_doubles' ? '혼복' : '랜덤'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">참가 팀:</span>{' '}
                <span className="font-semibold">{selectedTournament.total_teams}팀</span>
              </div>
              <div>
                <span className="text-gray-600">1인당 경기:</span>{' '}
                <span className="font-semibold">{selectedTournament.matches_per_player}경기</span>
              </div>
            </div>
          </div>

          {/* 경기 목록 */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">📋 경기 일정 ({matches.length}경기)</h3>
            {matches.length === 0 ? (
              <p className="text-gray-500 text-center py-12">경기가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 bg-white">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-sm">회차</th>
                      <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-sm">라켓팀</th>
                      <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-sm">셔틀팀</th>
                      <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-sm">상태</th>
                      <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-sm">점수</th>
                      <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-sm">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((match, index) => {
                      const isCompleted = match.status === 'completed';
                      const isPending = match.status === 'pending';
                      const team1Score = match.score_team1 || 0;
                      const team2Score = match.score_team2 || 0;

                      return (
                        <tr 
                          key={match.id || `match-${index}`}
                          className={`hover:bg-blue-50 ${isCompleted ? 'bg-green-50' : isPending ? 'bg-gray-50' : 'bg-yellow-50'}`}
                        >
                          <td className="border border-gray-300 px-4 py-3 text-center font-medium text-sm">
                            {index + 1}
                          </td>
                          <td className="border border-gray-300 px-4 py-3 text-center text-blue-700 text-sm">
                            <div className="font-medium">{match.team1.join(', ')}</div>
                          </td>
                          <td className="border border-gray-300 px-4 py-3 text-center text-red-700 text-sm">
                            <div className="font-medium">{match.team2.join(', ')}</div>
                          </td>
                          <td className="border border-gray-300 px-4 py-3 text-center text-sm">
                            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                              isCompleted
                                ? 'bg-green-200 text-green-800'
                                : isPending
                                ? 'bg-gray-200 text-gray-700'
                                : 'bg-yellow-200 text-yellow-800'
                            }`}>
                              {isCompleted ? '✓ 완료' : isPending ? '대기중' : '진행중'}
                            </span>
                          </td>
                          <td className="border border-gray-300 px-4 py-3 text-center text-sm">
                            {isCompleted ? (
                              <div className="font-bold">
                                <span className={`${match.winner === 'team1' ? 'text-blue-600 font-bold text-lg' : 'text-gray-500'}`}>
                                  {team1Score}
                                </span>
                                {' vs '}
                                <span className={`${match.winner === 'team2' ? 'text-red-600 font-bold text-lg' : 'text-gray-500'}`}>
                                  {team2Score}
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="border border-gray-300 px-4 py-3 text-center text-sm">
                            {!isCompleted && editingMatchId === match.id ? (
                              <div className="flex gap-2 justify-center items-center">
                                <input
                                  type="number"
                                  min="0"
                                  defaultValue={team1Score}
                                  id={`score1-${match.id}`}
                                  className="w-12 px-2 py-1 border border-gray-300 rounded text-xs"
                                />
                                <span className="text-xs font-bold">vs</span>
                                <input
                                  type="number"
                                  min="0"
                                  defaultValue={team2Score}
                                  id={`score2-${match.id}`}
                                  className="w-12 px-2 py-1 border border-gray-300 rounded text-xs"
                                />
                                <button
                                  onClick={() => {
                                    const score1Input = document.getElementById(`score1-${match.id}`) as HTMLInputElement;
                                    const score2Input = document.getElementById(`score2-${match.id}`) as HTMLInputElement;
                                    const score1 = parseInt(score1Input.value) || 0;
                                    const score2 = parseInt(score2Input.value) || 0;
                                    updateMatchScore(match.id!, score1, score2);
                                  }}
                                  className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={() => setEditingMatchId(null)}
                                  className="bg-gray-500 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                                >
                                  취소
                                </button>
                              </div>
                            ) : !isCompleted ? (
                              <button
                                onClick={() => setEditingMatchId(match.id!)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium"
                              >
                                입력
                              </button>
                            ) : (
                              <button
                                onClick={() => setEditingMatchId(match.id!)}
                                className="text-xs text-blue-600 hover:text-blue-700 underline"
                              >
                                수정
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 선수별 통계 */}
      {selectedTournament && matches.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">📊 선수별 통계</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">선수명</th>
                  <th className="px-4 py-2 text-center font-semibold">경기수</th>
                  <th className="px-4 py-2 text-center font-semibold">승</th>
                  <th className="px-4 py-2 text-center font-semibold">패</th>
                  <th className="px-4 py-2 text-center font-semibold">무</th>
                  <th className="px-4 py-2 text-center font-semibold">승률</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(getPlayerStats())
                  .sort(([, a], [, b]) => {
                    const winRateA = a.matches > 0 ? a.wins / a.matches : 0;
                    const winRateB = b.matches > 0 ? b.wins / b.matches : 0;
                    return winRateB - winRateA;
                  })
                  .map(([player, stats]) => (
                    <tr key={player} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{player}</td>
                      <td className="px-4 py-2 text-center">{stats.matches}</td>
                      <td className="px-4 py-2 text-center text-green-600 font-semibold">{stats.wins}</td>
                      <td className="px-4 py-2 text-center text-red-600">{stats.losses}</td>
                      <td className="px-4 py-2 text-center text-gray-600">{stats.draws}</td>
                      <td className="px-4 py-2 text-center font-semibold">
                        {stats.matches > 0
                          ? `${((stats.wins / stats.matches) * 100).toFixed(1)}%`
                          : '0%'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </AdminShell>
  );
}
