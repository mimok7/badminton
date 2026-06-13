'use client';

import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Json } from '@/types/supabase';

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
  scheduled_time?: string | null;
  status: string;
  score_team1?: number | null;
  score_team2?: number | null;
  winner?: 'team1' | 'team2' | 'draw' | null;
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
  const supabase = getSupabaseClient();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [availableTeams, setAvailableTeams] = useState<TeamAssignment[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamAssignment | null>(null);
  const [showPlayerAssignments, setShowPlayerAssignments] = useState(true);

  const matchTypeMeta: Record<string, { label: string; badge: string }> = {
    level_based: { label: '레벨별', badge: 'bg-blue-100 text-blue-700' },
    mixed_doubles: { label: '혼복', badge: 'bg-rose-100 text-rose-700' },
    random: { label: '랜덤', badge: 'bg-emerald-100 text-emerald-700' },
  };

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

      const formattedMatches: Match[] = (data || []).map((match) => ({
        ...match,
        scheduled_time: match.scheduled_time || null,
        status: match.status || 'pending',
        score_team1: match.score_team1 ?? null,
        score_team2: match.score_team2 ?? null,
        winner: (match.winner as Match['winner']) ?? null,
      }));

      setMatches(formattedMatches);
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
      const toStringArray = (value: Json | null | undefined): string[] =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

      const toPairsRecord = (value: Json | null | undefined): Record<string, string[]> => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return {};
        }

        return Object.fromEntries(
          Object.entries(value).map(([key, raw]) => [
            key,
            Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [],
          ])
        );
      };

      const formattedTeams: TeamAssignment[] = (data || []).map((team) => ({
        id: team.id,
        round_number: team.round_number,
        assignment_date: team.assignment_date,
        title: team.title,
        team_type: (team.team_type as TeamAssignment['team_type']) || '2teams',
        racket_team: toStringArray(team.racket_team),
        shuttle_team: toStringArray(team.shuttle_team),
        team1: toStringArray(team.team1),
        team2: toStringArray(team.team2),
        team3: toStringArray(team.team3),
        team4: toStringArray(team.team4),
        pairs_data: toPairsRecord(team.pairs_data),
      }));

      setAvailableTeams(formattedTeams);
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
      <div className="app-page">
        <div className="app-page-wide">
          <div className="app-section-card flex min-h-[60vh] items-center justify-center">
            <div className="text-lg font-medium text-slate-600">대회 정보를 불러오는 중입니다...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="app-page-wide space-y-6">
        <section className="app-page-header">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Tournament Center</p>
              <h1 className="app-page-title mt-2">🏆 대회 대진표</h1>
              <p className="app-page-description">
                오늘의 팀 구성을 기반으로 대회를 생성하고, 전체 경기 일정과 점수, 선수별 통계를 한 화면에서 관리합니다.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                <div className="text-xs font-medium text-blue-700">대회 수</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{tournaments.length}</div>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <div className="text-xs font-medium text-emerald-700">선택 경기</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{matches.length}</div>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                <div className="text-xs font-medium text-violet-700">팀 구성</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{availableTeams.length}</div>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                <div className="text-xs font-medium text-amber-700">선택 대회</div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {selectedTournament ? selectedTournament.round_number : '-'}회차
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 팀 구성 선택 및 경기 생성 */}
        {showPlayerAssignments && (
          <section className="app-section-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">📋 오늘의 팀 구성</h2>
                <p className="mt-1 text-sm text-slate-500">당일 등록된 팀을 선택하고 바로 대회를 생성할 수 있습니다.</p>
              </div>
              <button
                onClick={() => setShowPlayerAssignments(!showPlayerAssignments)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
              >
                {showPlayerAssignments ? '숨기기' : '표시'}
              </button>
            </div>

            {availableTeams.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-500">
                오늘 등록된 팀 구성이 없습니다.
              </div>
            ) : (
              <div className="space-y-4">
                {/* 팀 구성 목록 */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {availableTeams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => {
                        console.log('팀 선택:', team);
                        setSelectedTeam(team);
                      }}
                      className={`rounded-3xl border-2 p-5 text-left transition-all ${
                        selectedTeam?.id === team.id
                          ? 'border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-100'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/70'
                      }`}
                    >
                      <div className="mb-1 font-semibold text-slate-900">{team.title}</div>
                      <div className="text-sm text-slate-600">
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
                  <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="mb-3 text-lg font-semibold text-slate-900">⚙️ 대회 설정</h3>
                    <p className="mb-3 text-sm text-slate-600">
                      선택된 팀: {selectedTeam.title}
                    </p>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          1인당 경기수
                        </label>
                        <input
                          id="matchesPerPlayer"
                          type="number"
                          min="1"
                          max="10"
                          defaultValue="3"
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">
                          경기 타입
                        </label>
                        <select
                          id="matchType"
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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
                      className="mt-4 w-full rounded-2xl bg-slate-900 px-6 py-3 font-semibold text-white transition hover:bg-slate-800"
                    >
                      🏆 대회 생성하기
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

      <section className="app-section-card">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold text-slate-900">대회 선택</h2>
          <p className="mt-1 text-sm text-slate-500">저장된 대회 중 하나를 선택해 상세 대진표와 결과를 확인하세요.</p>
        </div>
        {tournaments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-slate-500">
            진행 중인 대회가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tournaments.map((tournament) => (
              <button
                key={tournament.id}
                onClick={() => handleSelectTournament(tournament)}
                className={`rounded-3xl border-2 p-5 text-left transition-all ${
                  selectedTournament?.id === tournament.id
                    ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-100'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/70'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="font-semibold text-slate-900">{tournament.title}</div>
                  {tournament.match_type && (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${matchTypeMeta[tournament.match_type]?.badge || 'bg-slate-100 text-slate-700'}`}>
                      {matchTypeMeta[tournament.match_type]?.label || tournament.match_type}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  <div>📅 {new Date(tournament.tournament_date).toLocaleDateString('ko-KR')}</div>
                  <div>👥 {tournament.total_teams}팀 참가</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 대진표 */}
      {selectedTournament && (
        <section className="app-section-card">
          <h2 className="mb-4 text-2xl font-bold text-slate-900">{selectedTournament.title}</h2>
          
          {/* 대회 정보 */}
          <div className="mb-6 rounded-3xl border border-blue-100 bg-blue-50/90 p-5">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
              <div>
                <span className="text-slate-600">날짜:</span>{' '}
                <span className="font-semibold text-slate-900">{new Date(selectedTournament.tournament_date).toLocaleDateString('ko-KR')}</span>
              </div>
              <div>
                <span className="text-slate-600">회차:</span>{' '}
                <span className="font-semibold text-slate-900">{selectedTournament.round_number}회차</span>
              </div>
              <div>
                <span className="text-slate-600">경기 타입:</span>{' '}
                <span className={`rounded-full px-2.5 py-1 font-semibold ${matchTypeMeta[selectedTournament.match_type]?.badge || 'bg-slate-100 text-slate-700'}`}>
                  {matchTypeMeta[selectedTournament.match_type]?.label || selectedTournament.match_type}
                </span>
              </div>
              <div>
                <span className="text-slate-600">참가 팀:</span>{' '}
                <span className="font-semibold text-slate-900">{selectedTournament.total_teams}팀</span>
              </div>
              <div>
                <span className="text-slate-600">1인당 경기:</span>{' '}
                <span className="font-semibold text-slate-900">{selectedTournament.matches_per_player}경기</span>
              </div>
            </div>
          </div>

          {/* 경기 목록 */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-slate-900">📋 경기 일정 ({matches.length}경기)</h3>
            {matches.length === 0 ? (
              <p className="py-12 text-center text-slate-500">경기가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto rounded-3xl border border-slate-200">
                <table className="w-full border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border-b border-r border-slate-200 px-4 py-3 text-center text-sm font-semibold">회차</th>
                      <th className="border-b border-r border-slate-200 px-4 py-3 text-center text-sm font-semibold">라켓팀</th>
                      <th className="border-b border-r border-slate-200 px-4 py-3 text-center text-sm font-semibold">셔틀팀</th>
                      <th className="border-b border-r border-slate-200 px-4 py-3 text-center text-sm font-semibold">상태</th>
                      <th className="border-b border-r border-slate-200 px-4 py-3 text-center text-sm font-semibold">점수</th>
                      <th className="border-b border-slate-200 px-4 py-3 text-center text-sm font-semibold">관리</th>
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
                          className={`transition hover:bg-blue-50 ${isCompleted ? 'bg-emerald-50/70' : isPending ? 'bg-white' : 'bg-amber-50/70'}`}
                        >
                          <td className="border-b border-r border-slate-200 px-4 py-3 text-center text-sm font-medium">
                            {index + 1}
                          </td>
                          <td className="border-b border-r border-slate-200 px-4 py-3 text-center text-sm text-blue-700">
                            <div className="font-medium">{match.team1.join(', ')}</div>
                          </td>
                          <td className="border-b border-r border-slate-200 px-4 py-3 text-center text-sm text-rose-700">
                            <div className="font-medium">{match.team2.join(', ')}</div>
                          </td>
                          <td className="border-b border-r border-slate-200 px-4 py-3 text-center text-sm">
                            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-800'
                                : isPending
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {isCompleted ? '✓ 완료' : isPending ? '대기중' : '진행중'}
                            </span>
                          </td>
                          <td className="border-b border-r border-slate-200 px-4 py-3 text-center text-sm">
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
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="border-b border-slate-200 px-4 py-3 text-center text-sm">
                            {!isCompleted && editingMatchId === match.id ? (
                              <div className="flex gap-2 justify-center items-center">
                                <input
                                  type="number"
                                  min="0"
                                  defaultValue={team1Score}
                                  id={`score1-${match.id}`}
                                  className="w-12 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                />
                                <span className="text-xs font-bold">vs</span>
                                <input
                                  type="number"
                                  min="0"
                                  defaultValue={team2Score}
                                  id={`score2-${match.id}`}
                                  className="w-12 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                />
                                <button
                                  onClick={() => {
                                    const score1Input = document.getElementById(`score1-${match.id}`) as HTMLInputElement;
                                    const score2Input = document.getElementById(`score2-${match.id}`) as HTMLInputElement;
                                    const score1 = parseInt(score1Input.value) || 0;
                                    const score2 = parseInt(score2Input.value) || 0;
                                    updateMatchScore(match.id!, score1, score2);
                                  }}
                                  className="rounded-lg bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={() => setEditingMatchId(null)}
                                  className="rounded-lg bg-slate-500 px-2 py-1 text-xs text-white hover:bg-slate-600"
                                >
                                  취소
                                </button>
                              </div>
                            ) : !isCompleted ? (
                              <button
                                onClick={() => setEditingMatchId(match.id!)}
                                className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                              >
                                입력
                              </button>
                            ) : (
                              <button
                                onClick={() => setEditingMatchId(match.id!)}
                                className="text-xs text-blue-600 underline hover:text-blue-700"
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
        </section>
      )}

      {/* 선수별 통계 */}
      {selectedTournament && matches.length > 0 && (
        <section className="app-section-card">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">📊 선수별 통계</h2>
          <div className="overflow-x-auto rounded-3xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">선수명</th>
                  <th className="px-4 py-3 text-center font-semibold">경기수</th>
                  <th className="px-4 py-3 text-center font-semibold">승</th>
                  <th className="px-4 py-3 text-center font-semibold">패</th>
                  <th className="px-4 py-3 text-center font-semibold">무</th>
                  <th className="px-4 py-3 text-center font-semibold">승률</th>
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
                    <tr key={player} className="border-t border-slate-200 transition hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{player}</td>
                      <td className="px-4 py-3 text-center">{stats.matches}</td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-600">{stats.wins}</td>
                      <td className="px-4 py-3 text-center text-rose-600">{stats.losses}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{stats.draws}</td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {stats.matches > 0
                          ? `${((stats.wins / stats.matches) * 100).toFixed(1)}%`
                          : '0%'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      </div>
    </div>
  );
}
