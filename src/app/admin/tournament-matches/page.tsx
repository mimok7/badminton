'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

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

interface Match {
  id?: string;
  tournament_id: string;
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
  team_assignment_id: string;
  team_type: string;
  total_teams: number;
  matches_per_player: number;
  created_at: string;
  matches?: Match[];
}

export default function TournamentMatchesPage() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<TeamAssignment | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [generatedMatches, setGeneratedMatches] = useState<Match[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [tournamentMatches, setTournamentMatches] = useState<Match[]>([]);
  const [showMatchesModal, setShowMatchesModal] = useState(false);
  const [matchesPerPlayer, setMatchesPerPlayer] = useState(3);
  const [tournamentDate, setTournamentDate] = useState(new Date().toISOString().split('T')[0]);
  const [roundNumber, setRoundNumber] = useState(1);
  const [matchType, setMatchType] = useState<'level_based' | 'random' | 'mixed_doubles'>('random');

  useEffect(() => {
    fetchTeamAssignments();
    fetchTournaments();
  }, []);

  // 팀 구성 데이터 가져오기
  const fetchTeamAssignments = async () => {
    try {
      const { data, error } = await supabase
        .from('team_assignments')
        .select('*')
        .order('assignment_date', { ascending: false });

      if (error) throw error;

      setTeamAssignments(data || []);
    } catch (error) {
      console.error('팀 구성 조회 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 대회 목록 가져오기
  const fetchTournaments = async () => {
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error && error.code !== '42P01') throw error;

      setTournaments(data || []);
    } catch (error) {
      console.error('대회 조회 오류:', error);
    }
  };

  // 팀 목록 추출
  const getTeamsFromAssignment = (assignment: TeamAssignment): { name: string; players: string[] }[] => {
    const teams: { name: string; players: string[] }[] = [];

    if (assignment.team_type === '2teams') {
      if (assignment.racket_team && assignment.racket_team.length > 0) {
        teams.push({ name: '라켓팀', players: assignment.racket_team });
      }
      if (assignment.shuttle_team && assignment.shuttle_team.length > 0) {
        teams.push({ name: '셔틀팀', players: assignment.shuttle_team });
      }
    } else if (assignment.team_type === '3teams') {
      if (assignment.team1 && assignment.team1.length > 0) {
        teams.push({ name: '팀1', players: assignment.team1 });
      }
      if (assignment.team2 && assignment.team2.length > 0) {
        teams.push({ name: '팀2', players: assignment.team2 });
      }
      if (assignment.team3 && assignment.team3.length > 0) {
        teams.push({ name: '팀3', players: assignment.team3 });
      }
    } else if (assignment.team_type === '4teams') {
      if (assignment.team1 && assignment.team1.length > 0) {
        teams.push({ name: '팀1', players: assignment.team1 });
      }
      if (assignment.team2 && assignment.team2.length > 0) {
        teams.push({ name: '팀2', players: assignment.team2 });
      }
      if (assignment.team3 && assignment.team3.length > 0) {
        teams.push({ name: '팀3', players: assignment.team3 });
      }
      if (assignment.team4 && assignment.team4.length > 0) {
        teams.push({ name: '팀4', players: assignment.team4 });
      }
    } else if (assignment.team_type === 'pairs' && assignment.pairs_data) {
      Object.entries(assignment.pairs_data).forEach(([pairName, players]) => {
        if (players && players.length > 0) {
          teams.push({ name: pairName, players });
        }
      });
    }

    return teams;
  };

  // 경기 일정 생성 (1인당 경기수 기반)
  const generateMatches = (teams: { name: string; players: string[] }[], teamType: string, matchesPerPlayer: number) => {
    const matches: Match[] = [];
    let matchNumber = 1;

    if (teamType === 'pairs') {
      // 페어 대진표 생성: 모든 선수가 matchesPerPlayer만큼 경기
      const allPlayers = teams.flatMap(team => team.players);
      const playerMatchCount: Record<string, number> = {};
      allPlayers.forEach(p => playerMatchCount[p] = 0);

      // 가능한 모든 페어 매칭
      const possibleMatches: { team1: string[], team2: string[], priority: number }[] = [];
      
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          possibleMatches.push({
            team1: teams[i].players,
            team2: teams[j].players,
            priority: 0 // 나중에 업데이트
          });
        }
      }

      // 경기 선택 (균등 분배)
      while (possibleMatches.length > 0) {
        // 각 매칭의 우선순위 계산 (선수들의 경기 수 합이 적을수록 우선)
        possibleMatches.forEach(match => {
          const count1 = match.team1.reduce((sum, p) => sum + playerMatchCount[p], 0);
          const count2 = match.team2.reduce((sum, p) => sum + playerMatchCount[p], 0);
          match.priority = count1 + count2;
        });

        // 우선순위가 가장 낮은 경기 선택
        possibleMatches.sort((a, b) => a.priority - b.priority);
        const selectedMatch = possibleMatches[0];

        // 모든 선수가 이미 충분한 경기를 했는지 확인
        const allPlayersReachedLimit = selectedMatch.team1.every(p => playerMatchCount[p] >= matchesPerPlayer) &&
                                        selectedMatch.team2.every(p => playerMatchCount[p] >= matchesPerPlayer);
        
        if (allPlayersReachedLimit) break;

        // 경기 추가
        matches.push({
          tournament_id: '',
          round: 1,
          match_number: matchNumber++,
          team1: selectedMatch.team1,
          team2: selectedMatch.team2,
          court: `Court ${((matchNumber - 2) % 4) + 1}`, // 4개 코트 순환
          status: 'pending'
        });

        // 경기 수 업데이트
        selectedMatch.team1.forEach(p => playerMatchCount[p]++);
        selectedMatch.team2.forEach(p => playerMatchCount[p]++);

        // 선택된 매칭 제거
        possibleMatches.shift();
      }

    } else if (teamType === '2teams') {
      // 2팀: 1경기 (라켓 vs 셔틀)
      if (teams.length === 2) {
        matches.push({
          tournament_id: '',
          round: 1,
          match_number: matchNumber++,
          team1: teams[0].players,
          team2: teams[1].players,
          court: 'Court 1',
          status: 'pending'
        });
      }
    } else if (teamType === '3teams') {
      // 3팀: 리그전 (총 3경기)
      matches.push({
        tournament_id: '',
        round: 1,
        match_number: matchNumber++,
        team1: teams[0].players,
        team2: teams[1].players,
        court: 'Court 1',
        status: 'pending'
      });
      matches.push({
        tournament_id: '',
        round: 1,
        match_number: matchNumber++,
        team1: teams[0].players,
        team2: teams[2].players,
        court: 'Court 2',
        status: 'pending'
      });
      matches.push({
        tournament_id: '',
        round: 1,
        match_number: matchNumber++,
        team1: teams[1].players,
        team2: teams[2].players,
        court: 'Court 3',
        status: 'pending'
      });
    } else if (teamType === '4teams') {
      // 4팀: 리그전 (총 6경기)
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          matches.push({
            tournament_id: '',
            round: 1,
            match_number: matchNumber++,
            team1: teams[i].players,
            team2: teams[j].players,
            court: `Court ${matchNumber - 1}`,
            status: 'pending'
          });
        }
      }
    }

    return matches;
  };

  // 대회 생성 및 경기 저장
  const createTournament = async () => {
    if (!selectedAssignment) {
      alert('팀 구성을 선택해주세요.');
      return;
    }

    try {
      const teams = getTeamsFromAssignment(selectedAssignment);
      if (teams.length === 0) {
        alert('선택한 구성에 팀이 없습니다.');
        return;
      }

      const matches = generateMatches(teams, selectedAssignment.team_type, matchesPerPlayer);
      
      // 경기 타입에 따른 대회 제목 생성
      const matchTypeLabel = matchType === 'level_based' ? '레벨별' : matchType === 'mixed_doubles' ? '혼복' : '랜덤';
      const tournamentTitle = `라뚱 대회 ${tournamentDate} ${roundNumber}회차 (${matchTypeLabel})`;
      
      // 대회 정보 저장
      const { data: tournament, error: tournamentError } = await supabase
        .from('tournaments')
        .insert([
          {
            title: tournamentTitle,
            tournament_date: tournamentDate,
            round_number: roundNumber,
            match_type: matchType,
            team_assignment_id: selectedAssignment.id,
            team_type: selectedAssignment.team_type,
            total_teams: teams.length,
            matches_per_player: matchesPerPlayer,
          }
        ])
        .select()
        .single();

      if (tournamentError) throw tournamentError;

      // 경기 일정 저장
      const matchesToSave = matches.map(m => ({
        ...m,
        tournament_id: tournament.id
      }));

      const { error: matchesError } = await supabase
        .from('tournament_matches')
        .insert(matchesToSave);

      if (matchesError) throw matchesError;

      alert('대회가 생성되었습니다!');
      setShowCreateModal(false);
      setSelectedAssignment(null);
      fetchTournaments();
    } catch (error: any) {
      console.error('대회 생성 오류:', error);
      if (error.code === '42P01') {
        alert('tournaments 또는 tournament_matches 테이블이 없습니다. 데이터베이스 스키마를 확인해주세요.');
      } else {
        alert('대회 생성 중 오류가 발생했습니다: ' + error.message);
      }
    }
  };

  // 경기 미리보기
  const handlePreviewMatches = (assignment: TeamAssignment) => {
    const teams = getTeamsFromAssignment(assignment);
    const matches = generateMatches(teams, assignment.team_type, matchesPerPlayer);
    setGeneratedMatches(matches);
    setSelectedAssignment(assignment);
    setShowCreateModal(true);
  };

  // 대회의 경기 목록 가져오기
  const fetchTournamentMatches = async (tournamentId: string) => {
    try {
      const { data, error } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('match_number', { ascending: true });

      if (error) throw error;

      setTournamentMatches(data || []);
    } catch (error) {
      console.error('경기 목록 조회 오류:', error);
    }
  };

  // 경기 관리 모달 열기
  const handleManageMatches = async (tournament: Tournament) => {
    setSelectedTournament(tournament);
    await fetchTournamentMatches(tournament.id);
    setShowMatchesModal(true);
  };

  // 경기 결과 업데이트
  const updateMatchResult = async (matchId: string, scoreTeam1: number, scoreTeam2: number) => {
    try {
      const winner = scoreTeam1 > scoreTeam2 ? 'team1' : scoreTeam2 > scoreTeam1 ? 'team2' : 'draw';
      const status = 'completed';

      const { error } = await supabase
        .from('tournament_matches')
        .update({
          score_team1: scoreTeam1,
          score_team2: scoreTeam2,
          winner,
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', matchId);

      if (error) throw error;

      // 목록 새로고침
      if (selectedTournament) {
        await fetchTournamentMatches(selectedTournament.id);
      }

      alert('경기 결과가 저장되었습니다!');
    } catch (error) {
      console.error('경기 결과 저장 오류:', error);
      alert('경기 결과 저장 중 오류가 발생했습니다.');
    }
  };

  // 경기 삭제
  const deleteTournament = async (tournamentId: string) => {
    if (!confirm('이 대회를 삭제하시겠습니까? 모든 경기 정보가 함께 삭제됩니다.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tournaments')
        .delete()
        .eq('id', tournamentId);

      if (error) throw error;

      alert('대회가 삭제되었습니다.');
      fetchTournaments();
    } catch (error) {
      console.error('대회 삭제 오류:', error);
      alert('대회 삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">🏆 대회 경기 관리</h1>
        <p className="text-gray-600 mt-2">팀 구성을 선택하여 대회 경기 일정을 생성하고 관리합니다</p>
      </div>

      {/* 팀 구성 선택 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">📋 팀 구성 선택</h2>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : teamAssignments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-2">등록된 팀 구성이 없습니다.</p>
            <p className="text-sm">먼저 "팀 관리" 메뉴에서 팀을 구성해주세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamAssignments.map((assignment) => {
              const teams = getTeamsFromAssignment(assignment);
              const teamTypeLabel = {
                '2teams': '2팀전',
                '3teams': '3팀전',
                '4teams': '4팀전',
                'pairs': '페어전'
              }[assignment.team_type] || assignment.team_type;

              return (
                <div
                  key={assignment.id}
                  className="border-2 border-gray-200 rounded-lg p-4 hover:border-blue-400 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{assignment.title}</h3>
                      <p className="text-sm text-gray-600">{assignment.assignment_date}</p>
                    </div>
                    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
                      {teamTypeLabel}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-600 mb-3">
                    <div>👥 총 {teams.length}팀</div>
                    <div>🎯 예상 경기: {generateMatches(teams, assignment.team_type, matchesPerPlayer).length}경기</div>
                  </div>

                  <button
                    onClick={() => handlePreviewMatches(assignment)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    대회 생성
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 경기 미리보기 모달 */}
      {showCreateModal && selectedAssignment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">대회 생성</h2>
              <p className="text-gray-600 mt-1">{selectedAssignment.title}</p>
            </div>

            <div className="p-6">
              {/* 대회 정보 입력 */}
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-lg mb-4 text-blue-900">📋 대회 정보</h3>
                
                {/* 경기 타입 선택 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    경기 타입
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                      matchType === 'level_based' 
                        ? 'border-blue-500 bg-blue-100' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="matchType"
                        value="level_based"
                        checked={matchType === 'level_based'}
                        onChange={(e) => setMatchType(e.target.value as any)}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-semibold text-gray-900">🎯 레벨별</div>
                        <div className="text-xs text-gray-600">실력별 그룹 매칭</div>
                      </div>
                    </label>
                    
                    <label className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                      matchType === 'random' 
                        ? 'border-green-500 bg-green-100' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="matchType"
                        value="random"
                        checked={matchType === 'random'}
                        onChange={(e) => setMatchType(e.target.value as any)}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-semibold text-gray-900">🎲 랜덤</div>
                        <div className="text-xs text-gray-600">무작위 매칭</div>
                      </div>
                    </label>
                    
                    <label className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                      matchType === 'mixed_doubles' 
                        ? 'border-pink-500 bg-pink-100' 
                        : 'border-gray-300 hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="matchType"
                        value="mixed_doubles"
                        checked={matchType === 'mixed_doubles'}
                        onChange={(e) => setMatchType(e.target.value as any)}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-semibold text-gray-900">💑 혼복</div>
                        <div className="text-xs text-gray-600">남녀 혼합 복식</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      대회 날짜
                    </label>
                    <input
                      type="date"
                      value={tournamentDate}
                      onChange={(e) => setTournamentDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      회차
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={roundNumber}
                      onChange={(e) => setRoundNumber(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      1인당 경기수
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={matchesPerPlayer}
                      onChange={(e) => {
                        const newValue = parseInt(e.target.value) || 3;
                        setMatchesPerPlayer(newValue);
                        // 미리보기 업데이트
                        const teams = getTeamsFromAssignment(selectedAssignment);
                        const matches = generateMatches(teams, selectedAssignment.team_type, newValue);
                        setGeneratedMatches(matches);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="mt-3 text-sm text-blue-800">
                  💡 대회명: <strong>라뚱 대회 {tournamentDate} {roundNumber}회차 ({matchType === 'level_based' ? '레벨별' : matchType === 'mixed_doubles' ? '혼복' : '랜덤'})</strong>
                </div>
              </div>

              {/* 팀 목록 */}
              <div className="mb-6">
                <h3 className="font-semibold text-lg mb-3">참가 팀</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {getTeamsFromAssignment(selectedAssignment).map((team, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-3">
                      <div className="font-semibold text-gray-900 mb-2">{team.name}</div>
                      <div className="text-sm text-gray-600 space-y-1">
                        {team.players.map((player, pIdx) => (
                          <div key={pIdx}>• {player}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 경기 일정 */}
              <div className="mb-6">
                <h3 className="font-semibold text-lg mb-3">생성될 경기 ({generatedMatches.length}경기)</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {generatedMatches.map((match, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-gray-900">경기 {match.match_number}</span>
                        <span className="text-sm text-gray-600">{match.court}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 items-center">
                        <div className="text-sm">
                          <div className="font-medium text-blue-600">팀1</div>
                          {match.team1.map((p, i) => (
                            <div key={i} className="text-xs text-gray-600">{p}</div>
                          ))}
                        </div>
                        <div className="text-center text-gray-400 font-bold">VS</div>
                        <div className="text-sm text-right">
                          <div className="font-medium text-red-600">팀2</div>
                          {match.team2.map((p, i) => (
                            <div key={i} className="text-xs text-gray-600">{p}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 버튼 */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setSelectedAssignment(null);
                  }}
                  className="px-6 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={createTournament}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  대회 생성
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 생성된 대회 목록 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">📊 생성된 대회</h2>
        
        {tournaments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-5xl mb-4">🏆</div>
            <p>아직 생성된 대회가 없습니다.</p>
            <p className="text-sm mt-2">위에서 팀 구성을 선택하여 대회를 생성하세요.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tournaments.map((tournament) => (
              <div
                key={tournament.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg text-gray-900">{tournament.title}</h3>
                    <div className="text-sm text-gray-600 mt-1 space-y-1">
                      <div>📅 {new Date(tournament.created_at).toLocaleDateString('ko-KR')}</div>
                      <div>👥 {tournament.total_teams}팀 참가</div>
                      <div>🎯 {tournament.team_type}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleManageMatches(tournament)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      경기 관리
                    </button>
                    <button
                      onClick={() => deleteTournament(tournament.id)}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 안내 */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">💡 사용 방법</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>1. 팀 관리 메뉴에서 팀을 구성합니다</li>
          <li>2. 위 목록에서 원하는 팀 구성을 선택하고 "대회 생성" 버튼을 클릭합니다</li>
          <li>3. 생성될 경기를 미리보기로 확인한 후 대회를 생성합니다</li>
          <li>4. 생성된 대회의 "경기 관리" 버튼으로 경기 결과를 입력할 수 있습니다</li>
        </ul>
      </div>

      {/* 경기 관리 모달 */}
      {showMatchesModal && selectedTournament && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-green-600 to-green-700 text-white p-6">
              <h2 className="text-2xl font-bold">🏆 {selectedTournament.title}</h2>
              <div className="text-green-100 text-sm mt-2 flex gap-4">
                <span>📅 {new Date(selectedTournament.created_at).toLocaleDateString('ko-KR')}</span>
                <span>👥 {selectedTournament.total_teams}팀</span>
                <span>🎯 {selectedTournament.team_type}</span>
                <span>⚡ 총 {tournamentMatches.length}경기</span>
              </div>
            </div>

            {/* 경기 목록 */}
            <div className="flex-1 overflow-y-auto p-6">
              {tournamentMatches.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-5xl mb-4">🎾</div>
                  <p>경기가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tournamentMatches.map((match, index) => {
                    const isCompleted = match.status === 'completed';
                    const isPending = match.status === 'pending';
                    
                    return (
                      <div
                        key={match.id}
                        className={`border-2 rounded-lg p-4 transition-all ${
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
                            <span className="font-bold text-lg text-gray-900">
                              경기 {index + 1}
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              isCompleted 
                                ? 'bg-green-200 text-green-800' 
                                : isPending 
                                ? 'bg-gray-200 text-gray-700' 
                                : 'bg-yellow-200 text-yellow-800'
                            }`}>
                              {isCompleted ? '✓ 완료' : isPending ? '대기중' : '진행중'}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600">
                            🏟️ {match.court || '코트 미정'}
                          </div>
                        </div>

                        {/* 팀 vs 팀 */}
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center mb-4">
                          {/* 팀 1 */}
                          <div className={`text-center p-3 rounded-lg ${
                            isCompleted && match.winner === 'team1' 
                              ? 'bg-blue-100 border-2 border-blue-400' 
                              : 'bg-gray-50'
                          }`}>
                            <div className="font-semibold text-blue-700 mb-2">팀 1</div>
                            {match.team1.map((player, i) => (
                              <div key={i} className="text-sm text-gray-800">{player}</div>
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
                          <div className={`text-center p-3 rounded-lg ${
                            isCompleted && match.winner === 'team2' 
                              ? 'bg-red-100 border-2 border-red-400' 
                              : 'bg-gray-50'
                          }`}>
                            <div className="font-semibold text-red-700 mb-2">팀 2</div>
                            {match.team2.map((player, i) => (
                              <div key={i} className="text-sm text-gray-800">{player}</div>
                            ))}
                            {isCompleted && (
                              <div className="text-2xl font-bold text-red-600 mt-2">
                                {match.score_team2}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 점수 입력 (미완료 경기만) */}
                        {!isCompleted && (
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
                                onClick={async () => {
                                  if (!match.id) return;
                                  const score1Input = document.getElementById(`score1-${match.id}`) as HTMLInputElement;
                                  const score2Input = document.getElementById(`score2-${match.id}`) as HTMLInputElement;
                                  const score1 = parseInt(score1Input.value) || 0;
                                  const score2 = parseInt(score2Input.value) || 0;
                                  
                                  await updateMatchResult(match.id, score1, score2);
                                  await handleManageMatches(selectedTournament); // 새로고침
                                }}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                              >
                                결과 저장
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 승자 표시 (완료된 경기) */}
                        {isCompleted && match.winner && (
                          <div className="text-center mt-2 pt-3 border-t">
                            <span className="inline-block bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full font-semibold">
                              🏆 {match.winner === 'team1' ? '팀 1' : '팀 2'} 승리!
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 푸터 버튼 */}
            <div className="border-t p-4 bg-gray-50 flex justify-end">
              <button
                onClick={() => {
                  setShowMatchesModal(false);
                  setSelectedTournament(null);
                  setTournamentMatches([]);
                }}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
