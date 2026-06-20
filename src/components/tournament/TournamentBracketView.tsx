'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { getKoreaDate } from '@/lib/date';
import { fetchScheduledMatchesForDate, type ScheduledMatchView } from '@/lib/scheduled-matches';
import { getSupabaseClient } from '@/lib/supabase';
import type { Json } from '@/types/supabase';

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

type TournamentBracketViewProps = {
  adminMode?: boolean;
};

export default function TournamentBracketView({ adminMode = false }: TournamentBracketViewProps) {
  const supabase = getSupabaseClient();
  const searchParams = useSearchParams();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [availableTeams, setAvailableTeams] = useState<TeamAssignment[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamAssignment | null>(null);
  const [showPlayerAssignments, setShowPlayerAssignments] = useState(!adminMode);
  const [todayAssignedMatches, setTodayAssignedMatches] = useState<ScheduledMatchView[]>([]);

  const tournamentQueryId = searchParams.get('tournament');

  const matchTypeMeta: Record<string, { label: string; badge: string }> = {
    level_based: { label: '레벨별', badge: 'bg-blue-100 text-blue-700' },
    mixed_doubles: { label: '혼복', badge: 'bg-rose-100 text-rose-700' },
    random: { label: '랜덤', badge: 'bg-emerald-100 text-emerald-700' },
  };

  const getTodayLocal = () => getKoreaDate();

  const fetchTodayAssignedMatches = async () => {
    try {
      const today = getTodayLocal();
      const scheduledMatches = await fetchScheduledMatchesForDate(supabase, today);
      setTodayAssignedMatches(scheduledMatches);
    } catch (error) {
      console.error('오늘 배정 경기 조회 오류:', error);
      setTodayAssignedMatches([]);
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

      setMatches((data || []).map((match) => ({
        ...match,
        scheduled_time: match.scheduled_time || null,
        status: match.status || 'pending',
        score_team1: match.score_team1 ?? null,
        score_team2: match.score_team2 ?? null,
        winner: (match.winner as Match['winner']) ?? null,
      })));
    } catch (error) {
      console.error('경기 조회 오류:', error);
      setMatches([]);
    }
  };

  const handleSelectTournament = async (tournament: Tournament) => {
    setSelectedTournament(tournament);
    await fetchMatches(tournament.id);
  };

  const fetchTournaments = async () => {
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('tournament_date', { ascending: false })
        .order('round_number', { ascending: false });

      if (error && error.code !== '42P01') throw error;

      const tournamentList = data || [];
      setTournaments(tournamentList);

      if (tournamentList.length > 0) {
        const initialTournament = tournamentQueryId
          ? tournamentList.find((tournament) => tournament.id === tournamentQueryId) || tournamentList[0]
          : tournamentList[0];
        await handleSelectTournament(initialTournament);
      }
    } catch (error) {
      console.error('대회 조회 오류:', error);
      setTournaments([]);
    } finally {
      setLoading(false);
    }
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
        if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

        return Object.fromEntries(
          Object.entries(value).map(([key, raw]) => [
            key,
            Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [],
          ])
        );
      };

      setAvailableTeams((data || []).map((team) => ({
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
      })));
    } catch (error) {
      console.error('팀 구성 조회 실패:', error);
      setAvailableTeams([]);
    }
  };

  useEffect(() => {
    void fetchTournaments();
    void fetchAvailableTeams();
    void fetchTodayAssignedMatches();
  }, [tournamentQueryId]);

  const generateMatchesFromTeam = async (teamAssignment: TeamAssignment, matchesPerPlayer: number, matchType: string) => {
    if (!teamAssignment) return [] as Match[];

    const playerList: string[] = [];

    if (teamAssignment.team_type === 'pairs' && teamAssignment.pairs_data) {
      Object.values(teamAssignment.pairs_data).forEach((players) => {
        playerList.push(...(Array.isArray(players) ? players : []));
      });
    } else if (teamAssignment.racket_team && teamAssignment.shuttle_team) {
      playerList.push(...(Array.isArray(teamAssignment.racket_team) ? teamAssignment.racket_team : []));
      playerList.push(...(Array.isArray(teamAssignment.shuttle_team) ? teamAssignment.shuttle_team : []));
    }

    const uniquePlayers = [...new Set(playerList)]
      .filter((player) => player && typeof player === 'string')
      .map((player) => player.trim());

    if (uniquePlayers.length < 4) {
      alert('최소 4명의 선수가 필요합니다.');
      return [];
    }

    const players = uniquePlayers.map((name, index) => ({
      id: `player-${index}-${Date.now()}`,
      name,
      skill_level: 'e2',
      skill_label: 'E2 (초급)',
      skill_code: 'e2',
      gender: 'mixed' as const,
    }));

    let generatedMatches: any[] = [];

    try {
      if (matchType === 'level_based') {
        const { createBalancedDoublesMatches } = await import('@/utils/match-utils');
        generatedMatches = createBalancedDoublesMatches(players, 4, 1);
      } else if (matchType === 'mixed_doubles') {
        const { createMixedAndSameSexDoublesMatches } = await import('@/utils/match-utils');
        generatedMatches = createMixedAndSameSexDoublesMatches(players, 4, 1);
      } else {
        const { createRandomBalancedDoublesMatches } = await import('@/utils/match-utils');
        generatedMatches = createRandomBalancedDoublesMatches(players, 4, 1);
      }
    } catch (error) {
      console.error('경기 생성 함수 로드 오류:', error);
      return [];
    }

    const finalMatches: Match[] = [];
    const maxRounds = Math.max(1, matchesPerPlayer);
    let currentMatchNumber = 1;
    let roundIndex = 0;

    for (let round = 1; round <= maxRounds; round += 1) {
      const matchesPerRound = Math.ceil(uniquePlayers.length / 4);

      for (let index = 0; index < matchesPerRound; index += 1) {
        if (roundIndex >= generatedMatches.length) {
          const shuffled = [...uniquePlayers].sort(() => Math.random() - 0.5);

          for (let shuffleIndex = 0; shuffleIndex < shuffled.length - 3; shuffleIndex += 4) {
            const group = shuffled.slice(shuffleIndex, shuffleIndex + 4);
            if (group.length !== 4) continue;

            const team1 = [group[0], group[1]];
            const team2 = [group[2], group[3]];
            const courtNumber = ((currentMatchNumber - 1) % 4) + 1;

            finalMatches.push({
              round,
              match_number: currentMatchNumber,
              team1,
              team2,
              court: `Court ${courtNumber}`,
              status: 'pending',
            });
            currentMatchNumber += 1;
          }

          break;
        }

        const match = generatedMatches[roundIndex];
        const courtNumber = ((currentMatchNumber - 1) % 4) + 1;

        finalMatches.push({
          round,
          match_number: currentMatchNumber,
          team1: match.team1.map((player: any) => player.name || player),
          team2: match.team2.map((player: any) => player.name || player),
          court: `Court ${courtNumber}`,
          status: 'pending',
        });

        currentMatchNumber += 1;
        roundIndex += 1;
      }
    }

    return finalMatches;
  };

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
          matches_per_player: matchesPerPlayer,
        })
        .select()
        .single();

      if (tournamentError) throw tournamentError;

      const matchesToInsert = generatedMatches.map((match) => ({
        ...match,
        tournament_id: tournamentData.id,
      }));

      const { error: matchesError } = await supabase.from('tournament_matches').insert(matchesToInsert);
      if (matchesError) throw matchesError;

      alert(`대회가 생성되었습니다! (${generatedMatches.length}개 경기)`);
      await fetchTournaments();
      setSelectedTeam(null);
    } catch (error) {
      console.error('대회 생성 오류:', error);
      alert('대회 생성 중 오류가 발생했습니다.');
    }
  };

  const updateMatchScore = async (matchId: string, scoreTeam1: number, scoreTeam2: number) => {
    try {
      const winner = scoreTeam1 > scoreTeam2 ? 'team1' : scoreTeam2 > scoreTeam1 ? 'team2' : 'draw';

      const { error } = await supabase
        .from('tournament_matches')
        .update({
          score_team1: scoreTeam1,
          score_team2: scoreTeam2,
          winner,
          status: 'completed',
        })
        .eq('id', matchId);

      if (error) throw error;

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

  const getPlayerStats = () => {
    const playerStats: Record<string, { matches: number; wins: number; losses: number; draws: number }> = {};

    matches.forEach((match) => {
      if (match.status !== 'completed') return;

      match.team1.forEach((player) => {
        if (!playerStats[player]) {
          playerStats[player] = { matches: 0, wins: 0, losses: 0, draws: 0 };
        }
        playerStats[player].matches += 1;
        if (match.winner === 'team1') playerStats[player].wins += 1;
        else if (match.winner === 'team2') playerStats[player].losses += 1;
        else playerStats[player].draws += 1;
      });

      match.team2.forEach((player) => {
        if (!playerStats[player]) {
          playerStats[player] = { matches: 0, wins: 0, losses: 0, draws: 0 };
        }
        playerStats[player].matches += 1;
        if (match.winner === 'team2') playerStats[player].wins += 1;
        else if (match.winner === 'team1') playerStats[player].losses += 1;
        else playerStats[player].draws += 1;
      });
    });

    return playerStats;
  };

  if (loading) {
    return (
      <div className={`flex min-h-screen items-center justify-center px-4 ${adminMode ? 'bg-gray-50' : 'bg-[#f5f7fb]'}`}>
        <div className="rounded-full bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">대진표를 불러오는 중입니다</div>
      </div>
    );
  }

  const containerClassName = adminMode
    ? 'mx-auto flex w-full max-w-7xl flex-col gap-6 px-2 py-2'
    : 'mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5';

  const title = adminMode ? '관리자 대진표' : '🏆 대회 대진표';
  const description = adminMode
    ? '관리자는 큰 화면에서 팀 구성, 대회 생성, 경기 결과를 한 번에 관리할 수 있습니다.'
    : '오늘의 팀 구성을 기반으로 대회를 확인하고, 경기 결과와 선수를 모바일에서 보기 쉽게 관리합니다.';
  const homeHref = adminMode ? '/admin' : '/dashboard';
  const homeLabel = adminMode ? '관리자 홈' : '홈';

  return (
    <div className={`min-h-screen ${adminMode ? 'bg-gray-50 text-slate-900' : 'bg-[#f5f7fb] text-slate-900'}`}>
      <div className={containerClassName}>
        <section className={`${adminMode ? 'rounded-[32px] border border-slate-200 bg-white px-6 py-6 shadow-sm' : 'rounded-[28px] bg-[#0f172a] px-4 py-5 text-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.85)] sm:px-5 sm:py-6'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-xs ${adminMode ? 'text-slate-500' : 'text-slate-300'}`}>{adminMode ? 'Admin Tournament Center' : 'Tournament Center'}</p>
              <h1 className={`mt-1 ${adminMode ? 'text-3xl font-bold text-slate-900' : 'text-2xl font-semibold'}`}>{title}</h1>
              <p className={`mt-2 text-sm leading-6 ${adminMode ? 'max-w-3xl text-slate-600' : 'text-slate-300'}`}>{description}</p>
            </div>
            <Link
              href={homeHref}
              className={`rounded-full px-3 py-2 text-sm font-medium transition ${adminMode ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white/10 text-white hover:bg-white/15'}`}
            >
              {homeLabel}
            </Link>
          </div>

          <div className={`mt-5 grid gap-3 text-center ${adminMode ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-4 gap-2'}`}>
            <div className={`${adminMode ? 'rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4' : 'rounded-2xl bg-white/8 px-2 py-3'}`}>
              <p className={`text-[11px] ${adminMode ? 'text-slate-500' : 'text-slate-300'}`}>대회 수</p>
              <p className={`mt-1 ${adminMode ? 'text-2xl font-bold text-slate-900' : 'text-lg font-semibold'}`}>{tournaments.length}</p>
            </div>
            <div className={`${adminMode ? 'rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4' : 'rounded-2xl bg-white/8 px-2 py-3'}`}>
              <p className={`text-[11px] ${adminMode ? 'text-slate-500' : 'text-slate-300'}`}>경기 수</p>
              <p className={`mt-1 ${adminMode ? 'text-2xl font-bold text-slate-900' : 'text-lg font-semibold'}`}>{matches.length}</p>
            </div>
            <div className={`${adminMode ? 'rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4' : 'rounded-2xl bg-white/8 px-2 py-3'}`}>
              <p className={`text-[11px] ${adminMode ? 'text-slate-500' : 'text-slate-300'}`}>팀 구성</p>
              <p className={`mt-1 ${adminMode ? 'text-2xl font-bold text-slate-900' : 'text-lg font-semibold'}`}>{availableTeams.length}</p>
            </div>
            <div className={`${adminMode ? 'rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4' : 'rounded-2xl bg-white/8 px-2 py-3'}`}>
              <p className={`text-[11px] ${adminMode ? 'text-slate-500' : 'text-slate-300'}`}>회차</p>
              <p className={`mt-1 ${adminMode ? 'text-2xl font-bold text-slate-900' : 'text-lg font-semibold'}`}>{selectedTournament ? selectedTournament.round_number : '-'}</p>
            </div>
          </div>
        </section>

        <div className={adminMode ? 'grid gap-6 xl:grid-cols-[1.15fr_0.85fr]' : 'space-y-4'}>
          <div className="space-y-4">
            {showPlayerAssignments && (
              <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">오늘의 팀 구성</p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">대회 생성용 팀</h2>
                    <p className="mt-1 text-sm text-slate-500">선택한 팀으로 대회를 생성합니다.</p>
                  </div>
                  <button
                    onClick={() => setShowPlayerAssignments(false)}
                    className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600"
                  >
                    숨기기
                  </button>
                </div>

                {availableTeams.length === 0 ? (
                  <div className="mt-4 rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    오늘 등록된 팀 구성이 없습니다.
                  </div>
                ) : (
                  <div className={`mt-4 ${adminMode ? 'grid gap-3 md:grid-cols-2' : 'space-y-3'}`}>
                    {availableTeams.map((team) => (
                      <button
                        key={team.id}
                        onClick={() => setSelectedTeam(team)}
                        className={`w-full rounded-[24px] border p-4 text-left transition-all ${
                          selectedTeam?.id === team.id
                            ? 'border-emerald-500 bg-emerald-50 shadow-[0_14px_34px_-18px_rgba(16,185,129,0.55)]'
                            : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-slate-900">{team.title}</div>
                            <div className="mt-1 space-y-1 text-sm text-slate-600">
                              <div>📅 {new Date(team.assignment_date).toLocaleDateString('ko-KR')}</div>
                              <div>🔢 {team.round_number}회차</div>
                            </div>
                          </div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
                            {team.team_type === 'pairs' ? `${Object.keys(team.pairs_data || {}).length}개 페어` : team.team_type.replace('teams', '팀')}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedTeam && (
                  <div className="mt-4 rounded-[24px] border border-slate-200 bg-white p-4">
                    <h3 className="text-base font-semibold text-slate-900">대회 설정</h3>
                    <p className="mt-1 text-sm text-slate-600">선택된 팀: {selectedTeam.title}</p>
                    <div className={`mt-4 grid gap-4 ${adminMode ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">1인당 경기수</label>
                        <input
                          id={`${adminMode ? 'admin' : 'user'}-matchesPerPlayer`}
                          type="number"
                          min="1"
                          max="10"
                          defaultValue="3"
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700">경기 타입</label>
                        <select
                          id={`${adminMode ? 'admin' : 'user'}-matchType`}
                          defaultValue="random"
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                        >
                          <option value="level_based">🎯 레벨별</option>
                          <option value="random">🎲 랜덤</option>
                          <option value="mixed_doubles">💑 혼복</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const matchesPerPlayer = parseInt((document.getElementById(`${adminMode ? 'admin' : 'user'}-matchesPerPlayer`) as HTMLInputElement)?.value || '3', 10);
                        const matchType = (document.getElementById(`${adminMode ? 'admin' : 'user'}-matchType`) as HTMLSelectElement)?.value || 'random';
                        void createTournamentWithMatches(matchesPerPlayer, matchType);
                      }}
                      className={`mt-4 w-full rounded-2xl px-6 py-3 font-semibold text-white transition ${adminMode ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#0f172a] hover:bg-slate-800'}`}
                    >
                      대회 생성하기
                    </button>
                  </div>
                )}
              </section>
            )}

            {!showPlayerAssignments && (
              <button
                onClick={() => setShowPlayerAssignments(true)}
                className="rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm"
              >
                팀 구성 표시
              </button>
            )}

            <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
              <div className="mb-4">
                <p className="text-xs text-slate-500">오늘 배정 경기</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">일반 경기 대진표</h2>
                <p className="mt-1 text-sm text-slate-500">관리자가 오늘 배정한 일반 경기를 여기서 함께 확인할 수 있습니다.</p>
              </div>

              {todayAssignedMatches.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  오늘 배정된 일반 경기가 없습니다.
                </div>
              ) : (
                <div className={`gap-3 ${adminMode ? 'grid md:grid-cols-2' : 'space-y-3'}`}>
                  {todayAssignedMatches.map((match, index) => (
                    <article key={match.id} className="rounded-[24px] border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">배정 경기 #{index + 1}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            코트 {match.court_number || '미정'} · {match.match_time || '시간 미정'}
                          </p>
                        </div>
                        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {match.status}
                        </span>
                      </div>

                      <div className="mt-4 space-y-2 text-sm">
                        <div className="rounded-2xl bg-white px-3 py-3 text-slate-800">
                          <span className="text-xs font-medium text-blue-600">라켓팀</span>
                          <div className="mt-1 font-medium">
                            {match.team1_player1_name}, {match.team1_player2_name}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-3 text-slate-800">
                          <span className="text-xs font-medium text-rose-600">셔틀팀</span>
                          <div className="mt-1 font-medium">
                            {match.team2_player1_name}, {match.team2_player2_name}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
              <div className="mb-4">
                <p className="text-xs text-slate-500">대회 선택</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">저장된 대회</h2>
                <p className="mt-1 text-sm text-slate-500">선택하면 아래 대진표가 표시됩니다.</p>
              </div>

              {tournaments.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  진행 중인 대회가 없습니다.
                </div>
              ) : (
                <div className={`space-y-3 ${adminMode ? 'max-h-[520px] overflow-y-auto pr-1' : ''}`}>
                  {tournaments.map((tournament) => (
                    <button
                      key={tournament.id}
                      onClick={() => {
                        void handleSelectTournament(tournament);
                      }}
                      className={`w-full rounded-[24px] border-2 p-4 text-left transition-all ${
                        selectedTournament?.id === tournament.id
                          ? 'border-blue-500 bg-blue-50 shadow-[0_14px_34px_-18px_rgba(59,130,246,0.45)]'
                          : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{tournament.title}</div>
                          <div className="mt-1 text-sm text-slate-600">
                            <div>📅 {new Date(tournament.tournament_date).toLocaleDateString('ko-KR')}</div>
                            <div>👥 {tournament.total_teams}팀 참가</div>
                          </div>
                        </div>
                        {tournament.match_type && (
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${matchTypeMeta[tournament.match_type]?.badge || 'bg-slate-100 text-slate-700'}`}>
                            {matchTypeMeta[tournament.match_type]?.label || tournament.match_type}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {selectedTournament && (
            <div className="space-y-6">
              <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                <div className="mb-4">
                  <p className="text-xs text-slate-500">선택 대회</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{selectedTournament.title}</h2>
                </div>

                <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                  <div className={`grid gap-3 text-sm ${adminMode ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
                    <div>
                      <span className="text-slate-500">날짜</span>
                      <div className="mt-1 font-semibold text-slate-900">{new Date(selectedTournament.tournament_date).toLocaleDateString('ko-KR')}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">회차</span>
                      <div className="mt-1 font-semibold text-slate-900">{selectedTournament.round_number}회차</div>
                    </div>
                    <div>
                      <span className="text-slate-500">경기 타입</span>
                      <div className={`mt-1 inline-flex rounded-full px-2.5 py-1 font-semibold ${matchTypeMeta[selectedTournament.match_type]?.badge || 'bg-slate-100 text-slate-700'}`}>
                        {matchTypeMeta[selectedTournament.match_type]?.label || selectedTournament.match_type}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">참가 팀</span>
                      <div className="mt-1 font-semibold text-slate-900">{selectedTournament.total_teams}팀</div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-slate-700">1인당 경기 {selectedTournament.matches_per_player}경기</div>
                </div>
              </section>

              <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                <div className="mb-4">
                  <p className="text-xs text-slate-500">경기 일정</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">대진표 ({matches.length}경기)</h3>
                </div>
                {matches.length === 0 ? (
                  <p className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-500">경기가 없습니다.</p>
                ) : (
                  <div className={`gap-4 ${adminMode ? 'grid md:grid-cols-2 2xl:grid-cols-3' : 'space-y-3'}`}>
                    {matches.map((match, index) => {
                      const isCompleted = match.status === 'completed';
                      const isPending = match.status === 'pending';
                      const team1Score = match.score_team1 || 0;
                      const team2Score = match.score_team2 || 0;

                      return (
                        <article key={match.id || `match-view-${index}`} className={`rounded-[24px] border p-4 ${isCompleted ? 'border-emerald-200 bg-emerald-50/70' : isPending ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/70'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{index + 1}회차</p>
                              <p className="mt-1 text-xs text-slate-500">코트 {match.court}</p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isCompleted ? 'bg-emerald-100 text-emerald-800' : isPending ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>
                              {isCompleted ? '완료' : isPending ? '대기중' : '진행중'}
                            </span>
                          </div>

                          <div className="mt-4 space-y-2 text-sm">
                            <div className="rounded-2xl bg-white px-3 py-3 text-slate-800">
                              <span className="text-xs font-medium text-blue-600">라켓팀</span>
                              <div className="mt-1 font-medium">{match.team1.join(', ')}</div>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3 text-slate-800">
                              <span className="text-xs font-medium text-rose-600">셔틀팀</span>
                              <div className="mt-1 font-medium">{match.team2.join(', ')}</div>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3">
                            <div className="text-sm text-slate-600">점수</div>
                            <div className="font-bold text-slate-900">
                              {isCompleted ? (
                                <>
                                  <span className={`${match.winner === 'team1' ? 'text-blue-600 text-lg' : 'text-slate-500'}`}>{team1Score}</span>
                                  <span className="px-2 text-slate-400">vs</span>
                                  <span className={`${match.winner === 'team2' ? 'text-red-600 text-lg' : 'text-slate-500'}`}>{team2Score}</span>
                                </>
                              ) : (
                                '-'
                              )}
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {!isCompleted && editingMatchId === match.id ? (
                              <div className="flex w-full flex-wrap items-center gap-2">
                                <input type="number" min="0" defaultValue={team1Score} id={`score1-${match.id}`} className="w-16 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                                <span className="text-sm font-bold text-slate-500">vs</span>
                                <input type="number" min="0" defaultValue={team2Score} id={`score2-${match.id}`} className="w-16 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                                <button
                                  onClick={() => {
                                    const score1Input = document.getElementById(`score1-${match.id}`) as HTMLInputElement;
                                    const score2Input = document.getElementById(`score2-${match.id}`) as HTMLInputElement;
                                    const score1 = parseInt(score1Input.value, 10) || 0;
                                    const score2 = parseInt(score2Input.value, 10) || 0;
                                    void updateMatchScore(match.id!, score1, score2);
                                  }}
                                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
                                >
                                  저장
                                </button>
                                <button onClick={() => setEditingMatchId(null)} className="rounded-xl bg-slate-500 px-3 py-2 text-sm text-white hover:bg-slate-600">
                                  취소
                                </button>
                              </div>
                            ) : !isCompleted ? (
                              <button onClick={() => setEditingMatchId(match.id!)} className={`rounded-xl px-4 py-2 text-sm font-medium text-white ${adminMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-[#0f172a] hover:bg-slate-800'}`}>
                                입력
                              </button>
                            ) : (
                              <button onClick={() => setEditingMatchId(match.id!)} className="rounded-xl px-4 py-2 text-sm font-medium text-blue-600 underline hover:text-blue-700">
                                수정
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {matches.length > 0 && (
                <section className="rounded-[24px] bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5">
                  <div className="mb-4">
                    <p className="text-xs text-slate-500">선수별 통계</p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">경기 결과</h2>
                  </div>

                  <div className={`gap-3 ${adminMode ? 'grid md:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}`}>
                    {Object.entries(getPlayerStats())
                      .sort(([, left], [, right]) => {
                        const leftWinRate = left.matches > 0 ? left.wins / left.matches : 0;
                        const rightWinRate = right.matches > 0 ? right.wins / right.matches : 0;
                        return rightWinRate - leftWinRate;
                      })
                      .map(([player, stats]) => (
                        <article key={player} className="rounded-[24px] border border-slate-200 bg-slate-50/60 px-4 py-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-slate-900">{player}</p>
                              <p className="mt-1 text-xs text-slate-500">승률 {stats.matches > 0 ? `${((stats.wins / stats.matches) * 100).toFixed(1)}%` : '0%'}</p>
                            </div>
                            <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">{stats.matches}경기</div>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                            <div className="rounded-2xl bg-emerald-50 px-2 py-3">
                              <p className="text-[11px] text-emerald-700">승</p>
                              <p className="mt-1 font-semibold text-emerald-700">{stats.wins}</p>
                            </div>
                            <div className="rounded-2xl bg-rose-50 px-2 py-3">
                              <p className="text-[11px] text-rose-700">패</p>
                              <p className="mt-1 font-semibold text-rose-700">{stats.losses}</p>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-2 py-3">
                              <p className="text-[11px] text-slate-500">무</p>
                              <p className="mt-1 font-semibold text-slate-700">{stats.draws}</p>
                            </div>
                          </div>
                        </article>
                      ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
