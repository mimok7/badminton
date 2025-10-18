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

    const generatedMatches: Match[] = [];
    let matchNumber = 1;

    if (teamAssignment.team_type === 'pairs' && teamAssignment.pairs_data) {
      // 페어 팀 경기 생성
      const pairTeams = Object.entries(teamAssignment.pairs_data).map(([pairName, players]) => ({
        name: pairName,
        players: players
      }));

      // 모든 선수의 경기 수 추적
      const playerMatchCount: Record<string, number> = {};
      pairTeams.forEach(team => {
        team.players.forEach(player => {
          playerMatchCount[player] = 0;
        });
      });

      // 가능한 모든 매치 조합 생성
      const possibleMatches: { team1: string[]; team2: string[]; priority: number }[] = [];
      for (let i = 0; i < pairTeams.length; i++) {
        for (let j = i + 1; j < pairTeams.length; j++) {
          possibleMatches.push({
            team1: pairTeams[i].players,
            team2: pairTeams[j].players,
            priority: 0
          });
        }
      }

      // 경기 선택 (균등 분배)
      while (possibleMatches.length > 0) {
        // 우선순위 계산 (선수들의 경기 수 합이 적을수록 우선)
        possibleMatches.forEach(match => {
          const count1 = match.team1.reduce((sum, p) => sum + (playerMatchCount[p] || 0), 0);
          const count2 = match.team2.reduce((sum, p) => sum + (playerMatchCount[p] || 0), 0);
          match.priority = count1 + count2;
        });

        possibleMatches.sort((a, b) => a.priority - b.priority);
        const selectedMatch = possibleMatches[0];

        // 모든 선수가 충분한 경기를 했는지 확인
        const allPlayersReachedLimit = selectedMatch.team1.every(p => (playerMatchCount[p] || 0) >= matchesPerPlayer) &&
                                        selectedMatch.team2.every(p => (playerMatchCount[p] || 0) >= matchesPerPlayer);
        if (allPlayersReachedLimit) break;

        const courtNumber = ((matchNumber - 1) % 4) + 1;
        generatedMatches.push({
          round: 1,
          match_number: matchNumber++,
          team1: selectedMatch.team1,
          team2: selectedMatch.team2,
          court: `Court ${courtNumber}`,
          status: 'pending' as const
        });

        selectedMatch.team1.forEach(p => playerMatchCount[p]++);
        selectedMatch.team2.forEach(p => playerMatchCount[p]++);
        possibleMatches.shift();
      }
    }

    return generatedMatches;
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matches.map((match, index) => {
                  const isCompleted = match.status === 'completed';
                  const isPending = match.status === 'pending';

                  return (
                    <div
                      key={match.id}
                      className={`border-2 rounded-lg p-4 ${
                        isCompleted
                          ? 'border-green-300 bg-green-50'
                          : isPending
                          ? 'border-gray-300 bg-white'
                          : 'border-yellow-300 bg-yellow-50'
                      }`}
                    >
                      {/* 경기 헤더 */}
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">경기 {match.match_number}</span>
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium ${
                              isCompleted
                                ? 'bg-green-200 text-green-800'
                                : isPending
                                ? 'bg-gray-200 text-gray-700'
                                : 'bg-yellow-200 text-yellow-800'
                            }`}
                          >
                            {isCompleted ? '✓ 완료' : isPending ? '대기중' : '진행중'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">🏟️ {match.court}</div>
                      </div>

                      {/* 팀 vs 팀 */}
                      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center mb-3">
                        {/* 팀 1 */}
                        <div
                          className={`text-center p-3 rounded-lg ${
                            isCompleted && match.winner === 'team1'
                              ? 'bg-blue-100 border-2 border-blue-400'
                              : 'bg-gray-50'
                          }`}
                        >
                          <div className="font-semibold text-blue-700 mb-2">팀 1</div>
                          {match.team1.map((player, i) => (
                            <div key={i} className="text-sm text-gray-800 font-medium">
                              {player}
                            </div>
                          ))}
                          {isCompleted && (
                            <div className="text-2xl font-bold text-blue-600 mt-2">
                              {match.score_team1}
                            </div>
                          )}
                        </div>

                        {/* VS */}
                        <div className="text-2xl font-bold text-gray-400">VS</div>

                        {/* 팀 2 */}
                        <div
                          className={`text-center p-3 rounded-lg ${
                            isCompleted && match.winner === 'team2'
                              ? 'bg-red-100 border-2 border-red-400'
                              : 'bg-gray-50'
                          }`}
                        >
                          <div className="font-semibold text-red-700 mb-2">팀 2</div>
                          {match.team2.map((player, i) => (
                            <div key={i} className="text-sm text-gray-800 font-medium">
                              {player}
                            </div>
                          ))}
                          {isCompleted && (
                            <div className="text-2xl font-bold text-red-600 mt-2">
                              {match.score_team2}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 점수 입력 영역 */}
                      {!isCompleted && editingMatchId === match.id ? (
                        <div className="border-t pt-3">
                          <div className="flex gap-3 items-center justify-center">
                            <div className="flex items-center gap-2">
                              <label className="text-sm font-medium text-gray-700">팀1 점수:</label>
                              <input
                                type="number"
                                min="0"
                                defaultValue={match.score_team1 || 0}
                                id={`score1-${match.id}`}
                                className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-sm font-medium text-gray-700">팀2 점수:</label>
                              <input
                                type="number"
                                min="0"
                                defaultValue={match.score_team2 || 0}
                                id={`score2-${match.id}`}
                                className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                              />
                            </div>
                            <button
                              onClick={() => {
                                const score1Input = document.getElementById(`score1-${match.id}`) as HTMLInputElement;
                                const score2Input = document.getElementById(`score2-${match.id}`) as HTMLInputElement;
                                const score1 = parseInt(score1Input.value) || 0;
                                const score2 = parseInt(score2Input.value) || 0;
                                
                                updateMatchScore(match.id!, score1, score2);
                              }}
                              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                              저장
                            </button>
                            <button
                              onClick={() => setEditingMatchId(null)}
                              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : !isCompleted ? (
                        <div className="text-center mt-3 pt-3 border-t">
                          <button
                            onClick={() => setEditingMatchId(match.id!)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            점수 입력
                          </button>
                        </div>
                      ) : null}

                      {/* 승자 표시 */}
                      {isCompleted && match.winner && (
                        <div className="text-center mt-3 pt-3 border-t">
                          <span className="inline-block bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
                            🏆 {match.winner === 'team1' ? '팀 1' : match.winner === 'team2' ? '팀 2' : '무승부'} 승리!
                          </span>
                          <button
                            onClick={() => setEditingMatchId(match.id!)}
                            className="ml-3 text-xs text-blue-600 hover:text-blue-700 underline"
                          >
                            수정
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
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
